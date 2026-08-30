#!/usr/bin/env node

import { EvidenceError } from "./hc-cortex-002-evidence-lib.mjs";
import { verifyHcCortex002Release } from "./verify-hc-cortex-002-release-lib.mjs";

const arguments_ = process.argv.slice(2);
if (arguments_.length !== 1 || arguments_[0].startsWith("--")) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "hc-cortex-002-release-verification-error/v1",
    valid: false,
    error: { code: "INVALID_ARGUMENT", path: "$", message: "Usage: verify-hc-cortex-002-release.mjs <release-root>" }
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    process.stdout.write(`${JSON.stringify(verifyHcCortex002Release(arguments_[0]), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: "hc-cortex-002-release-verification-error/v1",
      valid: false,
      error: {
        code: error instanceof EvidenceError ? error.code : "RELEASE_VERIFICATION_INTERNAL_ERROR",
        path: error instanceof EvidenceError ? error.path : "$",
        message: "HC-CORTEX-002 release verification failed closed"
      }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
