// Spawns the real CLI against a synthetic result root built from the real
// bracket/envelope shapes (writeBracket's own fields) — never a wall-clock
// assertion, only structural facts about the produced ledger and refusals.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cliPath = resolve(import.meta.dirname, "build-frugality-ledger.mjs");
const envelopeFixturePath = resolve(import.meta.dirname, "fixtures/result-envelope.claude-2.1.258.json");
const envelopeFixtureBytes = readFileSync(envelopeFixturePath);
const timeReportFixturePath = resolve(import.meta.dirname, "fixtures/time-report.darwin-26.6.2.txt");
const timeReportRaw = readFileSync(timeReportFixturePath, "utf8");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

// Builds a minimal but real-shaped replicate root: one accepted probe cell
// (B-repo) with a matching bracket, envelope, and report. hostToolVersion
// lets tests exercise both the D5-present and pre-D5-absent host_tool cases.
function buildReplicateRoot({ cellId = "B-repo", includeHostTool = true, hostToolVersion = "2.1.258", withReceipt = false, receiptAmortizedCellIds } = {}) {
  const root = mkdtempSync(join(tmpdir(), "frugality-ledger-root-"));
  mkdirSync(resolve(root, "probes"), { recursive: true });
  mkdirSync(resolve(root, "manifest/probe-brackets"), { recursive: true });

  const envelopePath = resolve(root, "probes", `${cellId}.envelope.json`);
  writeFileSync(envelopePath, envelopeFixtureBytes);
  const reportPath = resolve(root, "probes", `${cellId}.json`);
  writeFileSync(reportPath, `${JSON.stringify({ harness: cellId[0], target_repo: "/absolute/corpus/repo" })}\n`);

  const promptSha256 = "a".repeat(64);
  const bracketPath = resolve(root, "manifest/probe-brackets", `${cellId}.json`);
  const bracket = {
    cell: cellId,
    prompt_sha256: promptSha256,
    envelope: { path: envelopePath, sha256: sha256(envelopeFixtureBytes) },
    before: includeHostTool ? { host_tool: { name: "claude", version: hostToolVersion } } : {}
  };
  writeFileSync(bracketPath, JSON.stringify(bracket));

  writeFileSync(resolve(root, "probes/run-summary.json"), JSON.stringify({
    completed_at: "2026-09-03T00:00:00Z",
    results: [{ id: cellId, status: "ok" }]
  }));

  if (withReceipt) {
    mkdirSync(resolve(root, "precompute"), { recursive: true });
    const receipt = {
      schema: "precompute-receipt-v1",
      harness: "B",
      repo: receiptAmortizedCellIds === undefined ? "/absolute/corpus/repo" : "/absolute/corpus/unrelated-repo",
      platform: "darwin",
      exit: { code: 0, signal: null },
      wall_ms: 1000,
      resources: { real_seconds: 0.20, user_seconds: 0.15, system_seconds: 0.01, max_rss_bytes: 70746112 },
      time_report: { raw: timeReportRaw, sha256: sha256(Buffer.from(timeReportRaw)) },
      llm_usage: null
    };
    writeFileSync(resolve(root, "precompute/B-repo.receipt.json"), JSON.stringify(receipt));
  }

  return { root, envelopePath, bracketPath, reportPath };
}

test("a well-formed replicate root produces a ledger that validates", () => {
  const { root } = buildReplicateRoot({ withReceipt: true });
  const outPath = resolve(mkdtempSync(join(tmpdir(), "frugality-ledger-out-")), "ledger.json");
  const result = runCli(["--result-root", root, "--out", outPath]);
  assert.equal(result.status, 0, result.stderr);
  const ledger = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(ledger.schemaVersion, "frugality-ledger/v1");
  assert.equal(ledger.entries.length, 1);
  assert.equal(ledger.entries[0].host.version, "2.1.258");
  assert.equal(ledger.precompute.length, 1);
  assert.equal(ledger.precompute[0].line.amortization.n, 1);
});

test("a pre-D5 bracket (no host_tool) produces host.version: null, never fabricated", () => {
  const { root } = buildReplicateRoot({ includeHostTool: false });
  const outPath = resolve(mkdtempSync(join(tmpdir(), "frugality-ledger-out-")), "ledger.json");
  const result = runCli(["--result-root", root, "--out", outPath]);
  assert.equal(result.status, 0, result.stderr);
  const ledger = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(ledger.entries[0].host.version, null);
});

test("--out refuses to overwrite an existing file (wx)", () => {
  const { root } = buildReplicateRoot();
  const outDir = mkdtempSync(join(tmpdir(), "frugality-ledger-out-"));
  const outPath = resolve(outDir, "ledger.json");
  writeFileSync(outPath, "existing content\n");
  const result = runCli(["--result-root", root, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(outPath, "utf8"), "existing content\n");
});

test("a missing envelope file fails the run before any output is written", () => {
  const { root, envelopePath } = buildReplicateRoot();
  unlinkSync(envelopePath);
  const outPath = resolve(mkdtempSync(join(tmpdir(), "frugality-ledger-out-")), "ledger.json");
  const result = runCli(["--result-root", root, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(outPath), false);
});

test("a precompute receipt with zero accepted cells for its (harness, task, replicate) is refused", () => {
  const { root } = buildReplicateRoot({ withReceipt: true, receiptAmortizedCellIds: [] });
  const outPath = resolve(mkdtempSync(join(tmpdir(), "frugality-ledger-out-")), "ledger.json");
  const result = runCli(["--result-root", root, "--out", outPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unamortizable precompute is refused/);
  assert.equal(existsSync(outPath), false);
});

test("missing required flags exit 64 (EX_USAGE)", () => {
  const result = runCli([]);
  assert.equal(result.status, 64);
});

test("two replicate roots each contribute their own entries and replicates row", () => {
  const first = buildReplicateRoot({ cellId: "B-repo" });
  const second = buildReplicateRoot({ cellId: "B-repo" });
  const outPath = resolve(mkdtempSync(join(tmpdir(), "frugality-ledger-out-")), "ledger.json");
  const result = runCli(["--result-root", first.root, "--result-root", second.root, "--out", outPath]);
  assert.equal(result.status, 0, result.stderr);
  const ledger = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(ledger.replicates.length, 2);
  assert.equal(ledger.entries.length, 2);
});
