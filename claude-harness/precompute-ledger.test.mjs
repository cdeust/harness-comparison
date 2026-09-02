import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseTimeReport, precomputeLedgerLine, validatePrecomputeReceipt } from "./precompute-ledger.mjs";

const fixturePath = resolve(import.meta.dirname, "fixtures/time-report.darwin-26.6.2.txt");
const fixtureRaw = readFileSync(fixturePath, "utf8");

test("parseTimeReport reads the real fixture", () => {
  const resources = parseTimeReport(fixtureRaw);
  assert.deepEqual(resources, {
    real_seconds: 0.20,
    user_seconds: 0.15,
    system_seconds: 0.01,
    max_rss_bytes: 70746112
  });
});

test("parseTimeReport throws naming the real/user/sys line when missing", () => {
  const broken = fixtureRaw.split("\n").slice(1).join("\n");
  assert.throws(
    () => parseTimeReport(broken),
    (error) => error.message.startsWith("parseTimeReport: missing or malformed real/user/sys line")
  );
});

test("parseTimeReport throws naming the max-rss field when missing", () => {
  const broken = fixtureRaw.split("\n").filter((line) => !line.includes("maximum resident set size")).join("\n");
  assert.throws(
    () => parseTimeReport(broken),
    (error) => error.message.startsWith('parseTimeReport: missing or malformed "maximum resident set size" field')
  );
});

test("parseTimeReport rejects non-string input", () => {
  assert.throws(() => parseTimeReport(null), (error) => error.message.startsWith("parseTimeReport: text must be a string"));
});

function validReceipt(overrides = {}) {
  return {
    schema: "precompute-receipt-v1",
    harness: "B",
    repo: "/absolute/corpus/repo",
    platform: "darwin",
    exit: { code: 0, signal: null },
    wall_ms: 1000,
    resources: { real_seconds: 0.20, user_seconds: 0.15, system_seconds: 0.01, max_rss_bytes: 70746112 },
    time_report: { raw: fixtureRaw, sha256: createHash("sha256").update(fixtureRaw).digest("hex") },
    llm_usage: null,
    ...overrides
  };
}

test("a well-formed receipt validates clean", () => {
  assert.deepEqual(validatePrecomputeReceipt(validReceipt()), validReceipt());
});

test("validatePrecomputeReceipt refuses a non-zero exit code", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ exit: { code: 1, signal: null } })),
    (error) => error.message.includes("exit: must be { code: 0, signal: null }")
  );
});

test("validatePrecomputeReceipt refuses a non-null exit signal", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ exit: { code: 0, signal: "SIGKILL" } })),
    (error) => error.message.includes("exit: must be { code: 0, signal: null }")
  );
});

test("validatePrecomputeReceipt refuses a non-darwin platform", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ platform: "linux" })),
    (error) => error.message.includes('platform: must equal "darwin"')
  );
});

test("validatePrecomputeReceipt refuses a time_report.sha256 mismatch", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ time_report: { raw: fixtureRaw, sha256: "0".repeat(64) } })),
    (error) => error.message.includes("time_report.sha256: does not match sha256(time_report.raw)")
  );
});

test("validatePrecomputeReceipt refuses a malformed llm_usage object", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ llm_usage: { input_tokens: -1, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })),
    (error) => error.message.includes("llm_usage.input_tokens: must be an integer >= 0")
  );
});

test("validatePrecomputeReceipt accepts a valid llm_usage object", () => {
  const receipt = validReceipt({ llm_usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
  assert.deepEqual(validatePrecomputeReceipt(receipt), receipt);
});

test("validatePrecomputeReceipt joins every violation", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ schema: "wrong", harness: "Z" })),
    (error) => error.message.includes('schema: must equal "precompute-receipt-v1"') && error.message.includes('harness: must be "A" or "B"')
  );
});

test("validatePrecomputeReceipt refuses a non-object receipt", () => {
  assert.throws(() => validatePrecomputeReceipt(null), (error) => error.message.includes("is not an object"));
});

test("validatePrecomputeReceipt accepts artifact: null", () => {
  const receipt = validReceipt({ artifact: null });
  assert.deepEqual(validatePrecomputeReceipt(receipt), receipt);
});

test("validatePrecomputeReceipt accepts a well-formed artifact object", () => {
  const receipt = validReceipt({ artifact: { path: "/absolute/corpus/repo/graph.json", sha256: "a".repeat(64) } });
  assert.deepEqual(validatePrecomputeReceipt(receipt), receipt);
});

