// Pure module: the independent bootstrap aggregator of the measured-frugality
// ledger (tasks/todo.md:325-329, chantier A, etape 4). No I/O, no clock — the
// ledger and its parameters are handed in already parsed; the CLI (written by
// the orchestrator at integration) owns reading files and hashing bytes.
//
// Statistical primitives (PRNG, percentile ranks, the bootstrap interval) are
// ledger-agnostic and live in ./frugality-bootstrap.mjs — this module is
// entirely about the ledger's own vocabulary: cells, comparisons, pooled
// results. Splitting the two keeps both files under the 500-line cap
// (coding-standards.md §4.1) and keeps "how do you resample" separate from
// "how do you read this ledger" (Move 5 / coding-standards.md §1.1).
import { createHash } from "node:crypto";
import { createSeededGenerator, bootstrapPercentileInterval, finalizeBootstrapInterval, relativeReduction, mean, resampleWithReplacement } from "./frugality-bootstrap.mjs";

export { createSeededGenerator, percentileRanks, bootstrapPercentileInterval, relativeReduction } from "./frugality-bootstrap.mjs";

const ALLOWED_METRICS = ["tokens_inference", "tokens_total", "total_cost_usd", "duration_ms", "num_turns"];
const AGGREGATION_PARAMETERS_SCHEMA = "frugality-aggregation-parameters/v1";

// Sums all four token classes the Anthropic Messages API reports usage for.
// TODO(integration): replace by the export from ./precompute-ledger.mjs once
// feat/frugality-ledger-schema merges (same signature, same four-field sum —
// see that module's own sumUsageTokens for the field-by-field rationale).
function sumUsageTokens(usage) {
  return usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
}

function pushMissing(errors, condition, message) {
  if (!condition) errors.push(message);
}

// Contract:
// pre: parameters is a parsed JSON value.
// post: returns parameters unchanged when every field below is present and
//      valid; otherwise throws one Error naming every missing/invalid field
//      (same "collect every violation, throw once" shape as
//      precompute-ledger.mjs's validatePrecomputeReceipt). No field has a
//      default — an absent field is always a named error, never silently
//      filled in (this module's own instance of tasks/lessons.md lesson 5:
//      never invent thresholds).
export function validateAggregationParameters(parameters) {
  if (parameters === null || typeof parameters !== "object") {
    throw new Error("invalid aggregation parameters: parameters is not an object");
  }
  const errors = [];
  pushMissing(errors, parameters.schemaVersion === AGGREGATION_PARAMETERS_SCHEMA, `schemaVersion: must equal "${AGGREGATION_PARAMETERS_SCHEMA}"`);
  pushMissing(errors, typeof parameters.control_harness === "string" && parameters.control_harness !== "", "control_harness: must be a non-empty string");
  pushMissing(errors, typeof parameters.confidence_level === "number" && parameters.confidence_level > 0 && parameters.confidence_level < 1, "confidence_level: must be a number in (0, 1)");
  pushMissing(errors, Number.isInteger(parameters.bootstrap_replicates) && parameters.bootstrap_replicates >= 1, "bootstrap_replicates: must be an integer >= 1");
  pushMissing(errors, typeof parameters.seed === "string" && parameters.seed !== "", "seed: must be a non-empty string");
  pushMissing(errors, parameters.stage === "pilot" || parameters.stage === "scored", 'stage: must be "pilot" or "scored"');
  validateDeclaredN(parameters, errors);
  validateMetrics(parameters, errors);
  if (errors.length > 0) throw new Error(`invalid aggregation parameters: ${errors.join("; ")}`);
  return parameters;
}

function validateDeclaredN(parameters, errors) {
  if (parameters.stage === "pilot") {
    pushMissing(errors, parameters.declared_n_per_cell === null, 'declared_n_per_cell: must be null when stage is "pilot"');
  } else if (parameters.stage === "scored") {
    pushMissing(errors, Number.isInteger(parameters.declared_n_per_cell) && parameters.declared_n_per_cell >= 1, 'declared_n_per_cell: must be an integer >= 1 when stage is "scored"');
  }
}

function validateMetrics(parameters, errors) {
  if (!Array.isArray(parameters.metrics) || parameters.metrics.length === 0) {
    errors.push("metrics: must be a non-empty array");
    return;
  }
  for (const metric of parameters.metrics) {
    if (!ALLOWED_METRICS.includes(metric)) errors.push(`metrics: unknown metric ${JSON.stringify(metric)} (allowed: ${ALLOWED_METRICS.join(", ")})`);
  }
}

function precomputeKey(harness, task, replicate) {
  return `${harness} ${task} ${replicate}`;
}

