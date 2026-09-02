#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
assert.equal(manifest.role, "independent-baseline");
assert.deepEqual(Object.keys(manifest.corpus_tracks).sort(), ["internal", "primary"]);
const load = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const names = (manifest) => Object.keys(manifest.mcpServers).sort();

const harnessA = load("harness-a.mcp.json");
const harnessB = load("harness-b.mcp.json");
const harnessC = load("harness-c.mcp.json");

assert.deepEqual(names(harnessA), ["codebase-memory", "graphify", "mongodb", "obsidian", "opentelemetry", "serena", "supabase"]);
// Harness B carries no file-based MCP servers at all — cortex/ai-architect
// reach the session exclusively through plugins in the isolated
// CLAUDE_CONFIG_DIR (installed_plugins.json below), never via --mcp-config.
// This is a deliberate, Claude-specific difference from codex-harness's own
// harness-b.mcp.json (which models the same two servers as plain commands) —
// Claude has a first-class plugin/MCP distinction that Codex's manifest
// format does not.
assert.deepEqual(names(harnessB), []);

assert.deepEqual(harnessA.plugins, ["claude-mem@thedotmack", "superpowers@superpowers-marketplace"]);
assert.deepEqual(harnessB.plugins, [
  "hypermnesia-mcp@cortex-plugins",
  "hypermnesia-mcp-viz@cortex-plugins",
  "ai-architect-mcp-codebase@ai-architect-mcp-codebase-marketplace",
  "ai-architect-mcp-spec@ai-architect-mcp-spec-marketplace",
  "zetetic-team-subagents@zetetic-marketplace"
]);

