#!/usr/bin/env node
// Thin CLI: prints one precompute ledger line as JSON. The operator's
// published line until the etape-4 aggregator (frugality-ledger-v1) consumes
// precomputeLedgerLine directly (tasks/todo.md:331-338).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { precomputeLedgerLine } from "./precompute-ledger.mjs";

function usage() {
  console.error("usage: precompute-line.mjs --receipt <path> --tasks <n>");
  process.exit(64);
}

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const receiptPath = option("--receipt");
const tasksRaw = option("--tasks");
if (!receiptPath || tasksRaw === undefined) usage();

const receipt = JSON.parse(readFileSync(resolve(receiptPath), "utf8"));
const line = precomputeLedgerLine(receipt, { amortizationTaskCount: Number(tasksRaw) });
console.log(JSON.stringify(line, null, 2));
