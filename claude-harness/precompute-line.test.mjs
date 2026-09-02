// These tests spawn the real CLI (never the pure precomputeLedgerLine
// directly) so a bad --tasks value is caught exactly where the operator
// hits it: at the command line, before precompute-ledger.mjs ever runs
// (review finding I3 — --tasks 0/abc/2.5 used to fall through to an
// uncaught exception instead of a usage error). No wall-clock verdict.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const runnerPath = resolve(import.meta.dirname, "run-precompute.mjs");
const cliPath = resolve(import.meta.dirname, "precompute-line.mjs");
const darwinOnly = { skip: process.platform !== "darwin" ? "run-precompute.mjs is darwin-only (ru_maxrss unit)" : false };

function runRunner(args) {
  return spawnSync(process.execPath, [runnerPath, ...args], { encoding: "utf8" });
}

function runLineCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8" });
}

// Builds a real, valid precompute receipt via the actual runner rather than
// a hand-written fixture — the same discipline as run-precompute.test.mjs.
function buildReceipt() {
  const stage = mkdtempSync(join(tmpdir(), "precompute-line-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const command = [process.execPath, "-e", "console.log(1)"];
  const result = runRunner(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...command]);
  assert.equal(result.status, 0, result.stderr);
  return receiptOut;
}

for (const badTasks of ["0", "abc", "2.5"]) {
  test(`--tasks ${badTasks} is refused with a usage error, no stack trace (review finding I3)`, darwinOnly, () => {
    const receiptOut = buildReceipt();
    const result = runLineCli(["--receipt", receiptOut, "--tasks", badTasks]);
    assert.equal(result.status, 64, result.stderr);
    assert.match(result.stderr, /usage: precompute-line\.mjs --receipt <path> --tasks <n>/);
    assert.doesNotMatch(result.stderr, /at Object\.|at Module\.|\.mjs:\d+:\d+/, `expected no stack trace, got: ${result.stderr}`);
  });
}

test("--tasks 3 prints raw, amortization.n = 3, per_task, and semantics", darwinOnly, () => {
  const receiptOut = buildReceipt();
  const result = runLineCli(["--receipt", receiptOut, "--tasks", "3"]);
  assert.equal(result.status, 0, result.stderr);
  const line = JSON.parse(result.stdout);
  assert.ok(line.raw);
  assert.equal(line.amortization.n, 3);
  assert.ok(line.amortization.per_task);
  assert.ok(line.semantics);
});
