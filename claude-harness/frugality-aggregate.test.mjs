import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createSeededGenerator,
  percentileRanks,
  bootstrapPercentileInterval,
  relativeReduction,
  validateAggregationParameters,
  aggregateFrugalityLedger
} from "./frugality-aggregate.mjs";
import { unbiasedBelow, assertNonZeroState } from "./frugality-bootstrap.mjs";

const referenceFixturePath = resolve(import.meta.dirname, "fixtures/xoshiro128starstar.reference.json");
const referenceFixture = JSON.parse(readFileSync(referenceFixturePath, "utf8"));

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

test("createSeededGenerator matches the reference C implementation's first 16 outputs", () => {
  const generator = createSeededGenerator("harness-comparison frugality reference vector");
  const outputs = [];
  for (let i = 0; i < 16; i++) outputs.push(generator.nextUint32());
  assert.deepEqual(outputs, referenceFixture.outputs);
});

test("createSeededGenerator refuses a non-string or empty seed", () => {
  assert.throws(() => createSeededGenerator(""), /non-empty string/);
  assert.throws(() => createSeededGenerator(42), /non-empty string/);
});

test("assertNonZeroState refuses the all-zero state (xoshiro128**'s only forbidden state)", () => {
  assert.throws(() => assertNonZeroState([0, 0, 0, 0]), /all-zero/);
  assert.doesNotThrow(() => assertNonZeroState([0, 0, 0, 1]));
});

test("nextBelow(n) always returns a value in [0, n)", () => {
  const generator = createSeededGenerator("range-test-seed");
  for (const n of [1, 2, 3, 7, 100, 1000]) {
    for (let i = 0; i < 50; i++) {
      const value = generator.nextBelow(n);
      assert.ok(value >= 0 && value < n, `nextBelow(${n}) returned ${value}`);
    }
  }
});

test("unbiasedBelow's rejection threshold matches Lemire Algorithm 3 (2^32 mod n) for hand-picked n", () => {
  // source: 2**32 % n is the same formula frugality-bootstrap.mjs's
  // unbiasedBelow computes (Lemire 2019 Algorithm 3, §3.1, verified from the
  // arXiv preprint p.4: t = (2^L - s) mod s = 2^L mod s for s <= 2^L).
  const cases = [
    { n: 3, threshold: 1 },
    { n: 4, threshold: 0 },
    { n: 5, threshold: 1 },
    { n: 6, threshold: 4 }
  ];
  for (const { n, threshold } of cases) {
    assert.equal((2 ** 32) % n, threshold, `sanity: 2**32 % ${n}`);
    if (threshold > 0) {
      const draws = [threshold - 1, threshold]; // first draw must be rejected, second accepted
      let i = 0;
      const result = unbiasedBelow(n, () => draws[i++]);
      assert.equal(i, 2, `n=${n}: expected exactly one rejection`);
      assert.equal(result, threshold % n);
    } else {
      const draws = [7]; // threshold 0: nothing is ever rejected
      let i = 0;
      const result = unbiasedBelow(n, () => draws[i++]);
      assert.equal(i, 1, `n=${n}: expected zero rejections when threshold is 0`);
      assert.equal(result, 7 % n);
    }
  }
});

// ---------------------------------------------------------------------------
// percentileRanks
// ---------------------------------------------------------------------------

// alpha is asserted with assert.ok + a tolerance, not assert.deepEqual: `1 -
// confidenceLevel` carries ordinary IEEE-754 rounding (e.g. 1 - 0.95 =
// 0.050000000000000044 in Node v24.7.0), which is irrelevant to correctness
// since only lowerRank/upperRank are load-bearing downstream.
function assertRanks(actual, { alpha, lowerRank, upperRank }) {
  assert.ok(Math.abs(actual.alpha - alpha) < 1e-9, `alpha: expected ~${alpha}, got ${actual.alpha}`);
  assert.equal(actual.lowerRank, lowerRank);
  assert.equal(actual.upperRank, upperRank);
}

test("percentileRanks: B=1999, 0.95 -> k=50, upper=1950", () => {
  assertRanks(percentileRanks({ replicates: 1999, confidenceLevel: 0.95 }), { alpha: 0.05, lowerRank: 50, upperRank: 1950 });
});

test("percentileRanks: B=999, 0.95 -> k=25, upper=975", () => {
  assertRanks(percentileRanks({ replicates: 999, confidenceLevel: 0.95 }), { alpha: 0.05, lowerRank: 25, upperRank: 975 });
});

