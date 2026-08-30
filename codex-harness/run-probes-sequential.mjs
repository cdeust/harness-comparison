#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statfsSync,
  writeFileSync
} from "node:fs";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { availableParallelism, freemem, loadavg, totalmem, uptime } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const workspace = resolve(import.meta.dirname, "..");
const resultRoot = resolve(workspace, "results/codex-rev3-isolated-20260825");
const probeRoot = resolve(resultRoot, "probes");
const manifestRoot = resolve(resultRoot, "manifest", "probe-brackets");
const corpusRoot = "/Users/cdeust/Developments/anthropic-partnership";
const repoNames = ["zetetic-team-subagents", "ai-architect-mcp-codebase", "cortex-viz", "Cortex", "ai-architect-mcp-spec"];
const dryRun = process.argv.includes("--dry-run");

mkdirSync(probeRoot, { recursive: true });
mkdirSync(manifestRoot, { recursive: true });

const repoCells = [
  ...repoNames.map((name) => ({
    id: `B-${name}`,
    harness: "B",
    repo: resolve(corpusRoot, name),
    prompt: resolve(import.meta.dirname, "prompts/probe-b.md"),
    values: {
      REPO: resolve(corpusRoot, name),
      GRAPH_DIR: resolve(resultRoot, "harness-b-unbounded/graphs", name)
    },
    artifact: resolve(resultRoot, "harness-b-unbounded/graphs", name, "graph"),
    expectedIds: ["P1", "P2", "P3"],
    resultKey: "probes"
  })),
  ...repoNames.slice(1).map((name) => ({
    id: `A-${name}`,
    harness: "A",
    repo: resolve(corpusRoot, name),
    prompt: resolve(import.meta.dirname, "prompts/probe-a.md"),
    values: { REPO: resolve(corpusRoot, name) },
    artifact: resolve(corpusRoot, name, "graphify-out/graph.json"),
    expectedIds: ["P1", "P2", "P3"],
    resultKey: "probes"
  }))
];

const componentCells = ["B", "A"].map((harness) => ({
  id: `${harness}-components`,
  harness,
  repo: workspace,
  prompt: resolve(import.meta.dirname, `prompts/components-${harness.toLowerCase()}.md`),
  values: {},
  expectedIds: ["C1", "C2", "C3", "C4", "C5"],
  resultKey: "components"
}));

const cells = [...repoCells, ...componentCells];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function gitSnapshot(repo) {
  if (repo === workspace) return null;
  const run = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  const status = run("status", "--porcelain=v1");
  const trackedDiff = execFileSync("git", ["-C", repo, "diff", "--binary", "--no-ext-diff"]);
  const untracked = execFileSync("git", ["-C", repo, "ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter(Boolean).sort();
  // Tool state is verified through the explicit graph artifact hash below;
  // source-like untracked files are content-hashed here.
  const excludedPrefixes = [".serena/", "graphify-out/", ".claude/worktrees/"];
  const sourcePaths = untracked.filter((path) => !excludedPrefixes.some((prefix) => path.startsWith(prefix)));
  const untrackedHash = createHash("sha256");
  let untrackedFileCount = 0;
  for (const path of sourcePaths) {
    const absolute = resolve(repo, path);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) continue;
    untrackedHash.update(path).update("\0").update(readFileSync(absolute)).update("\0");
    untrackedFileCount += 1;
  }
  return {
    head: run("rev-parse", "HEAD"),
    status_sha256: sha256(status),
    tracked_diff_sha256: sha256(trackedDiff),
    untracked_source_sha256: untrackedHash.digest("hex"),
    untracked_source_file_count: untrackedFileCount,
    excluded_tool_state_prefixes: excludedPrefixes,
    status
  };
}

function processSnapshot() {
  let output = "";
  try {
    output = execFileSync("ps", ["-axo", "pid=,ppid=,etime=,command="], { encoding: "utf8" });
  } catch (error) {
    return { error: error.message, processes: [] };
  }
  const classes = [
    ["compiler", /(?:^|\/)(?:cargo|rustc)(?:\s|$)/],
    ["codex", /(?:^|\s|\/)codex(?:\s|$)/],
    ["ai-architect", /ai-architect-mcp-codebase/],
    ["cortex", /hypermnesia-mcp|mcp_server.*profile.*lean/],
    ["graphify", /graphify/],
    ["claude-mem", /claude-mem/]
  ];
  const processes = [];
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, pid, ppid, elapsed, command] = match;
    const found = classes.find(([, pattern]) => pattern.test(command));
    if (!found || Number(pid) === process.pid) continue;
    processes.push({ pid: Number(pid), ppid: Number(ppid), elapsed, class: found[0], executable: basename(command.split(/\s+/)[0]) });
  }
  return { processes };
}