// Harness C is the memory-free control arm: no MCP server, no plugin, only
// the single factor under test (auto-memory) turned off via env var.
assert.deepEqual(names(harnessC), []);
assert.deepEqual(harnessC.plugins, []);
assert.deepEqual(harnessC.environment, { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" });
// Harness A and B's auto-memory state is left at the CLI default for now —
// a confound reported to the owner, not silently fixed here. Any future
// change to their auto-memory posture must be declared as an `environment`
// key on their own manifest, exactly like Harness C's.
assert.equal(harnessA.environment, undefined);
assert.equal(harnessB.environment, undefined);

// Opposite of codex-harness's own assertion: Claude's MCP schema REQUIRES
// "type": "http" on a URL-only entry (Codex's format forbids it). Confirmed
// against this repository's own already-proven .mcp.json before writing
// this manifest — regression guard against silently drifting off Claude's
// actual schema.
assert.equal(harnessA.mcpServers.supabase.type, "http", "Claude HTTP MCP entries require an explicit type field");

// Regression guard for the deliberate --readOnly -> read-write flip (plan
// step 4): a benchmark that can only read never proves a fair A-vs-B
// capability comparison for the NoSQL gap probe.
assert.equal(harnessA.mcpServers.mongodb.args.includes("--readOnly"), false, "isolated benchmark harness must not inherit the read-only lock found in results/local-rev3/NEGATIVE-LOG.md #1");

const runner = readFileSync(resolve(root, "run-isolated.mjs"), "utf8");
for (const required of [
  "CLAUDE_CONFIG_DIR", "--strict-mcp-config", "--mcp-config", "expandEnvironment",
  "prompt placeholder has no --value", "isolated Claude Code home is not provisioned",
  "--envelope-out", "\"wx\"", "composeIsolatedEnvironment", "harness-environment.mjs"
]) {
  assert.match(runner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
// The runner must never touch the real, shared Claude Code configuration —
// only the per-harness runtime/<a|b>/claude-home it provisions and reads.
for (const forbidden of ["\\$HOME/\\.claude", "process\\.env\\.HOME.*\\.claude", "installed_plugins\\.json\"\\s*,\\s*\"w", "settings\\.json\"\\s*,\\s*\"w"]) {
  assert.doesNotMatch(runner, new RegExp(forbidden));
}

// The benchmark prompt roster must be complete before any revision run: a
// missing prompt surfaces here, not as a mid-run ENOENT after hours of cells.
for (const prompt of [
  "step0-a", "step0-b", "step0-c", "ingest-a", "ingest-b",
  "probe-a", "probe-b", "probe-c", "components-a", "components-b", "components-c"
]) {
  assert.ok(existsSync(resolve(root, "prompts", `${prompt}.md`)), `prompts/${prompt}.md is missing`);
}

// The sequential probes runner must keep the evidence discipline: every
// artifact create-exclusive, a pre-spawn attempt receipt, refusal over
// partial prior artifacts, and full report-schema validation before a skip.
const probesRunner = readFileSync(resolve(root, "run-probes-sequential.mjs"), "utf8");
for (const required of [
  "run-isolated.mjs", "\"wx\"", "attempt", "preserve or quarantine",
  "validateReport", "COPYFILE_EXCL", "environmentSnapshot",
  "--envelope-out", "readResultEnvelope", ".envelope.json",
  "prompts/probe-c.md", "C-components"
]) {
  assert.match(probesRunner, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `run-probes-sequential.mjs lost required primitive: ${required}`);
}

// The envelope validator must keep refusing an errored result and must name
// the file when it cannot even be read: both were review findings on PR #10.
const envelopeValidator = readFileSync(resolve(root, "result-envelope.mjs"), "utf8");
for (const required of ["is_error === true", "unreadable result envelope at"]) {
  assert.match(envelopeValidator, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `result-envelope.mjs lost required gate: ${required}`);
}
// Isolation stays run-isolated.mjs's job — the orchestrator must never point
// a session at a config root itself.
assert.doesNotMatch(probesRunner, /CLAUDE_CONFIG_DIR/);

// The direct-stdio B ingestion driver must resolve ai-architect through the
// isolated plugin config (the same path a real Harness B session resolves),
// never a hardcoded binary path that can drift from what sessions run.
const unboundedDriver = readFileSync(resolve(root, "run-b-ingestion-unbounded.mjs"), "utf8");
assert.match(unboundedDriver, /runtime\/b\/claude-home\/installed_plugins\.json/);
assert.match(unboundedDriver, /CLAUDE_PLUGIN_ROOT/);
assert.doesNotMatch(unboundedDriver, /target\/release/);

// Isolation invariant on the provisioned runtime, not just on the scripts
// that are supposed to build it — this is what actually proves Finding #1
// from the local-rev3 diagnostic (isolation enforced by prose only, never by
// configuration) cannot recur here.
const harnessManifestByRuntimeKey = { a: harnessA, b: harnessB, c: harnessC };
for (const harness of ["a", "b", "c"]) {
  const installedPluginsPath = resolve(root, "runtime", harness, "claude-home", "installed_plugins.json");
  assert.ok(existsSync(installedPluginsPath), `runtime/${harness}/claude-home/installed_plugins.json is not provisioned yet`);
  const installed = load(`runtime/${harness}/claude-home/installed_plugins.json`);
  const installedNames = Object.keys(installed.plugins ?? {}).sort();
  const expectedPlugins = harnessManifestByRuntimeKey[harness].plugins.slice().sort();
  assert.deepEqual(installedNames, expectedPlugins, `runtime/${harness}/claude-home/installed_plugins.json must carry exactly this harness's plugin roster, nothing from the other side`);

  if (harness === "b") {
    // Every Harness-B plugin cache directory must be dev-symlink mounted —
    // either "tree" mode (top-level entries are symlinks into a canonical dev
    // repo) or "binary" mode (dev-symlink.map's ai-architect-mcp-codebase
    // pattern: only one nested binary path, e.g. target/release/<bin>, is a
    // symlink) — rather than a vendored, driftable copy. Zero symlinks
    // anywhere under installPath means someone installed a real copy instead
    // of mounting live code — exactly the class of staleness this session's
    // plugin-cache hygiene pass already fixed once for the user-scope cache;
    // this gate stops it recurring here. Search is recursive (bounded depth)
    // because binary mode's one symlink is not at the top level.
    const hasSymlinkWithin = (dir, depth) => {
      if (depth > 6) return false;
      for (const child of readdirSync(dir)) {
        const childPath = resolve(dir, child);
        const st = lstatSync(childPath);
        if (st.isSymbolicLink()) return true;
        if (st.isDirectory() && hasSymlinkWithin(childPath, depth + 1)) return true;
      }
      return false;
    };
    for (const [name, entries] of Object.entries(installed.plugins)) {
      for (const entry of entries) {
        const installPath = entry.installPath;
        assert.ok(installPath, `${name} is missing installPath`);
        assert.ok(existsSync(installPath), `${name}'s installPath does not exist: ${installPath}`);
        assert.ok(hasSymlinkWithin(installPath, 0), `${name} (${installPath}) has no symlink anywhere in its tree — looks like a vendored copy, not a dev-symlink mount`);
      }
    }
  }
}

// Validate harness-c.experimental-unit.json against the schema's own
// properties.experimentalUnits.items — key list and value shapes are read
// from the schema file, never hard-coded here, so this gate cannot silently
// drift from schemas/benchmark-protocol-v1.schema.json.
function validateExperimentalUnitFragment(fragment, itemSchema) {
  assert.equal(itemSchema.additionalProperties, false, "schema no longer forbids additional properties on an experimentalUnit — update this gate");
  for (const key of itemSchema.required) {
    assert.ok(Object.prototype.hasOwnProperty.call(fragment, key), `experimental-unit fragment is missing required key: ${key}`);
  }
  for (const key of Object.keys(fragment)) {
    assert.ok(itemSchema.required.includes(key), `experimental-unit fragment carries an undeclared key: ${key}`);
  }
  for (const key of ["id", "description"]) {
    assert.equal(typeof fragment[key], "string", `${key} must be a string`);
    assert.notEqual(fragment[key].trim(), "", `${key} must be non-empty`);
  }
  assert.ok(Array.isArray(fragment.components) && fragment.components.length > 0, "components must be a non-empty array");
  for (const component of fragment.components) {
    assert.equal(typeof component, "string", "every components entry must be a string");
    assert.notEqual(component.trim(), "", "every components entry must be non-empty");
  }
}

const experimentalUnitSchema = JSON.parse(readFileSync(resolve(root, "../schemas/benchmark-protocol-v1.schema.json"), "utf8"));
const experimentalUnitFragment = load("harness-c.experimental-unit.json");
validateExperimentalUnitFragment(experimentalUnitFragment, experimentalUnitSchema.properties.experimentalUnits.items);

console.log("claude harness isolation: valid");
