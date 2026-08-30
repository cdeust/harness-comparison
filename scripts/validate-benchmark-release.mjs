#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateBenchmarkProtocol,
  validateBenchmarkRelease,
  validateBenchmarkReleaseSet,
  validationSchemaVersion
} from "./benchmark-release-lib.mjs";
import { verifyHcCortex002Release } from "./verify-hc-cortex-002-release-lib.mjs";

function withIssueSpecificVerification(generic, searchRoot) {
  if (!generic.valid || !Array.isArray(generic.summary?.releases)) return generic;
  const errors = [...generic.errors];
  const verified = [];
  for (const release of generic.summary.releases) {
    const root = release.path === "." ? resolve(searchRoot) : resolve(searchRoot, ...release.path.split("/"));
    let protocol;
    try {
      protocol = JSON.parse(readFileSync(resolve(root, "protocol.json"), "utf8"));
    } catch {
      errors.push({
        code: "ISSUE_SPECIFIC_VERIFICATION_FAILED",
        path: release.path,
        message: "Discovered release protocol could not be inspected for its issue-specific verifier"
      });
      continue;
    }
    if (protocol?.protocolId !== "2026-08-30-hc-cortex-002-v1") continue;
    try {
      const receipt = verifyHcCortex002Release(root);
      verified.push({ path: release.path, protocolId: protocol.protocolId, receipt });
    } catch {
      errors.push({
        code: "HC_CORTEX_002_DERIVED_EVIDENCE_INVALID",
        path: release.path,
        message: "HC-CORTEX-002 derived evidence does not reproduce exactly from raw artifacts"
      });
    }
  }
  errors.sort((left, right) =>
    left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.message.localeCompare(right.message)
  );
  return {
    ...generic,
    valid: errors.length === 0,
    errors,
    summary: { ...generic.summary, issueSpecificVerification: { hcCortex002: verified } }
  };
}

const arguments_ = process.argv.slice(2);
const positional = [];
let phase = "release";
let sourceRepositoryRoot;
let invalidArguments = false;

for (let index = 0; index < arguments_.length; index += 1) {
  const argument = arguments_[index];
  if (argument === "--phase" && index + 1 < arguments_.length) {
    phase = arguments_[index + 1];
    index += 1;
  } else if (argument === "--source-repo" && index + 1 < arguments_.length) {
    sourceRepositoryRoot = arguments_[index + 1];
    index += 1;
  } else if (argument.startsWith("--")) {
    invalidArguments = true;
  } else {
    positional.push(argument);
  }
}

let result;
if (invalidArguments || !["protocol", "release", "discover"].includes(phase) || positional.length !== 1) {
  result = {
    schemaVersion: validationSchemaVersion,
    valid: false,
    errors: [{
      code: "INVALID_ARGUMENT",
      path: "$",
      message: "Usage: validate-benchmark-release.mjs [--phase protocol|release|discover] [--source-repo <git-root>] <path>"
    }],
    summary: null
  };
} else if (phase === "protocol") {
  result = validateBenchmarkProtocol(positional[0], { sourceRepositoryRoot });
} else if (phase === "discover") {
  result = withIssueSpecificVerification(
    validateBenchmarkReleaseSet(positional[0], { sourceRepositoryRoot }),
    positional[0]
  );
} else {
  result = validateBenchmarkRelease(positional[0], { sourceRepositoryRoot });
}

const stream = result.valid ? process.stdout : process.stderr;
stream.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.valid ? 0 : 1;