test("percentileRanks: B=1000, 0.95 -> refused (non-integer rank)", () => {
  assert.throws(() => percentileRanks({ replicates: 1000, confidenceLevel: 0.95 }), /is not an integer/);
});

test("percentileRanks: B=19, 0.90 -> k=1, upper=19", () => {
  assertRanks(percentileRanks({ replicates: 19, confidenceLevel: 0.9 }), { alpha: 0.1, lowerRank: 1, upperRank: 19 });
});

// ---------------------------------------------------------------------------
// bootstrapPercentileInterval
// ---------------------------------------------------------------------------

test("bootstrapPercentileInterval bounds are exactly the min and max of the 19 sorted replicate stats (B=19, 0.90)", () => {
  const recorded = [];
  const spyStatistic = (t, c) => {
    const value = relativeReduction(t, c);
    recorded.push(value);
    return value;
  };
  const interval = bootstrapPercentileInterval({
    samples: { treatment: [1, 2, 3], control: [4, 5, 6] },
    statistic: spyStatistic,
    replicates: 19,
    confidenceLevel: 0.9,
    generator: createSeededGenerator("bounds-test-seed")
  });
  // spyStatistic's first call is the point estimate on the unresampled
  // samples; the remaining 19 calls are the bootstrap replicates.
  const replicateOnly = recorded.slice(1).sort((a, b) => a - b);
  assert.equal(interval.ranks.lower, 1);
  assert.equal(interval.ranks.upper, 19);
  assert.equal(interval.lower, replicateOnly[0]);
  assert.equal(interval.upper, replicateOnly[18]);
});

test("bootstrapPercentileInterval: the interval contains the point estimate for a well-behaved sample (not a general guarantee of the percentile method)", () => {
  // The percentile method does not mathematically guarantee containment of
  // the point estimate in general (the bootstrap distribution's median can
  // differ from the plug-in estimate for skewed statistics — Efron &
  // Tibshirani 1993 ch. 13 discusses this as motivation for the
  // bias-corrected variants). This test demonstrates containment holding
  // for a symmetric, low-variance sample; it is not evidence of a general
  // property.
  const interval = bootstrapPercentileInterval({
    samples: { treatment: [10, 12, 11, 9, 13, 10, 11], control: [20, 19, 21, 20, 18, 22, 20] },
    statistic: relativeReduction,
    replicates: 999,
    confidenceLevel: 0.95,
    generator: createSeededGenerator("containment-test-seed")
  });
  assert.ok(interval.lower <= interval.estimate && interval.estimate <= interval.upper, `expected ${interval.lower} <= ${interval.estimate} <= ${interval.upper}`);
});

test("bootstrapPercentileInterval: constant samples collapse to lower === upper === estimate", () => {
  const interval = bootstrapPercentileInterval({
    samples: { treatment: [5, 5, 5], control: [10, 10, 10] },
    statistic: relativeReduction,
    replicates: 19,
    confidenceLevel: 0.9,
    generator: createSeededGenerator("constant-seed")
  });
  assert.equal(interval.estimate, 0.5);
  assert.equal(interval.lower, 0.5);
  assert.equal(interval.upper, 0.5);
  assert.equal(interval.degenerate, false, "n=3 >= 2 on both sides — constant values are a data property, not a sample-size property");
});

test("bootstrapPercentileInterval: degenerate is true when either sample has fewer than 2 observations", () => {
  const interval = bootstrapPercentileInterval({
    samples: { treatment: [5], control: [10, 12] },
    statistic: relativeReduction,
    replicates: 19,
    confidenceLevel: 0.9,
    generator: createSeededGenerator("degenerate-seed")
  });
  assert.equal(interval.degenerate, true);
});

// ---------------------------------------------------------------------------
// relativeReduction
// ---------------------------------------------------------------------------

test("relativeReduction: 1 - mean(treatment) / mean(control)", () => {
  assert.equal(relativeReduction([70], [100]), 1 - 70 / 100);
});

test("relativeReduction throws naming both means when mean(control) is 0", () => {
  assert.throws(() => relativeReduction([5], [0]), /mean\(control\) is 0/);
});

// ---------------------------------------------------------------------------
// validateAggregationParameters
// ---------------------------------------------------------------------------