function buildPrecomputeIndex(ledger) {
  const index = new Map();
  for (const item of ledger.precompute ?? []) {
    index.set(precomputeKey(item.harness, item.task, item.replicate), item.line);
  }
  return index;
}

// Contract:
// pre: entries is a non-empty array of ledger entries sharing one (harness,
//      task) cell; metric is one of ALLOWED_METRICS; precomputeIndex is
//      built by buildPrecomputeIndex; controlHarness is the declared control.
// post: returns { values, mean } when every entry's value is computable, or
//      { values: null, reason } when metric === "tokens_total" and at least
//      one non-control entry has no matching precompute line (lesson 6:
//      report the gap, never repair it by substitution).
function metricValuesForEntries(entries, metric, precomputeIndex, controlHarness) {
  if (metric === "tokens_inference") return { values: entries.map((e) => sumUsageTokens(e.usage)) };
  if (metric === "tokens_total") return tokensTotalForEntries(entries, precomputeIndex, controlHarness);
  return { values: entries.map((e) => e[metric]) };
}

function tokensTotalForEntries(entries, precomputeIndex, controlHarness) {
  const harness = entries[0].harness;
  if (harness === controlHarness) {
    return { values: entries.map((e) => sumUsageTokens(e.usage)) };
  }
  const missing = entries.filter((e) => !precomputeIndex.has(precomputeKey(e.harness, e.task, e.replicate)));
  if (missing.length > 0) {
    return { values: null, reason: `precompute line missing for ${missing.length} of ${entries.length} observations` };
  }
  const values = entries.map((e) => {
    const line = precomputeIndex.get(precomputeKey(e.harness, e.task, e.replicate));
    const precomputeTokens = line.amortization.per_task.llm_tokens ?? 0;
    return sumUsageTokens(e.usage) + precomputeTokens;
  });
  return { values };
}

function withMean(result) {
  if (result.values === null) return result;
  return { values: result.values, mean: mean(result.values) };
}

function groupByHarnessTask(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.harness} ${entry.task}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return groups;
}

function buildCellPrecompute(harness, task, controlHarness, ledger) {
  if (harness === controlHarness) return null;
  const lines = (ledger.precompute ?? []).filter((item) => item.harness === harness && item.task === task).map((item) => item.line);
  if (lines.length === 0) return null;
  return {
    lines: lines.length,
    cpu_seconds_per_task: lines.map((line) => line.amortization.per_task.cpu_seconds),
    max_rss_bytes: lines.map((line) => line.raw.max_rss_bytes)
  };
}

function buildCells(ledger, parameters, precomputeIndex) {
  const groups = groupByHarnessTask(ledger.entries);
  const tasks = [...new Set(ledger.entries.map((e) => e.task))].sort();
  const harnesses = [...new Set(ledger.entries.map((e) => e.harness))].sort();
  const cells = [];
  for (const task of tasks) {
    for (const harness of harnesses) {
      const entries = groups.get(`${harness} ${task}`);
      if (!entries) continue;
      cells.push(buildOneCell({ harness, task, entries, parameters, precomputeIndex, ledger }));
    }
  }
  return cells;
}

function buildOneCell({ harness, task, entries, parameters, precomputeIndex, ledger }) {
  const replicates = [...new Set(entries.map((e) => e.replicate))].sort();
  const metrics = {};
  for (const metric of parameters.metrics) {
    metrics[metric] = withMean(metricValuesForEntries(entries, metric, precomputeIndex, parameters.control_harness));
  }
  return { harness, task, n: entries.length, replicates, metrics, precompute: buildCellPrecompute(harness, task, parameters.control_harness, ledger) };
}

function findCell(cells, harness, task) {
  return cells.find((cell) => cell.harness === harness && cell.task === task);
}

// try/catch here is not "exceptions for expected control flow"
// (coding-standards.md §7.2, default-refuse): relativeReduction's contract
// (see frugality-bootstrap.mjs) genuinely throws only for an undefined
// ratio (mean(control) === 0, an exceptional input, not a routine branch),
// and this is the one call site whose job is exactly to turn that into the
// null-with-reason shape the D1 spec item 4 mandates ("the caller publishes
// null with a reason, never a substitute").
function reductionOrReason(treatmentValues, controlValues) {
  try {
    return { relative_reduction: relativeReduction(treatmentValues, controlValues), reason: null };
  } catch (error) {
    return { relative_reduction: null, reason: error.message };
  }
}