function environmentSnapshot(cell) {
  const disk = statfsSync(workspace);
  return {
    utc: new Date().toISOString(),
    uptime_seconds: uptime(),
    logical_cpu_count: availableParallelism(),
    load_average: loadavg(),
    memory_bytes: { free: freemem(), total: totalmem() },
    disk_bytes: { available: disk.bavail * disk.bsize, total: disk.blocks * disk.bsize },
    git: gitSnapshot(cell.repo),
    qualified_artifact: cell.artifact ? { path: cell.artifact, sha256: fileSha256(cell.artifact) } : null,
    peers: processSnapshot()
  };
}

function validateReport(path, cell) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (parsed.harness !== cell.harness) throw new Error(`${cell.id}: wrong harness in report`);
  const expectedTarget = cell.resultKey === "components" ? "(harness-level)" : cell.repo;
  if (parsed.target_repo !== expectedTarget) throw new Error(`${cell.id}: wrong target_repo in report`);
  let rows = parsed[cell.resultKey];
  if (cell.resultKey === "components" && rows && !Array.isArray(rows) && typeof rows === "object") {
    rows = Object.entries(rows).map(([id, row]) => ({ id, ...row }));
  }
  if (!Array.isArray(rows)) throw new Error(`${cell.id}: ${cell.resultKey} is not an array or keyed object`);
  const ids = rows.map((row) => row.id);
  if (JSON.stringify(ids) !== JSON.stringify(cell.expectedIds)) {
    throw new Error(`${cell.id}: expected ${cell.expectedIds.join(",")}, got ${ids.join(",")}`);
  }
  for (const row of rows) {
    if (!row || typeof row !== "object") throw new Error(`${cell.id}: malformed ${row?.id ?? "unknown"} row`);
    for (const field of ["question", "answer"]) {
      if (typeof row[field] !== "string" || row[field].trim() === "") throw new Error(`${cell.id}: ${row.id}.${field} is empty`);
    }
    if (!Array.isArray(row.grounding_artifacts)) throw new Error(`${cell.id}: ${row.id}.grounding_artifacts is not an array`);
    if (!(Array.isArray(row.tool_calls_made) || Number.isInteger(row.tool_calls_made))) throw new Error(`${cell.id}: ${row.id}.tool_calls_made has the wrong type`);
    if (!Array.isArray(row.errors)) throw new Error(`${cell.id}: ${row.id}.errors is not an array`);
  }
  if (!(Object.prototype.hasOwnProperty.call(parsed, "notes") && parsed.notes !== null)) {
    throw new Error(`${cell.id}: notes is missing or null`);
  }
  return parsed;
}