function validParameters(overrides = {}) {
  return {
    schemaVersion: "frugality-aggregation-parameters/v1",
    control_harness: "C",
    confidence_level: 0.9,
    bootstrap_replicates: 19,
    seed: "params-test-seed",
    stage: "pilot",
    declared_n_per_cell: null,
    metrics: ["tokens_inference"],
    ...overrides
  };
}

test("validateAggregationParameters accepts a well-formed pilot-stage document", () => {
  assert.deepEqual(validateAggregationParameters(validParameters()), validParameters());
});

test("validateAggregationParameters names every missing/invalid field", () => {
  assert.throws(
    () => validateAggregationParameters({}),
    (error) =>
      error.message.includes("schemaVersion") &&
      error.message.includes("control_harness") &&
      error.message.includes("confidence_level") &&
      error.message.includes("bootstrap_replicates") &&
      error.message.includes("seed") &&
      error.message.includes("stage") &&
      error.message.includes("metrics")
  );
});

test('validateAggregationParameters refuses stage "scored" with declared_n_per_cell: null', () => {
  assert.throws(
    () => validateAggregationParameters(validParameters({ stage: "scored", declared_n_per_cell: null })),
    (error) => error.message.includes("declared_n_per_cell")
  );
});

test("validateAggregationParameters accepts stage scored with a valid declared_n_per_cell", () => {
  const parameters = validParameters({ stage: "scored", declared_n_per_cell: 5 });
  assert.deepEqual(validateAggregationParameters(parameters), parameters);
});

test("validateAggregationParameters refuses an unknown metric", () => {
  assert.throws(
    () => validateAggregationParameters(validParameters({ metrics: ["tokens_inference", "not_a_real_metric"] })),
    (error) => error.message.includes("unknown metric") && error.message.includes("not_a_real_metric")
  );
});

// ---------------------------------------------------------------------------
// aggregateFrugalityLedger
// ---------------------------------------------------------------------------

