#!/usr/bin/env node
// Thin CLI: the only I/O in the frugality-ledger pipeline. Reads every
// accepted probe cell's bracket/envelope/report plus every precompute
// receipt under one or more replicate result roots, hashes their bytes, and
// writes one frugality-ledger-v1 document (tasks/todo.md, chantier A, etape
// 4). All decisions about shape and validity live in
// claude-harness/frugality-ledger.mjs — this file only reads bytes, resolves
// paths, and writes.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { ledgerEntryFromCell, precomputeLedgerEntry, validateFrugalityLedger } from "./frugality-ledger.mjs";
import { readResultEnvelope } from "./result-envelope.mjs";
import { validatePrecomputeReceipt } from "./precompute-ledger.mjs";

// source: man sysexits(3) EX_USAGE — command-line usage error.
const EX_USAGE = 64;
const ACCEPTED_STATUSES = new Set(["ok", "existing"]);

function usage() {
  console.error("usage: build-frugality-ledger.mjs --result-root <dir> [--result-root <dir> ...] --out <path>");
  process.exit(EX_USAGE);
}

function parseArgs(argv) {
  const resultRoots = [];
  let out;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--result-root") { resultRoots.push(argv[++index]); continue; }
    if (argv[index] === "--out") { out = argv[++index]; continue; }
    usage();
  }
  if (resultRoots.length === 0 || out === undefined) usage();
  return { resultRoots, out };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function evidenceRef(root, absolutePath) {
  return { path: relative(root, absolutePath), sha256: sha256File(absolutePath) };
}

function acceptedCells(root) {
  const summary = JSON.parse(readFileSync(resolve(root, "probes/run-summary.json"), "utf8"));
  const cellIds = summary.results.filter((row) => ACCEPTED_STATUSES.has(row.status)).map((row) => row.id);
  return { completedAt: summary.completed_at, cellIds };
}

// paths bundles the four artifact locations a probe cell reads from behind
// one object (coding-standards.md #4.4: max 4 parameters).
function cellArtifactPaths(root, cellId) {
  return {
    bracket: resolve(root, "manifest/probe-brackets", `${cellId}.json`),
    envelope: resolve(root, "probes", `${cellId}.envelope.json`),
    report: resolve(root, "probes", `${cellId}.json`)
  };
}

function buildEntry(root, replicateId, cellId) {
  const paths = cellArtifactPaths(root, cellId);
  const bracket = JSON.parse(readFileSync(paths.bracket, "utf8"));
  const envelope = readResultEnvelope(paths.envelope);
  const evidence = {
    envelope: evidenceRef(root, paths.envelope),
    bracket: evidenceRef(root, paths.bracket),
    report: evidenceRef(root, paths.report),
    prompt_sha256: bracket.prompt_sha256
  };
  // version is null on any bracket that predates run-probes-sequential.mjs's
  // host_tool capture, or when the version command itself failed at cell
  // time — never fabricated (build-frugality-ledger.mjs's own contract,
  // mirrored from frugality-ledger.mjs's ledgerEntryFromCell host param).
  const host = { tool: "claude-code", version: bracket.before?.host_tool?.version ?? null };
  return ledgerEntryFromCell({ cellId, replicate: replicateId, host, bracket, envelope, evidence });
}

function buildEntriesForReplicate(root, replicateId, cellIds) {
  return cellIds.map((cellId) => buildEntry(root, replicateId, cellId));
}

function buildPrecomputeEntry(root, replicateId, receiptPath, acceptedEntries) {
  const receipt = validatePrecomputeReceipt(JSON.parse(readFileSync(receiptPath, "utf8")));
  const task = basename(receipt.repo);
  const amortizationTaskCount = acceptedEntries.filter(
    (entry) => entry.harness === receipt.harness && entry.task === task && entry.replicate === replicateId
  ).length;
  if (amortizationTaskCount === 0) {
    throw new Error(
      `build-frugality-ledger.mjs: precompute receipt ${receiptPath} has no accepted entries for ` +
      `harness=${receipt.harness} task=${task} replicate=${replicateId} — an unamortizable precompute is refused`
    );
  }
  const evidence = { receipt: evidenceRef(root, receiptPath) };
  return precomputeLedgerEntry({ receipt, replicate: replicateId, amortizationTaskCount, evidence });
}

function buildPrecomputeForReplicate(root, replicateId, acceptedEntries) {
  const precomputeDir = resolve(root, "precompute");
  if (!existsSync(precomputeDir)) return [];
  const receiptNames = readdirSync(precomputeDir).filter((name) => name.endsWith(".receipt.json"));
  return receiptNames.map((name) => buildPrecomputeEntry(root, replicateId, resolve(precomputeDir, name), acceptedEntries));
}

function assembleLedger(resultRoots) {
  const replicates = [];
  const entries = [];
  const precompute = [];
  for (const rootArg of resultRoots) {
    const root = resolve(rootArg);
    const replicateId = basename(root);
    const { completedAt, cellIds } = acceptedCells(root);
    replicates.push({ id: replicateId, runSummaryCompletedAt: completedAt });
    const replicateEntries = buildEntriesForReplicate(root, replicateId, cellIds);
    entries.push(...replicateEntries);
    precompute.push(...buildPrecomputeForReplicate(root, replicateId, replicateEntries));
  }
  return {
    schemaVersion: "frugality-ledger/v1",
    generatedAt: new Date().toISOString(),
    controlHarness: "C",
    replicates,
    entries,
    precompute
  };
}

function main() {
  const { resultRoots, out } = parseArgs(process.argv.slice(2));
  const ledger = validateFrugalityLedger(assembleLedger(resultRoots));
  writeFileSync(resolve(out), `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx" });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
