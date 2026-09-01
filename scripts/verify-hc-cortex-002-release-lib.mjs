import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeHcCortex002Release } from "./hc-cortex-002-analysis-lib.mjs";
import {
  assertPrivateDataAbsent,
  failEvidence,
  parseJsonFile,
  sameSnapshot,
  snapshotRelease
} from "./hc-cortex-002-evidence-lib.mjs";
import { sealHcCortex002Release } from "./hc-cortex-002-seal-lib.mjs";

function expectedBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requireExactBytes(root, path, expected) {
  const observed = readFileSync(join(root, ...path.split("/")));
  if (!observed.equals(Buffer.isBuffer(expected) ? expected : Buffer.from(expected, "utf8"))) {
    failEvidence("DERIVED_ARTIFACT_RECOMPUTATION_MISMATCH", path, "Derived artifact differs from a fresh raw-evidence recomputation");
  }
}

export function verifyHcCortex002Release(releaseRoot) {
  const initial = snapshotRelease(releaseRoot);
  assertPrivateDataAbsent(initial);
  const storedAnalysis = parseJsonFile(initial, "analysis/analysis.json");
  const storedManifest = parseJsonFile(initial, "execution-manifest.json");
  const recomputed = analyzeHcCortex002Release(releaseRoot, {
    generatedAt: storedAnalysis.generatedAt,
    verifyExisting: true,
    write: false
  });
  for (const [path, content] of recomputed.documents) requireExactBytes(initial.root, path, content);
  const manifest = sealHcCortex002Release(releaseRoot, {
    releaseStatus: storedManifest.releaseStatus,
    generatedAt: storedManifest.generatedAt,
    verifyExisting: true,
    write: false
  });
  requireExactBytes(initial.root, "execution-manifest.json", expectedBytes(manifest));
  const confirmation = snapshotRelease(releaseRoot);
  if (!sameSnapshot(initial, confirmation)) {
    failEvidence("RELEASE_CHANGED_DURING_VERIFICATION", "$", "Release changed during read-only verification");
  }
  return {
    schemaVersion: "hc-cortex-002-release-verification/v1",
    valid: true,
    releaseId: recomputed.analysis.releaseId,
    releaseStatus: storedManifest.releaseStatus,
    rawInputSetSha256: recomputed.analysis.rawInputSetSha256,
    studyVerdict: recomputed.scoring.studyVerdict.label
  };
}
