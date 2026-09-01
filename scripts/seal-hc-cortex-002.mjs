#!/usr/bin/env node

import { EvidenceError } from "./hc-cortex-002-evidence-lib.mjs";
import { sealHcCortex002Release } from "./hc-cortex-002-seal-lib.mjs";

const arguments_ = process.argv.slice(2);
let releaseStatus = "PILOT";
const positional = [];
let invalid = false;
for (let index = 0; index < arguments_.length; index += 1) {
  const argument = arguments_[index];
  if (argument === "--status" && index + 1 < arguments_.length) {
    releaseStatus = arguments_[index + 1];
    index += 1;
  } else if (argument.startsWith("--")) invalid = true;
  else positional.push(argument);
}

if (invalid || positional.length !== 1) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "hc-cortex-002-seal-error/v1",
    valid: false,
    error: { code: "INVALID_ARGUMENT", path: "$", message: "Usage: seal-hc-cortex-002.mjs [--status PILOT|VERIFIED|PUBLISHED] <release-root>" }
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    const manifest = sealHcCortex002Release(positional[0], { releaseStatus });
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "hc-cortex-002-seal-result/v1",
      valid: true,
      releaseId: manifest.releaseId,
      releaseStatus: manifest.releaseStatus,
      artifacts: manifest.artifacts.length,
      cells: manifest.cells.length
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: "hc-cortex-002-seal-error/v1",
      valid: false,
      error: {
        code: error instanceof EvidenceError ? error.code : "SEAL_INTERNAL_ERROR",
        path: error instanceof EvidenceError ? error.path : "$",
        message: error instanceof Error ? error.message : "Sealing failed"
      }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
