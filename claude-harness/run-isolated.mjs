#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";

function usage() {
  console.error("usage: run-isolated.mjs --harness A|B --cwd <repo> --prompt-file <file> [--value KEY=VALUE ...] [--envelope-out <path>]");
  process.exit(64);
}

function expandEnvironment(value) {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)(?::([-?])([^}]*))?\}/g, (_match, name, mode, fallback) => {
      if (process.env[name]) return process.env[name];
      if (mode === "-") return fallback;
      if (mode === "?") throw new Error(`required environment variable is unset: ${name}`);
      throw new Error(`environment variable is unset: ${name}`);
    });
  }
  if (Array.isArray(value)) return value.map(expandEnvironment);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, expandEnvironment(entry)]));
  return value;
}

const argv = process.argv.slice(2);
const option = (name) => {
  const position = argv.indexOf(name);
  return position === -1 ? undefined : argv[position + 1];
};
const harness = option("--harness");
const cwd = option("--cwd");
const promptFile = option("--prompt-file");
const envelopeOut = option("--envelope-out");
if (!new Set(["A", "B"]).has(harness) || !cwd || !promptFile) usage();
// Create-exclusive discipline, same as the rest of this harness: refuse
// before spawning rather than silently overwriting a prior cell's envelope.
if (envelopeOut && existsSync(envelopeOut)) {
  throw new Error(`refusing to start: envelope output already exists: ${envelopeOut}`);
}

const manifestPath = resolve(import.meta.dirname, `harness-${harness.toLowerCase()}.mcp.json`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const replacements = new Map();
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] !== "--value") continue;
  const assignment = argv[index + 1] ?? "";
  const separator = assignment.indexOf("=");
  if (separator <= 0) throw new Error(`invalid --value assignment: ${assignment}`);
  replacements.set(assignment.slice(0, separator), assignment.slice(separator + 1));
}
const prompt = readFileSync(resolve(promptFile), "utf8").replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
  if (!replacements.has(key)) throw new Error(`prompt placeholder has no --value: ${key}`);
  return replacements.get(key);
});

// expandEnvironment resolves this harness's own env-var placeholders (e.g.
// HARNESS_A_OBSIDIAN_VAULT_PATH) before the config ever reaches --mcp-config —
// mirrors codex-harness/run-isolated.mjs's own TOML-injection step, adapted
// to Claude's file-based --mcp-config instead of Codex's inline --config.
const mcpServers = expandEnvironment(manifest.mcpServers);
const runtimeRoot = resolve(import.meta.dirname, "runtime", harness.toLowerCase());
const claudeHome = resolve(runtimeRoot, "claude-home");
if (!existsSync(claudeHome)) {
  throw new Error(`isolated Claude Code home is not provisioned: ${claudeHome}`);
}

// --mcp-config takes a JSON file path; write the resolved, plugins-key-free
// server map to a throwaway temp file rather than passing this harness's own
// manifest (which also carries the `plugins` key, informational only — never
// meant for Claude's MCP-config parser).
const tempDir = mkdtempSync(join(tmpdir(), "claude-harness-mcp-"));
const resolvedConfigPath = join(tempDir, `harness-${harness.toLowerCase()}.resolved.mcp.json`);
writeFileSync(resolvedConfigPath, JSON.stringify({ mcpServers }, null, 2));

const isolatedEnv = {
  ...process.env,
  CLAUDE_CONFIG_DIR: claudeHome
};

const args = [
  "-p", prompt,
  "--output-format", "json",
  "--permission-mode", "bypassPermissions",
  "--strict-mcp-config",
  "--mcp-config", resolvedConfigPath
];
// No --cd flag exists on the Claude Code CLI (unlike Codex) — cwd is set on
// the spawned process instead, matching run-rev2.sh/run-probes.sh's existing
// pattern in this repository.
//
// Async spawn + streams here, not spawnSync's bounded maxBuffer — a result
// envelope large enough to include verbose tool-use metadata must never be
// silently truncated.
async function spawnWithEnvelopeCapture(spawnArgs, spawnEnv, spawnCwd, outputPath) {
  const chunks = [];
  const status = await new Promise((fulfill) => {
    const child = spawn("claude", spawnArgs, { stdio: ["inherit", "pipe", "inherit"], env: spawnEnv, cwd: spawnCwd });
    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.once("error", (error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      fulfill(1);
    });
    child.once("close", (code, signal) => fulfill(signal ? 1 : (code ?? 1)));
  });
  writeFileSync(outputPath, Buffer.concat(chunks), { flag: "wx" });
  return status;
}

if (!envelopeOut) {
  const result = spawnSync("claude", args, { stdio: "inherit", env: isolatedEnv, cwd: resolve(cwd) });
  process.exit(result.status ?? 1);
} else {
  const status = await spawnWithEnvelopeCapture(args, isolatedEnv, resolve(cwd), resolve(envelopeOut));
  process.exit(status);
}
