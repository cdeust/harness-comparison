#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function usage() {
  console.error("usage: run-isolated.mjs --harness A|B --cwd <repo> --prompt-file <file> [--value KEY=VALUE ...]");
  process.exit(64);
}

function valueToToml(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(valueToToml).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{ ${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)} = ${valueToToml(entry)}`).join(", ")} }`;
  }
  throw new TypeError(`unsupported MCP configuration value: ${typeof value}`);
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
if (!new Set(["A", "B"]).has(harness) || !cwd || !promptFile) usage();

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
const mcpServers = expandEnvironment(manifest.mcpServers);
const runtimeRoot = resolve(import.meta.dirname, "runtime", harness.toLowerCase());
const codexHome = resolve(runtimeRoot, "codex-home");
if (!existsSync(codexHome)) {
  throw new Error(`isolated Codex home is not provisioned: ${codexHome}`);
}

const isolatedEnv = {
  ...process.env,
  CODEX_HOME: codexHome,
  CODEX_SQLITE_HOME: resolve(runtimeRoot, "sqlite"),
  XDG_CONFIG_HOME: resolve(runtimeRoot, "xdg-config"),
  XDG_CACHE_HOME: resolve(runtimeRoot, "xdg-cache"),
  XDG_DATA_HOME: resolve(runtimeRoot, "xdg-data"),
  TMPDIR: resolve(runtimeRoot, "tmp"),
  NPM_CONFIG_CACHE: resolve(runtimeRoot, "npm-cache"),
  UV_CACHE_DIR: resolve(runtimeRoot, "uv-cache"),
  SERENA_HOME: resolve(runtimeRoot, "serena-home"),
  CLAUDE_MEM_DATA_DIR: resolve(runtimeRoot, "claude-mem-data")
};

const args = [
  "exec",
  "--ephemeral",
  "--approve-for-me",
  "--strict-config",
  "--skip-git-repo-check",
  "--cd", resolve(cwd),
  "--config", `mcp_servers=${valueToToml(mcpServers)}`,
  "--",
  prompt
];
const result = spawnSync("codex", args, { stdio: "inherit", env: isolatedEnv });
process.exit(result.status ?? 1);
