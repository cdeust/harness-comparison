#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
assert.equal(manifest.role, "ai-architect-stack");
assert.deepEqual(Object.keys(manifest.corpus_tracks).sort(), ["internal", "primary"]);
const load = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const names = (manifest) => Object.keys(manifest.mcpServers).sort();

const harnessA = load("harness-a.mcp.json");
const harnessB = load("harness-b.mcp.json");
assert.deepEqual(names(harnessA), ["codebase-memory", "graphify", "mongodb", "obsidian", "opentelemetry", "serena", "supabase"]);
assert.deepEqual(names(harnessB), ["ai-architect", "ai-architect-spec", "cortex"]);
assert.deepEqual(harnessA.plugins, ["claude-mem", "superpowers"]);
assert.deepEqual(harnessB.plugins, ["zetetic-team-subagents", "hypermnesia-mcp-viz"]);
assert.equal("type" in harnessA.mcpServers.supabase, false, "Codex HTTP MCP entries use url without Claude's type field");

const runner = readFileSync(resolve(root, "run-isolated.mjs"), "utf8");
for (const required of ["CODEX_HOME", "CODEX_SQLITE_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMPDIR", "NPM_CONFIG_CACHE", "UV_CACHE_DIR", "SERENA_HOME", "CLAUDE_MEM_DATA_DIR", "--ephemeral", "--approve-for-me", "--skip-git-repo-check", "mcp_servers=", "expandEnvironment", "prompt placeholder has no --value"]) assert.match(runner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const forbidden of ["codex mcp add", "codex mcp remove", "app-server", "config.toml"]) assert.doesNotMatch(runner, new RegExp(forbidden));

for (const prompt of ["prompts/probe-a.md", "prompts/probe-b.md", "prompts/components-a.md", "prompts/components-b.md"]) {
  const content = readFileSync(resolve(root, prompt), "utf8");
  assert.match(content, /\{\{OUTPUT\}\}/);
}
const sequential = readFileSync(resolve(root, "run-probes-sequential.mjs"), "utf8");
for (const required of ["mkdtempSync", "COPYFILE_EXCL", "validateReport", "no fixed wall-clock timeout", "for (const cell of cells)"]) assert.match(sequential, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(sequential, /setTimeout|Promise\.race|--timeout/);

console.log("codex harness isolation: valid");
