// These tests spawn the real runner around real /usr/bin/time -l invocations
// on macOS — they assert structural facts (receipt validity, sizes, refusal
// behavior), never a wall-clock verdict.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { validatePrecomputeReceipt } from "./precompute-ledger.mjs";

const runnerPath = resolve(import.meta.dirname, "run-precompute.mjs");
const envelopeFixturePath = resolve(import.meta.dirname, "fixtures/result-envelope.claude-2.1.258.json");
const darwinOnly = { skip: process.platform !== "darwin" ? "run-precompute.mjs is darwin-only (ru_maxrss unit)" : false };

function runCli(args) {
  return spawnSync(process.execPath, [runnerPath, ...args], { encoding: "utf8" });
}

function allocatingCommand() {
  return [process.execPath, "-e", "const a = Buffer.alloc(20 * 1024 * 1024, 1); if (a.length < 0) console.log('x');"];
}

test("a successful precompute run writes a receipt that validates", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const result = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...allocatingCommand()]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptOut, "utf8"));
  assert.deepEqual(validatePrecomputeReceipt(receipt), receipt);
});

test("max_rss_bytes reflects a known allocation", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const result = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...allocatingCommand()]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptOut, "utf8"));
  assert.ok(receipt.resources.max_rss_bytes >= 10 * 1024 * 1024, `max_rss_bytes too small: ${receipt.resources.max_rss_bytes}`);
});

test("a second run against the same receipt-out is refused before spawning", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const first = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...allocatingCommand()]);
  assert.equal(first.status, 0, first.stderr);
  const second = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...allocatingCommand()]);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /refusing to start: precompute artifact already exists/);
});

test("a non-zero-exit child still gets a receipt, refused by the validator", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const failingCommand = [process.execPath, "-e", "process.exit(1);"];
  const result = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...failingCommand]);
  assert.equal(result.status, 1);
  const receipt = JSON.parse(readFileSync(receiptOut, "utf8"));
  assert.equal(receipt.exit.code, 1);
  assert.throws(
    () => validatePrecomputeReceipt(receipt),
    (error) => error.message.includes("exit: must be { code: 0, signal: null }")
  );
});

test("--envelope embeds the validated usage block into the receipt", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const result = runCli([
    "--harness", "A", "--repo", stage, "--receipt-out", receiptOut,
    "--envelope", envelopeFixturePath,
    "--", ...allocatingCommand()
  ]);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(readFileSync(receiptOut, "utf8"));
  const fixture = JSON.parse(readFileSync(envelopeFixturePath, "utf8"));
  assert.deepEqual(receipt.llm_usage, fixture.usage);
});

test("a bad --envelope path fails before the measured command is spawned", darwinOnly, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const result = runCli([
    "--harness", "A", "--repo", stage, "--receipt-out", receiptOut,
    "--envelope", resolve(stage, "does-not-exist.json"),
    "--", ...allocatingCommand()
  ]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(receiptOut), false);
});

test("refuses to run on a non-darwin platform", { skip: process.platform === "darwin" ? "only meaningful off darwin" : false }, () => {
  const stage = mkdtempSync(join(tmpdir(), "run-precompute-test-"));
  const receiptOut = resolve(stage, "receipt.json");
  const result = runCli(["--harness", "B", "--repo", stage, "--receipt-out", receiptOut, "--", ...allocatingCommand()]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only supported on darwin/);
});
