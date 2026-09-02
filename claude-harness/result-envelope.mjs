// Pure validator for the `claude -p --output-format json` "result" envelope
// (SDKResultMessage). No I/O in this module — readResultEnvelope below is the
// only function that touches the filesystem, and it exists only because
// run-probes-sequential.mjs calls it.
import { readFileSync } from "node:fs";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isIntegerAtLeast(value, min) {
  return Number.isInteger(value) && value >= min;
}

function isFiniteNumberAtLeast(value, min) {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

// source: https://code.claude.com/docs/en/agent-sdk/typescript (NonNullableUsage:
// "{ input_tokens: number; output_tokens: number; cache_creation_input_tokens:
// number; cache_read_input_tokens: number; }")
//
// fieldPrefix is exposed (default "usage") so a caller validating a usage-
// shaped block under a different field name — e.g. precompute-ledger.mjs's
// `llm_usage` — reuses this single pinned rule set instead of duplicating it
// (claude-harness/precompute-ledger.mjs's validatePrecomputeReceipt).
export function validateUsage(usage, errors, fieldPrefix = "usage") {
  if (usage === null || typeof usage !== "object") {
    errors.push(`${fieldPrefix}: is not an object`);
    return;
  }
  for (const field of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) {
    if (!isIntegerAtLeast(usage[field], 0)) errors.push(`${fieldPrefix}.${field}: must be an integer >= 0`);
  }
}

// source: https://code.claude.com/docs/en/agent-sdk/typescript (ModelUsage:
// "{ inputTokens: number; outputTokens: number; ...; cacheReadInputTokens:
// number; cacheCreationInputTokens: number; ... }") for token fields;
// costUSD is not named on that page — source: measured, claude 2.1.258
// envelope claude-harness/fixtures/result-envelope.claude-2.1.258.json
function validateModelUsageEntry(modelId, entry, errors) {
  for (const field of ["inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens"]) {
    if (!isIntegerAtLeast(entry?.[field], 0)) errors.push(`modelUsage.${modelId}.${field}: must be an integer >= 0`);
  }
  if (!isFiniteNumberAtLeast(entry?.costUSD, 0)) errors.push(`modelUsage.${modelId}.costUSD: must be a finite number >= 0`);
}

// source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage:
// "modelUsage: { [modelName: string]: ModelUsage }")
function validateModelUsage(modelUsage, errors) {
  if (modelUsage === null || typeof modelUsage !== "object") {
    errors.push("modelUsage: is not an object");
    return;
  }
  const modelIds = Object.keys(modelUsage);
  if (modelIds.length === 0) {
    errors.push("modelUsage: must have at least one model key");
    return;
  }
  for (const modelId of modelIds) validateModelUsageEntry(modelId, modelUsage[modelId], errors);
}

// Contract:
// pre: value is the parsed JSON body of a `claude -p --output-format json`
//      invocation, or arbitrary JSON — this function never throws.
// post: returns { valid, errors }. errors is empty iff every pinned field
//       below satisfies its condition. Unknown extra top-level fields never
//       fail validation — the CLI adds fields across versions (measured: the
//       2.1.258 fixture already carries several fields absent from the SDK
//       reference page, e.g. ttft_ms, subagent_stats).
export function validateResultEnvelope(value) {
  const errors = [];
  if (value === null || typeof value !== "object") {
    return { valid: false, errors: ["envelope: is not an object"] };
  }

  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage:
  // "type: \"result\"")
  if (value.type !== "result") errors.push('type: must equal "result"');
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage:
  // "subtype: \"success\"" — a discriminated union also carries non-success
  // subtypes on other branches, so only non-empty string is pinned here)
  if (!isNonEmptyString(value.subtype)) errors.push("subtype: must be a non-empty string");
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "is_error: boolean")
  if (typeof value.is_error !== "boolean") {
    errors.push("is_error: must be a boolean");
  } else if (value.is_error === true) {
    // source: measured 2026-09-02, claude 2.1.258 under an unauthenticated isolated
    // home: is_error:true came with terminal_reason "api_error", total_cost_usd 0 and
    // an empty modelUsage — an errored result is not a measured cell, so the ledger
    // must refuse it even when the cost fields happen to be populated.
    errors.push("is_error: must be false (an errored result is not an accepted cell)");
  }
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "session_id: string")
  if (!isNonEmptyString(value.session_id)) errors.push("session_id: must be a non-empty string");
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "num_turns: number");
  // >= 1 source: measured, claude 2.1.258 envelope claude-harness/fixtures/result-envelope.claude-2.1.258.json
  // (a completed result always reports at least one turn)
  if (!isIntegerAtLeast(value.num_turns, 1)) errors.push("num_turns: must be an integer >= 1");
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "duration_ms: number")
  if (!isIntegerAtLeast(value.duration_ms, 0)) errors.push("duration_ms: must be an integer >= 0");
  // source: https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "duration_api_ms: number")
  if (!isIntegerAtLeast(value.duration_api_ms, 0)) errors.push("duration_api_ms: must be an integer >= 0");
  // source: https://code.claude.com/docs/en/headless ("the response payload includes
  // total_cost_usd and a per-model cost breakdown"); type source:
  // https://code.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage: "total_cost_usd: number")
  if (!isFiniteNumberAtLeast(value.total_cost_usd, 0)) errors.push("total_cost_usd: must be a finite number >= 0");

  validateUsage(value.usage, errors);
  validateModelUsage(value.modelUsage, errors);

  return { valid: errors.length === 0, errors };
}

// Wired from run-probes-sequential.mjs's acceptStagedReport: reads the
// captured envelope file, parses it, and throws with every validation error
// joined into one message when it is invalid.
export function readResultEnvelope(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`unreadable result envelope at ${path}: ${error.message}`);
  }
  const { valid, errors } = validateResultEnvelope(parsed);
  if (!valid) throw new Error(`invalid result envelope at ${path}: ${errors.join("; ")}`);
  return parsed;
}
