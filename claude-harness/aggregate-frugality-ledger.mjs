#!/usr/bin/env node
// Thin CLI: the only I/O of the frugality aggregator (tasks/todo.md, chantier
// A, etape 4). Reads one frugality-ledger-v1 file and one
// frugality-aggregation-parameters/v1 file, validates the ledger first
// (claude-harness/frugality-ledger.mjs's validateFrugalityLedger), hashes
// both files' exact bytes on disk, runs the pure aggregator, and writes one
// frugality-summary/v1 document create-exclusively. Every statistical
// decision lives in frugality-aggregate.mjs / frugality-bootstrap.mjs — this
// file only reads bytes, resolves paths, and writes.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { validateFrugalityLedger } from "./frugality-ledger.mjs";
import { aggregateFrugalityLedger } from "./frugality-aggregate.mjs";

// source: man sysexits(3) EX_USAGE — command-line usage error.
const EX_USAGE = 64;
const FLAGS = { "--ledger": "ledger", "--parameters": "parameters", "--out": "out" };

function usage() {
  console.error("usage: aggregate-frugality-ledger.mjs --ledger <path> --parameters <path> --out <path>");
  process.exit(EX_USAGE);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = FLAGS[argv[index]];
    if (key === undefined || options[key] !== undefined || index + 1 >= argv.length) usage();
    options[key] = argv[++index];
  }
  if (options.ledger === undefined || options.parameters === undefined || options.out === undefined) usage();
  return options;
}

// Returns the parsed document next to the sha256 of the file's raw bytes —
// the bytes, not a re-serialization (README "sha256 field vs the CLI's").
function readJsonFile(path, label) {
  const bytes = readFileSync(path);
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`unreadable ${label} at ${path}: ${error.message}`);
  }
  return { value, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function main() {
  const { ledger: ledgerPath, parameters: parametersPath, out } = parseArgs(process.argv.slice(2));
  const ledgerFile = readJsonFile(resolve(ledgerPath), "frugality ledger");
  const parametersFile = readJsonFile(resolve(parametersPath), "aggregation parameters");
  const ledger = validateFrugalityLedger(ledgerFile.value);
  const summary = aggregateFrugalityLedger(ledger, parametersFile.value);
  // Only basenames are published (tasks/lessons.md lesson 7: private
  // filesystem paths stay out of public artifacts).
  const document = {
    ...summary,
    files: {
      ledger: { path: basename(ledgerPath), sha256: ledgerFile.sha256 },
      parameters: { path: basename(parametersPath), sha256: parametersFile.sha256 }
    }
  };
  writeFileSync(resolve(out), `${JSON.stringify(document, null, 2)}\n`, { flag: "wx" });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