test("validatePrecomputeReceipt refuses an artifact.sha256 that is not 64 hex characters", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ artifact: { path: "/x", sha256: "not-hex" } })),
    (error) => error.message.includes("artifact.sha256: must be a 64-character lowercase hex sha256 digest")
  );
});

test("validatePrecomputeReceipt refuses an artifact with an empty path", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ artifact: { path: "", sha256: "a".repeat(64) } })),
    (error) => error.message.includes("artifact.path: must be a non-empty string")
  );
});

test("validatePrecomputeReceipt refuses a non-object, non-null artifact", () => {
  assert.throws(
    () => validatePrecomputeReceipt(validReceipt({ artifact: "graph.json" })),
    (error) => error.message.includes("artifact: must be null or { path: string, sha256: <64 hex chars> }")
  );
});

for (const badN of [0, -1, 1.5, "3"]) {
  test(`precomputeLedgerLine refuses amortizationTaskCount = ${JSON.stringify(badN)}`, () => {
    assert.throws(
      () => precomputeLedgerLine(validReceipt(), { amortizationTaskCount: badN }),
      (error) => error.message.startsWith("precomputeLedgerLine: amortizationTaskCount must be an integer >= 1")
    );
  });
}

test("precomputeLedgerLine keeps raw present next to per_task, never diluted silently", () => {
  const line = precomputeLedgerLine(validReceipt(), { amortizationTaskCount: 4 });
  assert.deepEqual(line.raw, {
    wall_ms: 1000,
    real_seconds: 0.20,
    cpu_user_seconds: 0.15,
    cpu_system_seconds: 0.01,
    cpu_seconds: 0.16,
    max_rss_bytes: 70746112,
    llm_usage: null
  });
  assert.equal(line.amortization.n, 4);
});

test("precomputeLedgerLine publishes real_seconds next to the wrapper-inclusive wall_ms (review finding I2)", () => {
  const line = precomputeLedgerLine(validReceipt({ wall_ms: 1000, resources: { real_seconds: 0.68, user_seconds: 0.15, system_seconds: 0.01, max_rss_bytes: 70746112 } }), { amortizationTaskCount: 1 });
  assert.equal(line.raw.wall_ms, 1000);
  assert.equal(line.raw.real_seconds, 0.68);
});

test("precomputeLedgerLine states the wall_ms semantics as an upper bound over raw.real_seconds", () => {
  const line = precomputeLedgerLine(validReceipt(), { amortizationTaskCount: 1 });
  assert.match(line.semantics.wall_ms, /upper bound/);
  assert.match(line.semantics.wall_ms, /real_seconds/);
});

test("precomputeLedgerLine divides exactly, no rounding", () => {
  const line = precomputeLedgerLine(validReceipt({ wall_ms: 1000 }), { amortizationTaskCount: 3 });
  assert.equal(line.amortization.per_task.wall_ms, 1000 / 3);
  assert.equal(line.amortization.per_task.cpu_seconds, 0.16 / 3);
});

test("precomputeLedgerLine amortizes llm tokens across every usage field", () => {
  const receipt = validReceipt({
    llm_usage: { input_tokens: 100, output_tokens: 40, cache_creation_input_tokens: 10, cache_read_input_tokens: 5 }
  });
  const line = precomputeLedgerLine(receipt, { amortizationTaskCount: 5 });
  assert.equal(line.amortization.per_task.llm_tokens, (100 + 40 + 10 + 5) / 5);
});

test("precomputeLedgerLine.per_task never carries max_rss_bytes", () => {
  const line = precomputeLedgerLine(validReceipt(), { amortizationTaskCount: 2 });
  assert.equal(Object.prototype.hasOwnProperty.call(line.amortization.per_task, "max_rss_bytes"), false);
});

test("precomputeLedgerLine states the cpu_seconds and max_rss_bytes semantics", () => {
  const line = precomputeLedgerLine(validReceipt(), { amortizationTaskCount: 1 });
  assert.match(line.semantics.cpu_seconds, /lower bound/);
  assert.match(line.semantics.max_rss_bytes, /largest single process/);
  assert.match(line.semantics.max_rss_bytes, /never amortized/);
});

test("precomputeLedgerLine reflects harness and repo from the receipt", () => {
  const line = precomputeLedgerLine(validReceipt({ harness: "A", repo: "/absolute/corpus/other" }), { amortizationTaskCount: 1 });
  assert.equal(line.harness, "A");
  assert.equal(line.repo, "/absolute/corpus/other");
});