function buildOneComparison({ task, treatmentHarness, controlHarness, metric, cells, parameters }) {
  const treatmentCell = findCell(cells, treatmentHarness, task);
  const controlCell = findCell(cells, controlHarness, task);
  if (!treatmentCell || !controlCell) return null;
  const treatmentMetric = treatmentCell.metrics[metric];
  const controlMetric = controlCell.metrics[metric];
  const base = { task, treatment: treatmentHarness, control: controlHarness, metric, n_treatment: treatmentCell.n, n_control: controlCell.n };
  if (treatmentMetric.values === null || controlMetric.values === null) {
    return { ...base, relative_reduction: null, reason: treatmentMetric.reason ?? controlMetric.reason };
  }
  return buildComparisonWithValues({ base, treatmentValues: treatmentMetric.values, controlValues: controlMetric.values, parameters });
}

function buildComparisonWithValues({ base, treatmentValues, controlValues, parameters }) {
  const { relative_reduction, reason } = reductionOrReason(treatmentValues, controlValues);
  const seed = `${parameters.seed} ${base.task} ${base.treatment} ${base.metric}`;
  if (relative_reduction === null) return { ...base, relative_reduction: null, reason, seed };
  const interval = bootstrapPercentileInterval({
    samples: { treatment: treatmentValues, control: controlValues },
    statistic: relativeReduction,
    replicates: parameters.bootstrap_replicates,
    confidenceLevel: parameters.confidence_level,
    generator: createSeededGenerator(seed)
  });
  const meetsDeclaredN = parameters.stage === "scored" ? Math.min(base.n_treatment, base.n_control) >= parameters.declared_n_per_cell : null;
  return {
    ...base,
    mean_treatment: mean(treatmentValues),
    mean_control: mean(controlValues),
    relative_reduction,
    interval,
    degenerate: interval.degenerate,
    meets_declared_n: meetsDeclaredN,
    seed
  };
}

function buildComparisons(ledger, parameters, cells) {
  const tasks = [...new Set(ledger.entries.map((e) => e.task))].sort();
  const treatmentHarnesses = [...new Set(ledger.entries.map((e) => e.harness))].filter((h) => h !== parameters.control_harness).sort();
  const comparisons = [];
  for (const task of tasks) {
    for (const treatmentHarness of treatmentHarnesses) {
      for (const metric of parameters.metrics) {
        const comparison = buildOneComparison({ task, treatmentHarness, controlHarness: parameters.control_harness, metric, cells, parameters });
        if (comparison) comparisons.push(comparison);
      }
    }
  }
  return comparisons;
}

function pooledTasksAndValues(cells, treatmentHarness, controlHarness, metric) {
  const treatmentCells = cells.filter((cell) => cell.harness === treatmentHarness);
  const tasks = [];
  const treatmentByTask = new Map();
  const controlByTask = new Map();
  for (const treatmentCell of treatmentCells) {
    const controlCell = findCell(cells, controlHarness, treatmentCell.task);
    if (!controlCell) continue;
    const treatmentMetric = treatmentCell.metrics[metric];
    const controlMetric = controlCell.metrics[metric];
    if (treatmentMetric.values === null || controlMetric.values === null) continue;
    tasks.push(treatmentCell.task);
    treatmentByTask.set(treatmentCell.task, treatmentMetric.values);
    controlByTask.set(treatmentCell.task, controlMetric.values);
  }
  return { tasks: tasks.sort(), treatmentByTask, controlByTask };
}

function flattenByTasks(byTask, tasks) {
  const result = [];
  for (const task of tasks) result.push(...byTask.get(task));
  return result;
}

function stratifiedResample(byTask, tasks, generator) {
  const result = [];
  for (const task of tasks) result.push(...resampleWithReplacement(byTask.get(task), generator));
  return result;
}

// Stratified two-sample bootstrap: each task's values are resampled within
// their own task-group, independently for treatment and control, then
// concatenated (source: Davison & Hinkley 1997 §3.2 "stratified data" —
// bibliographic record verified via Crossref, same page-level caveat as
// percentileRanks in ./frugality-bootstrap.mjs).
function bootstrapPooledInterval({ treatmentByTask, controlByTask, tasks, replicates, confidenceLevel, generator }) {
  const treatmentValues = flattenByTasks(treatmentByTask, tasks);
  const controlValues = flattenByTasks(controlByTask, tasks);
  const estimate = relativeReduction(treatmentValues, controlValues);
  const degenerate = treatmentValues.length < 2 || controlValues.length < 2;
  const replicateStats = new Array(replicates);
  for (let i = 0; i < replicates; i++) {
    const treatmentStar = stratifiedResample(treatmentByTask, tasks, generator);
    const controlStar = stratifiedResample(controlByTask, tasks, generator);
    replicateStats[i] = relativeReduction(treatmentStar, controlStar);
  }
  return finalizeBootstrapInterval({ estimate, replicateStats, replicates, confidenceLevel, degenerate });
}

