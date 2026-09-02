#!/usr/bin/env node
// Thin CLI: prints one precompute ledger line as JSON. The operator's
// published line until the etape-4 aggregator (frugality-ledger-v1) consumes
// precomputeLedgerLine directly (tasks/todo.md:331-338).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { precomputeLedgerLine } from "./precompute-ledger.mjs";

// source: sysexits(3) EX_USAGE — command-line usage error.
const EX_USAGE = 64;

function usage() {
  console.error("usage: precompute-line.mjs --receipt <path> --tasks <n>");
  process.exit(EX_USAGE);
}

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const receiptPath = option("--receipt");
const tasksRaw = option("--tasks");
if (!receiptPath || tasksRaw === undefined) usage();

// --tasks must parse as a positive integer before it ever reaches
// precomputeLedgerLine: a non-integer or non-numeric value used to fall
// through to Number(tasksRaw) (NaN or a fraction) and surface as an
// uncaught exception/stack trace instead of a usage error (review finding
// I3, reproduced on d9c3bd0 with --tasks 0/abc/2.5).
const tasksNumber = Number(tasksRaw);
if (!Number.isInteger(tasksNumber) || tasksNumber < 1) usage();

const receipt = JSON.parse(readFileSync(resolve(receiptPath), "utf8"));
const line = precomputeLedgerLine(receipt, { amortizationTaskCount: tasksNumber });
console.log(JSON.stringify(line, null, 2));