function usage(inputTokens = 0) {
  return { input_tokens: inputTokens, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
}

function entry({ harness, task, replicate, inputTokens = 0, totalCostUsd = 0, numTurns = 1, durationMs = 0 }) {
  return {
    cell_id: `${harness}-${task}`,
    harness,
    task,
    replicate,
    usage: usage(inputTokens),
    total_cost_usd: totalCostUsd,
    num_turns: numTurns,
    duration_ms: durationMs,
    duration_api_ms: durationMs
  };
}

function precomputeItem({ harness, task, replicate, llmTokens = 0, cpuSeconds = 1, maxRssBytes = 1000 }) {
  return {
    harness,
    task,
    replicate,
    line: {
      harness,
      repo: "/tmp/repo",
      raw: { wall_ms: 100, real_seconds: 0.1, cpu_user_seconds: 0.05, cpu_system_seconds: 0.01, cpu_seconds: cpuSeconds, max_rss_bytes: maxRssBytes, llm_usage: null },
      amortization: { n: 1, per_task: { wall_ms: 100, cpu_seconds: cpuSeconds, llm_tokens: llmTokens } },
      semantics: {}
    }
  };
}

function testLedger({ entries, precompute = [] }) {
  return { schemaVersion: "frugality-ledger/v1", generatedAt: "2026-09-03T00:00:00Z", controlHarness: "C", replicates: [], entries, precompute };
}

test("tokens_total: computed correctly when a precompute line exists (hand-checked arithmetic)", () => {
  const ledger = testLedger({
    entries: [
      entry({ harness: "C", task: "t1", replicate: "r1", inputTokens: 100 }),
      entry({ harness: "A", task: "t1", replicate: "r1", inputTokens: 50 })
    ],
    precompute: [precomputeItem({ harness: "A", task: "t1", replicate: "r1", llmTokens: 20 })]
  });
  const parameters = validParameters({ metrics: ["tokens_total"] });
  const result = aggregateFrugalityLedger(ledger, parameters);

  const cellA = result.cells.find((c) => c.harness === "A" && c.task === "t1");
  assert.deepEqual(cellA.metrics.tokens_total.values, [70]); // 50 (usage) + 20 (precompute)
  assert.equal(cellA.metrics.tokens_total.mean, 70);

  const cellC = result.cells.find((c) => c.harness === "C" && c.task === "t1");
  assert.deepEqual(cellC.metrics.tokens_total.values, [100]); // control arm never requires a precompute line

  const comparison = result.comparisons.find((c) => c.task === "t1" && c.treatment === "A" && c.metric === "tokens_total");
  assert.equal(comparison.relative_reduction, 1 - 70 / 100);
  assert.equal(comparison.degenerate, true); // n=1 per side
});

test("tokens_total: null-with-reason when a treatment observation lacks a matching precompute line", () => {
  const ledger = testLedger({
    entries: [
      entry({ harness: "C", task: "t2", replicate: "r1", inputTokens: 90 }),
      entry({ harness: "A", task: "t2", replicate: "r1", inputTokens: 30 })
    ],
    precompute: [] // no precompute line for A/t2/r1
  });
  const parameters = validParameters({ metrics: ["tokens_total"] });
  const result = aggregateFrugalityLedger(ledger, parameters);

  const cellA = result.cells.find((c) => c.harness === "A" && c.task === "t2");
  assert.equal(cellA.metrics.tokens_total.values, null);
  assert.equal(cellA.metrics.tokens_total.reason, "precompute line missing for 1 of 1 observations");

  const comparison = result.comparisons.find((c) => c.task === "t2" && c.treatment === "A" && c.metric === "tokens_total");
  assert.equal(comparison.relative_reduction, null);
  assert.equal(comparison.reason, "precompute line missing for 1 of 1 observations");
  assert.ok(!("interval" in comparison), "a null-with-reason comparison must not carry an interval");
});

test("relative_reduction is null-with-reason when the control mean is 0 for that metric", () => {
  const ledger = testLedger({
    entries: [
      entry({ harness: "C", task: "t3", replicate: "r1", totalCostUsd: 0 }),
      entry({ harness: "A", task: "t3", replicate: "r1", totalCostUsd: 5 })
    ]
  });
  const parameters = validParameters({ metrics: ["total_cost_usd"] });
  const result = aggregateFrugalityLedger(ledger, parameters);
  const comparison = result.comparisons.find((c) => c.task === "t3" && c.treatment === "A" && c.metric === "total_cost_usd");
  assert.equal(comparison.relative_reduction, null);
  assert.match(comparison.reason, /mean\(control\) is 0/);
  assert.ok(!("interval" in comparison));
});

function determinismLedger() {
  return testLedger({
    entries: [
      entry({ harness: "A", task: "det", replicate: "r1", inputTokens: 10 }),
      entry({ harness: "A", task: "det", replicate: "r2", inputTokens: 20 }),
      entry({ harness: "A", task: "det", replicate: "r3", inputTokens: 30 }),
      entry({ harness: "A", task: "det", replicate: "r4", inputTokens: 40 }),
      entry({ harness: "A", task: "det", replicate: "r5", inputTokens: 50 }),
      entry({ harness: "C", task: "det", replicate: "r1", inputTokens: 60 }),
      entry({ harness: "C", task: "det", replicate: "r2", inputTokens: 70 }),
      entry({ harness: "C", task: "det", replicate: "r3", inputTokens: 80 }),
      entry({ harness: "C", task: "det", replicate: "r4", inputTokens: 90 }),
      entry({ harness: "C", task: "det", replicate: "r5", inputTokens: 100 })
    ]
  });
}

test("aggregateFrugalityLedger is deterministic: same ledger + parameters -> byte-identical output", () => {
  const parameters = validParameters({ metrics: ["tokens_inference"] });
  const result1 = aggregateFrugalityLedger(determinismLedger(), parameters);
  const result2 = aggregateFrugalityLedger(determinismLedger(), parameters);
  assert.equal(JSON.stringify(result1), JSON.stringify(result2));
});

test("aggregateFrugalityLedger: changing seed changes a replicate-dependent field", () => {
  const parameters1 = validParameters({ metrics: ["tokens_inference"] });
  const parameters2 = validParameters({ metrics: ["tokens_inference"], seed: "a-different-seed-entirely" });
  const result1 = aggregateFrugalityLedger(determinismLedger(), parameters1);
  const result2 = aggregateFrugalityLedger(determinismLedger(), parameters2);
  const interval1 = result1.comparisons[0].interval;
  const interval2 = result2.comparisons[0].interval;
  assert.ok(interval1.lower !== interval2.lower || interval1.upper !== interval2.upper, "expected the bootstrap bounds to differ under a different seed");
});

test("aggregateFrugalityLedger: an incompatible bootstrap_replicates is refused", () => {
  const parameters = validParameters({ metrics: ["tokens_inference"], bootstrap_replicates: 20 }); // (21)*0.10/2 = 1.05, not an integer
  assert.throws(() => aggregateFrugalityLedger(determinismLedger(), parameters), /is not an integer/);
});