async function runCell(cell) {
  const output = resolve(probeRoot, `${cell.id}.json`);
  const logPath = resolve(probeRoot, `${cell.id}.run.log`);
  const bracketPath = resolve(manifestRoot, `${cell.id}.json`);
  if (existsSync(output)) {
    validateReport(output, cell);
    console.log(`SKIP ${cell.id}: existing validated report`);
    return { id: cell.id, status: "existing" };
  }
  if (existsSync(logPath) || existsSync(bracketPath)) {
    throw new Error(`${cell.id}: partial prior artifacts exist; preserve or quarantine them before retrying`);
  }

  const stage = mkdtempSync(join(tmpdir(), `codex-rev3-${cell.id}-`));
  const stagedReport = resolve(stage, "report.json");
  const stagedPrompt = resolve(stage, "prompt.md");
  copyFileSync(cell.prompt, stagedPrompt, fsConstants.COPYFILE_EXCL);
  const before = environmentSnapshot(cell);
  const promptText = readFileSync(stagedPrompt, "utf8");
  console.log(`START ${cell.id} ${before.utc} stage=${stage}`);

  const args = [
    resolve(import.meta.dirname, "run-isolated.mjs"),
    "--harness", cell.harness,
    "--cwd", stage,
    "--prompt-file", stagedPrompt,
    ...Object.entries({ ...cell.values, OUTPUT: stagedReport }).flatMap(([key, value]) => ["--value", `${key}=${value}`])
  ];
  const env = {
    ...process.env,
    GRAPHIFY_PROJECT: cell.repo === workspace ? resolve(corpusRoot, repoNames[0]) : cell.repo,
    HARNESS_A_OBSIDIAN_VAULT_PATH: resolve(import.meta.dirname, "runtime/a/obsidian-vault")
  };
  const log = createWriteStream(logPath, { flags: "wx" });
  const exit = await new Promise((fulfill) => {
    const child = spawn(process.execPath, args, { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] });
    let spawnError = null;
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once("error", (error) => {
      spawnError = error;
      log.write(`\nORCHESTRATOR SPAWN ERROR: ${error.stack || error.message}\n`);
    });
    // 'close' fires after stdio closes; using 'exit' here can truncate the raw log.
    child.once("close", (code, signal) => fulfill({ code, signal, error: spawnError?.message ?? null }));
  });
  await new Promise((fulfill) => log.end(fulfill));
  const after = environmentSnapshot(cell);
  const bracket = {
    cell: cell.id,
    execution_policy: "fresh staged Codex process; sequential; no fixed wall-clock timeout",
    prompt_sha256: sha256(promptText),
    staging_dir: stage,
    before,
    after,
    elapsed_ms: Date.parse(after.utc) - Date.parse(before.utc),
    exit
  };
  writeFileSync(bracketPath, `${JSON.stringify(bracket, null, 2)}\n`, { flag: "wx" });

  if (exit.code !== 0 || exit.signal !== null || exit.error !== null) {
    console.log(`FAIL ${cell.id}: child did not exit cleanly: ${JSON.stringify(exit)}`);
    return { id: cell.id, status: "failed", exit, error: "child did not exit cleanly" };
  }
  if (!existsSync(stagedReport)) {
    console.log(`FAIL ${cell.id}: no staged report, exit=${JSON.stringify(exit)}`);
    return { id: cell.id, status: "failed", exit };
  }
  const sourceChanged = before.git && (
    before.git.head !== after.git?.head ||
    before.git.status_sha256 !== after.git?.status_sha256 ||
    before.git.tracked_diff_sha256 !== after.git?.tracked_diff_sha256 ||
    before.git.untracked_source_sha256 !== after.git?.untracked_source_sha256
  );
  const artifactChanged = before.qualified_artifact?.sha256 !== after.qualified_artifact?.sha256;
  if (sourceChanged || artifactChanged) {
    console.log(`FAIL ${cell.id}: target repository changed while the cell ran`);
    return { id: cell.id, status: "failed", exit, error: "target repository changed during probe" };
  }
  try {
    validateReport(stagedReport, cell);
  } catch (error) {
    console.log(`FAIL ${cell.id}: invalid staged report: ${error.message}`);
    return { id: cell.id, status: "failed", exit, error: error.message };
  }
  copyFileSync(stagedReport, output, fsConstants.COPYFILE_EXCL);
  console.log(`DONE ${cell.id} ${after.utc} elapsed_ms=${bracket.elapsed_ms} exit=${JSON.stringify(exit)}`);
  return { id: cell.id, status: "ok", exit };
}

if (dryRun) {
  for (const cell of cells) {
    const output = resolve(probeRoot, `${cell.id}.json`);
    console.log(`${existsSync(output) ? "EXISTING" : "PENDING"} ${cell.id}`);
    if (existsSync(output)) validateReport(output, cell);
  }
} else {
  const summaryPath = resolve(probeRoot, "run-summary.json");
  if (existsSync(summaryPath)) throw new Error(`refusing to start: run summary already exists at ${summaryPath}`);
  const results = [];
  for (const cell of cells) {
    try {
      results.push(await runCell(cell));
    } catch (error) {
      console.log(`FAIL ${cell.id}: orchestrator error: ${error.stack || error.message}`);
      results.push({ id: cell.id, status: "failed", error: error.message });
    }
  }
  writeFileSync(summaryPath, `${JSON.stringify({ completed_at: new Date().toISOString(), results }, null, 2)}\n`, { flag: "wx" });
  if (results.some((row) => !new Set(["ok", "existing"]).has(row.status))) process.exitCode = 1;
}
