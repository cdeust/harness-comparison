import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ledgerEntryFromCell, precomputeLedgerEntry, validateFrugalityLedger } from "./frugality-ledger.mjs";

const envelopeFixturePath = resolve(import.meta.dirname, "fixtures/result-envelope.claude-2.1.258.json");
const envelope = JSON.parse(readFileSync(envelopeFixturePath, "utf8"));
const timeReportFixturePath = resolve(import.meta.dirname, "fixtures/time-report.darwin-26.6.2.txt");
const timeReportRaw = readFileSync(timeReportFixturePath, "utf8");

const HEX_64 = (fill) => fill.repeat(64);

function bracketFor(overrides = {}) {
  return {
    prompt_sha256: HEX_64("a"),
    envelope: { sha256: HEX_64("b") },
    ...overrides
  };
}

function evidenceFor(overrides = {}) {
  return {
    envelope: { path: "probes/A-repo.envelope.json", sha256: HEX_64("b") },
    bracket: { path: "manifest/probe-brackets/A-repo.json", sha256: HEX_64("c") },
    report: { path: "probes/A-repo.json", sha256: HEX_64("d") },
    prompt_sha256: HEX_64("a"),
    ...overrides
  };
}

const host = { tool: "claude-code", version: "2.1.258" };

test("ledgerEntryFromCell builds the pinned entry shape from a valid cell", () => {
  const entry = ledgerEntryFromCell({ cellId: "A-repo", replicate: "rep1", host, bracket: bracketFor(), envelope, evidence: evidenceFor() });
  assert.equal(entry.cell_id, "A-repo");
  assert.equal(entry.harness, "A");
  assert.equal(entry.task, "repo");
  assert.equal(entry.replicate, "rep1");
  assert.deepEqual(entry.host, host);
  assert.deepEqual(entry.usage, {
    provider: "anthropic",
    input_tokens: envelope.usage.input_tokens,
    output_tokens: envelope.usage.output_tokens,
    cache_creation_input_tokens: envelope.usage.cache_creation_input_tokens,
    cache_read_input_tokens: envelope.usage.cache_read_input_tokens
  });
  assert.equal(entry.total_cost_usd, envelope.total_cost_usd);
  assert.equal(entry.num_turns, envelope.num_turns);
  assert.equal(entry.duration_ms, envelope.duration_ms);
  assert.equal(entry.duration_api_ms, envelope.duration_api_ms);
});

test("components cell id splits into harness=A task=components", () => {
  const entry = ledgerEntryFromCell({
    cellId: "A-components",
    replicate: "rep1",
    host,
    bracket: bracketFor(),
    envelope,
    evidence: evidenceFor({ envelope: { path: "probes/A-components.envelope.json", sha256: HEX_64("b") } })
  });
  assert.equal(entry.harness, "A");
  assert.equal(entry.task, "components");
});

test("ledgerEntryFromCell refuses an invalid envelope", () => {
  assert.throws(
    () => ledgerEntryFromCell({ cellId: "A-repo", replicate: "rep1", host, bracket: bracketFor(), envelope: { type: "not-a-result" }, evidence: evidenceFor() }),
    (error) => error.message.includes("invalid result envelope")
  );
});

test("ledgerEntryFromCell refuses a tampered envelope sha256 (evidence binding)", () => {
  assert.throws(
    () => ledgerEntryFromCell({ cellId: "A-repo", replicate: "rep1", host, bracket: bracketFor(), envelope, evidence: evidenceFor({ envelope: { path: "probes/A-repo.envelope.json", sha256: HEX_64("f") } }) }),
    (error) => error.message.includes("envelope sha256 mismatch")
  );
});

test("ledgerEntryFromCell refuses a tampered prompt sha256 (evidence binding)", () => {
  assert.throws(
    () => ledgerEntryFromCell({ cellId: "A-repo", replicate: "rep1", host, bracket: bracketFor(), envelope, evidence: evidenceFor({ prompt_sha256: HEX_64("f") }) }),
    (error) => error.message.includes("prompt sha256 mismatch")
  );
});

function precomputeReceipt(overrides = {}) {
  return {
    schema: "precompute-receipt-v1",
    harness: "B",
    repo: "/absolute/corpus/repo",
    platform: "darwin",
    exit: { code: 0, signal: null },
    wall_ms: 1000,
    resources: { real_seconds: 0.20, user_seconds: 0.15, system_seconds: 0.01, max_rss_bytes: 70746112 },
    time_report: { raw: timeReportRaw, sha256: createHash("sha256").update(timeReportRaw).digest("hex") },
    llm_usage: null,
    ...overrides
  };
}

function baseDoc(overrides = {}) {
  return {
    schemaVersion: "frugality-ledger/v1",
    generatedAt: "2026-09-03T00:00:00Z",
    controlHarness: "C",
    replicates: [{ id: "rep1", runSummaryCompletedAt: "2026-09-03T00:00:00Z" }],
    entries: [],
    precompute: [],
    ...overrides
  };
}

