#!/usr/bin/env node
// Thin CLI: runs a precompute command (Harness A's Graphify rebuild, or
// Harness B's run-b-ingestion-unbounded.mjs) under macOS's
// `/usr/bin/time -l` and writes a precompute-receipt-v1 JSON — the raw
// material precompute-line.mjs turns into a ledger row via
// precompute-ledger.mjs (tasks/todo.md:331-334, chantier A, etape 3).
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { release as osRelease } from "node:os";
import { resolve } from "node:path";
import { parseTimeReport } from "./precompute-ledger.mjs";
import { readResultEnvelope } from "./result-envelope.mjs";

function usage() {
  console.error(
    "usage: run-precompute.mjs --harness A|B --repo <path> --receipt-out <path> " +
    "[--envelope <path>] [--artifact <path>] -- <command> [args...]"
  );
  process.exit(64);
}

function parseArgs(argv) {
  const dashIndex = argv.indexOf("--");
  if (dashIndex === -1) usage();
  const flags = argv.slice(0, dashIndex);
  const command = argv.slice(dashIndex + 1);
  const option = (name) => {
    const index = flags.indexOf(name);
    return index === -1 ? undefined : flags[index + 1];
  };
  const harness = option("--harness");
  const repo = option("--repo");
  const receiptOut = option("--receipt-out");
  const envelope = option("--envelope");
  const artifact = option("--artifact");
  if (!new Set(["A", "B"]).has(harness) || !repo || !receiptOut || command.length === 0) usage();
  return { harness, repo, receiptOut, envelope, artifact, command };
}

// The child under time must see the operator's original locale, not the
// LC_ALL=C forced on /usr/bin/time itself for its own "." decimal report
// (measured 2026-09-02 on macOS 26.6.2 — without LC_ALL=C, /usr/bin/time
// prints "0,00 real" under a French locale). Wrapping in `env` restores the
// original value (or its absence) for the measured command specifically.
function wrapForOriginalLocale(command) {
  const originalLcAll = process.env.LC_ALL;
  return originalLcAll !== undefined
    ? ["env", `LC_ALL=${originalLcAll}`, ...command]
    : ["env", "-u", "LC_ALL", ...command];
}

function gitHead(repo) {
  try {
    // execFileSync inherits stderr from the parent by default (node:child_process
    // docs) — piped explicitly so a non-git repo's "fatal: not a git repository"
    // never bleeds into this runner's own log for a condition we already handle.
    return execFileSync("git", ["-C", resolve(repo), "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

// source: man sw_vers(1) — ProductName/ProductVersion/BuildVersion lines.
function darwinOsRelease() {
  const raw = execFileSync("sw_vers", [], { encoding: "utf8" });
  const fields = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^(\w[\w ]*):\s*(.+)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return { ...fields, os_release: osRelease() };
}

// Async spawn + streamed stdio, never spawnSync's bounded maxBuffer — a
// precompute command's log must never be silently truncated (same
// discipline as run-isolated.mjs and run-probes-sequential.mjs).
async function runMeasured({ repo, command, timeReportPath, logPath }) {
  const timeEnv = { ...process.env, LC_ALL: "C" };
  const timeArgs = ["-l", "-o", timeReportPath, ...wrapForOriginalLocale(command)];
  const log = createWriteStream(logPath, { flags: "wx" });
  const utcStart = new Date().toISOString();
  const exit = await new Promise((fulfill) => {
    const child = spawn("/usr/bin/time", timeArgs, { cwd: resolve(repo), env: timeEnv, stdio: ["ignore", "pipe", "pipe"] });
    let spawnError = null;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once("error", (error) => {
      spawnError = error;
      log.write(`\nRUNNER SPAWN ERROR: ${error.stack || error.message}\n`);
    });
    child.once("close", (code, signal) => fulfill({ code, signal, error: spawnError?.message ?? null }));
  });
  await new Promise((fulfill) => log.end(fulfill));
  return { exit, utcStart, utcEnd: new Date().toISOString() };
}

function readTimeReportRaw(timeReportPath) {
  try {
    return readFileSync(timeReportPath, "utf8");
  } catch (error) {
    throw new Error(`run-precompute.mjs: /usr/bin/time did not produce a report at ${timeReportPath}: ${error.message}`);
  }
}

function readArtifact(artifactPath, exitCode) {
  if (!artifactPath || exitCode !== 0) return null;
  const resolved = resolve(artifactPath);
  if (!existsSync(resolved)) return null;
  return { path: resolved, sha256: createHash("sha256").update(readFileSync(resolved)).digest("hex") };
}

// options bundles the parsed CLI inputs plus the pre-validated llm_usage
// block behind one parameter (coding-standards.md §4.4: max 4 parameters).
function buildReceipt(options) {
  const { harness, repo, command, timeReportPath, timeReportRaw, resources, run, artifact, llmUsage } = options;
  return {
    schema: "precompute-receipt-v1",
    harness,
    repo: resolve(repo),
    repo_git_head: gitHead(repo),
    platform: process.platform,
    os_release: darwinOsRelease(),
    command,
    utc_start: run.utcStart,
    utc_end: run.utcEnd,
    wall_ms: Date.parse(run.utcEnd) - Date.parse(run.utcStart),
    exit: { code: run.exit.code, signal: run.exit.signal },
    time_report: { path: timeReportPath, sha256: createHash("sha256").update(timeReportRaw).digest("hex"), raw: timeReportRaw },
    resources,
    artifact,
    llm_usage: llmUsage
  };
}

async function main() {
  const { harness, repo, receiptOut, envelope, artifact, command } = parseArgs(process.argv.slice(2));
  if (process.platform !== "darwin") {
    throw new Error(`run-precompute.mjs: only supported on darwin (ru_maxrss unit is unverified elsewhere); got ${process.platform}`);
  }
  const receiptPath = resolve(receiptOut);
  const timeReportPath = `${receiptPath}.time.txt`;
  const logPath = `${receiptPath}.log`;
  // Create-exclusive discipline, same as the rest of this harness: refuse
  // before spawning rather than silently overwriting a prior cell's evidence.
  for (const path of [receiptPath, timeReportPath, logPath]) {
    if (existsSync(path)) throw new Error(`refusing to start: precompute artifact already exists: ${path}`);
  }
  // llm_usage is an input to this run (already captured and validated by a
  // prior run-isolated.mjs --envelope-out cell), read up front so a bad
  // path fails before the measured command is ever spawned.
  const llmUsage = envelope ? readResultEnvelope(resolve(envelope)).usage : null;

  const run = await runMeasured({ repo, command, timeReportPath, logPath });
  const timeReportRaw = readTimeReportRaw(timeReportPath);
  const resources = parseTimeReport(timeReportRaw);
  const receiptArtifact = readArtifact(artifact, run.exit.code);
  const receipt = buildReceipt({ harness, repo, command, timeReportPath, timeReportRaw, resources, run, artifact: receiptArtifact, llmUsage });

  // Non-zero exit still writes the receipt: evidence is preserved even when
  // the precompute command failed, exactly like run-probes-sequential.mjs
  // never fabricates a report for a crashed cell.
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  process.exit(run.exit.code ?? 1);
}

await main();
