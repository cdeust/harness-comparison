// Spawns the real CLI against a synthetic but schema-valid ledger and a
// parameters file — structural facts about the produced summary and about
// refusals only, never a wall-clock assertion.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cliPath = resolve(import.meta.dirname, "aggregate-frugality-ledger.mjs");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

function evidenceRef(path) {
  return { path, sha256: sha256(Buffer.from(path)) };
}

function ledgerEntry({ harness, task, replicate, inputTokens }) {
  const cellId = `${harness}-${task}`;
  return {
    cell_id: cellId,
    harness,
    task,
    replicate,
    host: { tool: "claude-code", version: "2.1.258" },
    usage: { provider: "anthropic", input_tokens: inputTokens, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    total_cost_usd: 0.01,
    num_turns: 1,
    duration_ms: 1000,
    duration_api_ms: 900,
    evidence: {
      envelope: evidenceRef(`probes/${cellId}.envelope.json`),
      bracket: evidenceRef(`manifest/probe-brackets/${cellId}.json`),
      report: evidenceRef(`probes/${cellId}.json`),
      prompt_sha256: "a".repeat(64)
    }
  };
}

function precomputeItem({ harness, task, replicate }) {
  return {
    harness,
    task,
    replicate,
    line: {
      harness,
      repo: "/absolute/corpus/repo",
      raw: { wall_ms: 100, real_seconds: 0.1, cpu_user_seconds: 0.05, cpu_system_seconds: 0.01, cpu_seconds: 0.06, max_rss_bytes: 1000, llm_usage: null },
      amortization: { n: 1, per_task: { wall_ms: 100, cpu_seconds: 0.06, llm_tokens: 0 } },
      semantics: { wall_ms: "upper bound", cpu_seconds: "lower bound", max_rss_bytes: "peak of the largest process" }
    },
    evidence: { receipt: evidenceRef(`precompute/${harness}-${task}.receipt.json`) }
  };
}

// Two replicates so that neither arm's interval is degenerate (n >= 2).
function syntheticLedger() {
  return {
    schemaVersion: "frugality-ledger/v1",
    generatedAt: "2026-09-03T00:00:00Z",
    controlHarness: "C",
    replicates: [
      { id: "r1", runSummaryCompletedAt: "2026-09-03T00:00:00Z" },
      { id: "r2", runSummaryCompletedAt: "2026-09-03T01:00:00Z" }
    ],
    entries: [
      ledgerEntry({ harness: "C", task: "repo", replicate: "r1", inputTokens: 1000 }),
      ledgerEntry({ harness: "C", task: "repo", replicate: "r2", inputTokens: 1200 }),
      ledgerEntry({ harness: "B", task: "repo", replicate: "r1", inputTokens: 400 }),
      ledgerEntry({ harness: "B", task: "repo", replicate: "r2", inputTokens: 500 })
    ],
    precompute: [
      precomputeItem({ harness: "B", task: "repo", replicate: "r1" }),
      precomputeItem({ harness: "B", task: "repo", replicate: "r2" })
    ]
  };
}

function parameters(overrides = {}) {
  return {
    schemaVersion: "frugality-aggregation-parameters/v1",
    control_harness: "C",
    confidence_level: 0.9,
    bootstrap_replicates: 19,
    seed: "aggregate-cli-test",
    stage: "pilot",
    declared_n_per_cell: null,
    metrics: ["tokens_inference", "tokens_total"],
    ...overrides
  };
}

function writeInputs({ ledger = syntheticLedger(), params = parameters(), ledgerBytes } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "frugality-aggregate-cli-"));
  const ledgerPath = resolve(dir, "ledger.json");
  writeFileSync(ledgerPath, ledgerBytes ?? `${JSON.stringify(ledger, null, 2)}\n`);
  const parametersPath = resolve(dir, "parameters.json");
  writeFileSync(parametersPath, `${JSON.stringify(params, null, 2)}\n`);
  return { dir, ledgerPath, parametersPath, outPath: resolve(dir, "summary.json") };
}

test("a valid ledger + parameters file produce a summary hash-bound to both input files", () => {
  const { ledgerPath, parametersPath, outPath } = writeInputs();
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(summary.schemaVersion, "frugality-summary/v1");
  assert.equal(summary.files.ledger.sha256, sha256(readFileSync(ledgerPath)));
  assert.equal(summary.files.parameters.sha256, sha256(readFileSync(parametersPath)));
  assert.equal(summary.files.ledger.path, "ledger.json");
  assert.equal(summary.parameters.seed, "aggregate-cli-test");
  const comparison = summary.comparisons.find((row) => row.treatment === "B" && row.metric === "tokens_inference");
  assert.ok(comparison, "expected a B vs C tokens_inference comparison");
  assert.equal(comparison.n_control, 2);
  assert.equal(comparison.n_treatment, 2);
});

test("the CLI is deterministic: same inputs twice -> byte-identical summaries", () => {
  const first = writeInputs();
  const second = writeInputs();
  assert.equal(runCli(["--ledger", first.ledgerPath, "--parameters", first.parametersPath, "--out", first.outPath]).status, 0);
  assert.equal(runCli(["--ledger", second.ledgerPath, "--parameters", second.parametersPath, "--out", second.outPath]).status, 0);
  assert.equal(readFileSync(first.outPath, "utf8"), readFileSync(second.outPath, "utf8"));
});

test("an invalid ledger is refused before any output is written", () => {
  const ledger = syntheticLedger();
  ledger.replicates = [];
  const { ledgerPath, parametersPath, outPath } = writeInputs({ ledger });
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid frugality ledger/);
  assert.equal(existsSync(outPath), false);
});

test("a parameters file missing a field is refused, never defaulted", () => {
  const params = parameters();
  delete params.seed;
  const { ledgerPath, parametersPath, outPath } = writeInputs({ params });
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /seed/);
  assert.equal(existsSync(outPath), false);
});

test("an incompatible (replicates, confidence_level) pair is refused with the rank named", () => {
  const { ledgerPath, parametersPath, outPath } = writeInputs({ params: parameters({ bootstrap_replicates: 20 }) });
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /is not an integer/);
  assert.equal(existsSync(outPath), false);
});

test("an unparsable ledger file is named in the refusal", () => {
  const { ledgerPath, parametersPath, outPath } = writeInputs({ ledgerBytes: "{ not json" });
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unreadable frugality ledger at/);
  assert.equal(existsSync(outPath), false);
});

test("--out refuses to overwrite an existing file (wx)", () => {
  const { ledgerPath, parametersPath, outPath } = writeInputs();
  writeFileSync(outPath, "existing content\n");
  const result = runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(outPath, "utf8"), "existing content\n");
});

test("a missing or repeated flag is a usage error (exit 64)", () => {
  const { ledgerPath, parametersPath, outPath } = writeInputs();
  assert.equal(runCli(["--ledger", ledgerPath, "--out", outPath]).status, 64);
  assert.equal(runCli(["--ledger", ledgerPath, "--ledger", ledgerPath, "--parameters", parametersPath, "--out", outPath]).status, 64);
  assert.equal(runCli(["--ledger", ledgerPath, "--parameters", parametersPath, "--out"]).status, 64);
  assert.equal(existsSync(outPath), false);
});