function acceptedEntry(overrides = {}) {
  return ledgerEntryFromCell({ cellId: "B-repo", replicate: "rep1", host, bracket: bracketFor(), envelope, evidence: evidenceFor({ envelope: { path: "probes/B-repo.envelope.json", sha256: HEX_64("b") } }), ...overrides });
}

test("validateFrugalityLedger accepts a well-formed ledger with one entry and one precompute line", () => {
  const entry = acceptedEntry();
  const precomputeEntry = precomputeLedgerEntry({
    receipt: precomputeReceipt(),
    replicate: "rep1",
    amortizationTaskCount: 1,
    evidence: { receipt: { path: "precompute/B-repo.receipt.json", sha256: HEX_64("e") } }
  });
  const doc = baseDoc({ entries: [entry], precompute: [precomputeEntry] });
  assert.deepEqual(validateFrugalityLedger(doc), doc);
});

test("validateFrugalityLedger refuses an unknown top-level field", () => {
  assert.throws(() => validateFrugalityLedger(baseDoc({ extra: true })), (error) => error.message.includes("UNKNOWN_FIELD") || error.message.includes("$.extra"));
});

test("validateFrugalityLedger refuses an absolute evidence path", () => {
  const entry = acceptedEntry();
  entry.evidence.envelope.path = "/absolute/probes/B-repo.envelope.json";
  assert.throws(() => validateFrugalityLedger(baseDoc({ entries: [entry] })), (error) => error.message.includes("evidence.envelope.path"));
});

test("validateFrugalityLedger refuses an unknown usage.provider", () => {
  const entry = acceptedEntry();
  entry.usage.provider = "openai";
  assert.throws(() => validateFrugalityLedger(baseDoc({ entries: [entry] })), (error) => error.message.includes("usage.provider"));
});

test("validateFrugalityLedger refuses an entry naming an undeclared replicate", () => {
  const entry = acceptedEntry();
  entry.replicate = "rep-unknown";
  assert.throws(() => validateFrugalityLedger(baseDoc({ entries: [entry] })), (error) => error.message.includes("undeclared replicate"));
});

test("validateFrugalityLedger refuses a duplicate (cell_id, replicate)", () => {
  const entry = acceptedEntry();
  assert.throws(() => validateFrugalityLedger(baseDoc({ entries: [entry, entry] })), (error) => error.message.includes("duplicate (cell_id, replicate)"));
});

test("validateFrugalityLedger refuses amortization.n mismatched with the accepted entries count", () => {
  const entry = acceptedEntry();
  const precomputeEntry = precomputeLedgerEntry({
    receipt: precomputeReceipt(),
    replicate: "rep1",
    amortizationTaskCount: 1,
    evidence: { receipt: { path: "precompute/B-repo.receipt.json", sha256: HEX_64("e") } }
  });
  precomputeEntry.line.amortization.n = 2;
  assert.throws(
    () => validateFrugalityLedger(baseDoc({ entries: [entry], precompute: [precomputeEntry] })),
    (error) => error.message.includes("amortization.n")
  );
});

test("validatePrecomputeReceipt (via precomputeLedgerEntry) refuses a Harness C receipt structurally", () => {
  // Harness C has no precompute step by construction (claude-harness/README.md,
  // "Control arm (Harness C)"); precompute-ledger.mjs's own VALID_HARNESSES
  // set only ever admits A/B, so a "C" receipt is refused before it ever
  // reaches a frugality-ledger document.
  assert.throws(
    () => precomputeLedgerEntry({
      receipt: precomputeReceipt({ harness: "C" }),
      replicate: "rep1",
      amortizationTaskCount: 1,
      evidence: { receipt: { path: "precompute/C-repo.receipt.json", sha256: HEX_64("e") } }
    }),
    (error) => error.message.includes('harness: must be "A" or "B"')
  );
});

test("validateFrugalityLedger refuses a precompute line whose harness equals controlHarness", () => {
  // Structurally the receipt is a valid A/B harness; the semantic pin under
  // test is that no precompute[] entry's harness may equal the document's
  // own controlHarness — exercised here with controlHarness set to "B" so
  // the structural gate above never fires.
  const entry = acceptedEntry();
  const precomputeEntry = precomputeLedgerEntry({
    receipt: precomputeReceipt({ harness: "B" }),
    replicate: "rep1",
    amortizationTaskCount: 1,
    evidence: { receipt: { path: "precompute/B-repo.receipt.json", sha256: HEX_64("e") } }
  });
  assert.throws(
    () => validateFrugalityLedger(baseDoc({ controlHarness: "B", entries: [entry], precompute: [precomputeEntry] })),
    (error) => error.message.includes("harness equals controlHarness")
  );
});
