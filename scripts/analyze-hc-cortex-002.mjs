#!/usr/bin/env node

import { analyzeHcCortex002Release } from "./hc-cortex-002-analysis-lib.mjs";
import { EvidenceError } from "./hc-cortex-002-evidence-lib.mjs";

const arguments_ = process.argv.slice(2);
if (arguments_.length !== 1 || arguments_[0].startsWith("--")) {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: "hc-cortex-002-analysis-error/v1",
    valid: false,
    error: { code: "INVALID_ARGUMENT", path: "$", message: "Usage: analyze-hc-cortex-002.mjs <release-root>" }
  }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    const result = analyzeHcCortex002Release(arguments_[0]);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "hc-cortex-002-analysis-result/v1",
      valid: true,
      releaseId: result.analysis.releaseId,
      rawInputSetSha256: result.analysis.rawInputSetSha256,
      studyVerdict: result.scoring.studyVerdict.label,
      cells: result.analysis.cells.length
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      schemaVersion: "hc-cortex-002-analysis-error/v1",
      valid: false,
      error: {
        code: error instanceof EvidenceError ? error.code : "ANALYSIS_INTERNAL_ERROR",
        path: error instanceof EvidenceError ? error.path : "$",
        message: error instanceof Error ? error.message : "Analysis failed"
      }
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
