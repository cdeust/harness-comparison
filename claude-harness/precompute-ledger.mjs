// Pure module: the precompute line of the measured-frugality ledger
// (tasks/todo.md:331-334, chantier A, etape 3). No I/O — the receipt is
// handed in already read from disk by run-precompute.mjs or a consumer.
//
// Precompute steps this covers: Harness B's run-b-ingestion-unbounded.mjs
// (deterministic analyze_codebase, no LLM) and Harness A's per-repo Graphify
// rebuild (BENCHMARK-PROCESS.md step 2). Harness C has no precompute step by
// construction (claude-harness/README.md, "Control arm (Harness C)").
import { createHash } from "node:crypto";
import { validateUsage } from "./result-envelope.mjs";

// source: tasks/todo.md:331-334 (this ledger line's own schema id, chosen
// here — no external spec pins it)
const PRECOMPUTE_RECEIPT_SCHEMA = "precompute-receipt-v1";
const VALID_HARNESSES = new Set(["A", "B"]);
const RESOURCE_FIELDS = ["real_seconds", "user_seconds", "system_seconds", "max_rss_bytes"];

function isFiniteNumberAtLeast(value, min) {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

// Contract:
// pre: text is the byte contents of a macOS `/usr/bin/time -l -o <file>`
//      report, captured under LC_ALL=C so decimals use "." (measured
//      2026-09-02 on macOS 26.6.2: without LC_ALL=C the operator's French
//      locale prints "0,00 real" instead) —
//      claude-harness/fixtures/time-report.darwin-26.6.2.txt +
//      its .provenance.json.
// post: returns { real_seconds, user_seconds, system_seconds, max_rss_bytes },
//       all finite JS numbers; throws naming the missing/malformed field
//       otherwise. Never throws for any other reason.
export function parseTimeReport(text) {
  if (typeof text !== "string") throw new Error("parseTimeReport: text must be a string");
  // source: man time(1) EXAMPLES section ("0.68 real   0.00 user   0.22 sys").
  const timeLine = text.match(/^\s*([0-9]+\.[0-9]+)\s+real\s+([0-9]+\.[0-9]+)\s+user\s+([0-9]+\.[0-9]+)\s+sys\s*$/m);
  if (!timeLine) {
    throw new Error('parseTimeReport: missing or malformed real/user/sys line (expected LC_ALL=C decimal format, e.g. "0.20 real 0.15 user 0.01 sys")');
  }
  // source: man getrusage(2) ("ru_maxrss the maximum resident set size
  // utilized (in bytes)" — darwin only; Linux's getrusage(2) documents
  // kilobytes for the same field) and man time(1) -l output's field label
  // "maximum resident set size".
  const rssLine = text.match(/^\s*([0-9]+)\s+maximum resident set size\s*$/m);
  if (!rssLine) {
    throw new Error('parseTimeReport: missing or malformed "maximum resident set size" field');
  }
  return {
    real_seconds: Number(timeLine[1]),
    user_seconds: Number(timeLine[2]),
    system_seconds: Number(timeLine[3]),
    max_rss_bytes: Number(rssLine[1])
  };
}

function pushExitError(receipt, errors) {
  if (receipt.exit?.code !== 0 || receipt.exit?.signal !== null) {
    errors.push("exit: must be { code: 0, signal: null } (a failed precompute is never a ledger line)");
  }
}

function pushResourceErrors(receipt, errors) {
  if (!isFiniteNumberAtLeast(receipt.wall_ms, 0)) errors.push("wall_ms: must be a finite number >= 0");
  for (const field of RESOURCE_FIELDS) {
    if (!isFiniteNumberAtLeast(receipt.resources?.[field], 0)) errors.push(`resources.${field}: must be a finite number >= 0`);
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

// Pins artifact's semantics, not only its shape (PR #10 lesson): null means
// no --artifact was declared or the command failed; an object always means
// run-precompute.mjs hashed a file that existed after a zero exit — never a
// "maybe present, check truthiness" value the consumer has to guess at.
function pushArtifactErrors(receipt, errors) {
  const artifact = receipt.artifact;
  if (artifact === null || artifact === undefined) return;
  if (typeof artifact !== "object") {
    errors.push("artifact: must be null or { path: string, sha256: <64 hex chars> }");
    return;
  }
  if (typeof artifact.path !== "string" || artifact.path.trim() === "") {
    errors.push("artifact.path: must be a non-empty string");
  }
  if (typeof artifact.sha256 !== "string" || !SHA256_HEX.test(artifact.sha256)) {
    errors.push("artifact.sha256: must be a 64-character lowercase hex sha256 digest");
  }
}

function pushTimeReportErrors(receipt, errors) {
  if (typeof receipt.time_report?.raw !== "string") {
    errors.push("time_report.raw: must be a string");
    return;
  }
  if (typeof receipt.time_report?.sha256 !== "string") {
    errors.push("time_report.sha256: must be a string");
    return;
  }
  const digest = createHash("sha256").update(receipt.time_report.raw).digest("hex");
  if (digest !== receipt.time_report.sha256) errors.push("time_report.sha256: does not match sha256(time_report.raw)");
}

// Contract:
// pre: receipt is the parsed JSON body of a precompute receipt (typically
//      written by run-precompute.mjs), or arbitrary JSON — this function
//      never throws for shape reasons alone; it collects every violation
//      before deciding.
// post: returns receipt unchanged when every pinned field below satisfies
//       its condition; otherwise throws one Error joining every violation
//       with "; " (same contract shape as result-envelope.mjs's
//       readResultEnvelope — PR #10 lesson: pin semantics, not only shape).
export function validatePrecomputeReceipt(receipt) {
  if (receipt === null || typeof receipt !== "object") {
    throw new Error("invalid precompute receipt: receipt is not an object");
  }
  const errors = [];
  if (receipt.schema !== PRECOMPUTE_RECEIPT_SCHEMA) errors.push(`schema: must equal "${PRECOMPUTE_RECEIPT_SCHEMA}"`);
  if (!VALID_HARNESSES.has(receipt.harness)) errors.push('harness: must be "A" or "B"');
  if (typeof receipt.repo !== "string" || receipt.repo.trim() === "") errors.push("repo: must be a non-empty string");
  // source: man getrusage(2) — ru_maxrss unit differs by platform (bytes on
  // darwin, kilobytes on Linux); an unmeasured platform is refused rather
  // than silently mixing units into one ledger column.
  if (receipt.platform !== "darwin") errors.push('platform: must equal "darwin" (ru_maxrss unit is unverified on other platforms)');
  pushExitError(receipt, errors);
  pushResourceErrors(receipt, errors);
  pushTimeReportErrors(receipt, errors);
  pushArtifactErrors(receipt, errors);
  if (receipt.llm_usage !== null) validateUsage(receipt.llm_usage, errors, "llm_usage");
  if (errors.length > 0) throw new Error(`invalid precompute receipt: ${errors.join("; ")}`);
  return receipt;
}

// Sums all four token classes the Anthropic Messages API reports usage for
// (source: result-envelope.mjs#validateUsage, which pins exactly these four
// fields as the usage schema): input_tokens and output_tokens are billed
// per-request tokens; cache_creation_input_tokens and cache_read_input_tokens
// are the prompt-caching write/read counts. All four are real token volume
// moved through the API, so all four belong in one amortized total.
// Exported (chantier A, etape 4) so claude-harness/frugality-ledger.mjs and
// the etape-4 bootstrap aggregator reuse this one summation rather than
// duplicating it.
export function sumUsageTokens(usage) {
  return usage.input_tokens + usage.output_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
}

// Contract:
// pre: receipt satisfies validatePrecomputeReceipt; options.amortizationTaskCount
//      is present.
// post: returns { harness, repo, raw, amortization: { n, per_task },
//       semantics }. raw always carries the unamortized figures next to
//       per_task — tasks/todo.md:331-334's "never silently diluted" rule.
//       raw carries both wall_ms (the runner's wrapper-inclusive wall clock)
//       and real_seconds (the measured command's own real time from
//       /usr/bin/time) side by side — never only the biased one (review
//       finding I2). per_task is exact division (no rounding) and never
//       carries max_rss_bytes: a peak cannot be amortized across tasks.
//       Throws when amortizationTaskCount is not an integer >= 1.
export function precomputeLedgerLine(receipt, options = {}) {
  const validated = validatePrecomputeReceipt(receipt);
  const { amortizationTaskCount } = options;
  if (!Number.isInteger(amortizationTaskCount) || amortizationTaskCount < 1) {
    throw new Error(`precomputeLedgerLine: amortizationTaskCount must be an integer >= 1, got ${JSON.stringify(amortizationTaskCount)}`);
  }
  const n = amortizationTaskCount;
  const raw = {
    wall_ms: validated.wall_ms,
    real_seconds: validated.resources.real_seconds,
    cpu_user_seconds: validated.resources.user_seconds,
    cpu_system_seconds: validated.resources.system_seconds,
    cpu_seconds: validated.resources.user_seconds + validated.resources.system_seconds,
    max_rss_bytes: validated.resources.max_rss_bytes,
    llm_usage: validated.llm_usage
  };
  const totalLlmTokens = raw.llm_usage === null ? null : sumUsageTokens(raw.llm_usage);
  return {
    harness: validated.harness,
    repo: validated.repo,
    raw,
    amortization: {
      n,
      per_task: {
        wall_ms: raw.wall_ms / n,
        cpu_seconds: raw.cpu_seconds / n,
        llm_tokens: totalLlmTokens === null ? null : totalLlmTokens / n
      }
    },
    semantics: {
      // source: run-precompute.mjs#runMeasured — wall_ms is
      // Date.parse(utcEnd) - Date.parse(utcStart), spanning the runner's own
      // spawn("/usr/bin/time", ...) call, i.e. it includes the /usr/bin/time
      // + env wrapper's own process-startup cost, not only the measured
      // command. real_seconds (man time(1) "real" field) times the command
      // alone. Measured 2026-09-02 on macOS 26.6.2 with `node -e
      // "console.log(1)"` as the measured command: wall_ms=47,
      // real_seconds=0.04 (40ms) — a 7ms / 17.5% bias from the wrapper spawn
      // on a near-instant command (review finding I2: the review's own
      // reproduction found +35% and +52% on other short commands).
      wall_ms: "upper bound: includes /usr/bin/time + env wrapper process-startup overhead on top of the measured command's own real time (raw.real_seconds); use raw.real_seconds for the command's cost alone",
      // source: man time(1), man getrusage(2); measured 2026-09-02 on macOS
      // 26.6.2: a waited-on child's CPU seconds are captured by
      // /usr/bin/time -l (0.67s user, 50.9MB max RSS); a child the parent
      // does not wait for ("cmd & disown") shows 0.00s user — this harness
      // has no getrusage(RUSAGE_CHILDREN) collector (Node exposes none), so
      // any subprocess tree spawned by the measured command that outlives
      // or detaches from it is invisible to this figure.
      cpu_seconds: "lower bound: only CPU time of processes waited on by the measured command's own process tree is counted; a detached or orphaned grandchild is not observed",
      // source: man getrusage(2) ("ru_maxrss the maximum resident set size
      // utilized (in bytes)" — a per-process peak, not a sum across a tree).
      max_rss_bytes: "largest single process in the tree (bytes on darwin), not a sum across the tree; a peak, not a flow — never amortized"
    }
  };
}