function buildOnePooled(treatmentHarness, metric, cells, parameters) {
  const { tasks, treatmentByTask, controlByTask } = pooledTasksAndValues(cells, treatmentHarness, parameters.control_harness, metric);
  const base = { treatment: treatmentHarness, metric, tasks };
  if (tasks.length === 0) {
    return { ...base, relative_reduction: null, reason: `no task has both arms with valid ${metric} values` };
  }
  const treatmentValues = flattenByTasks(treatmentByTask, tasks);
  const controlValues = flattenByTasks(controlByTask, tasks);
  const seed = `${parameters.seed} pooled ${treatmentHarness} ${metric}`;
  const { relative_reduction, reason } = reductionOrReason(treatmentValues, controlValues);
  if (relative_reduction === null) return { ...base, relative_reduction: null, reason, seed };
  const interval = bootstrapPooledInterval({
    treatmentByTask,
    controlByTask,
    tasks,
    replicates: parameters.bootstrap_replicates,
    confidenceLevel: parameters.confidence_level,
    generator: createSeededGenerator(seed)
  });
  return {
    ...base,
    n_treatment: treatmentValues.length,
    n_control: controlValues.length,
    relative_reduction,
    interval,
    degenerate: interval.degenerate,
    seed
  };
}

function buildPooled(ledger, parameters, cells) {
  const treatmentHarnesses = [...new Set(ledger.entries.map((e) => e.harness))].filter((h) => h !== parameters.control_harness).sort();
  const pooled = [];
  for (const treatmentHarness of treatmentHarnesses) {
    for (const metric of parameters.metrics) pooled.push(buildOnePooled(treatmentHarness, metric, cells, parameters));
  }
  return pooled;
}

function ledgerSha256(ledger) {
  // Canonical bytes as handed to this module (JSON.stringify of the parsed
  // object), NOT the file's raw bytes on disk — a re-serialization can
  // differ from the source file (key order, whitespace). Documented per D1:
  // the CLI (written by the orchestrator at integration) hashes the file
  // bytes directly instead; the two digests are not expected to match.
  return createHash("sha256").update(JSON.stringify(ledger)).digest("hex");
}

// Contract:
// pre: ledger is structurally valid per part 1's validateFrugalityLedger
//      (this module re-checks only what its own arithmetic needs); parameters
//      satisfies validateAggregationParameters.
// post: returns a frugality-summary/v1 object (see README "Frugality
//      aggregator" section for the full shape) with deterministic ordering
//      (tasks sorted, harnesses sorted, metrics in the declared order) and
//      byte-identical JSON.stringify output for repeated calls with the same
//      inputs.
export function aggregateFrugalityLedger(ledger, parameters) {
  validateAggregationParameters(parameters);
  const precomputeIndex = buildPrecomputeIndex(ledger);
  const cells = buildCells(ledger, parameters, precomputeIndex);
  const comparisons = buildComparisons(ledger, parameters, cells);
  const pooled = buildPooled(ledger, parameters, cells);
  return {
    schemaVersion: "frugality-summary/v1",
    ledger: { schemaVersion: ledger.schemaVersion, generatedAt: ledger.generatedAt, sha256: ledgerSha256(ledger) },
    parameters,
    method: {
      resampling: "two-sample nonparametric bootstrap, each sample resampled independently with replacement (Efron & Tibshirani 1993 ch. 8; pooled comparisons stratify by task, Davison & Hinkley 1997 §3.2)",
      interval: "percentile",
      rank_rule: "k = (replicates + 1) * alpha / 2, refused when not an integer >= 1 (Davison & Hinkley 1997 ch. 5)",
      prng: "xoshiro128**",
      seed_derivation: "sha256(seed string) read as four big-endian uint32 initial state words; per-comparison seed = `${parameters.seed} ${task} ${treatment} ${metric}`; pooled seed = `${parameters.seed} pooled ${treatment} ${metric}`",
      sources: [
        "Blackman, D. & Vigna, S. 2021, ACM TOMS 47(4) art. 36 (xoshiro128**)",
        "Lemire, D. 2019, ACM TOMACS 29(1) art. 3, Algorithm 3 (unbiased bounded integers)",
        "Davison, A.C. & Hinkley, D.V. 1997, Bootstrap Methods and their Application, Cambridge University Press",
        "Efron, B. & Tibshirani, R.J. 1993, An Introduction to the Bootstrap, Chapman & Hall/CRC",
        "Efron, B. 1979, Ann. Statist. 7(1):1-26, DOI 10.1214/aos/1176344552"
      ]
    },
    cells,
    comparisons,
    pooled
  };
}
