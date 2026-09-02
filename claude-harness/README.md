# Claude Code harness isolation

Mirrors `codex-harness/`'s architecture for the Claude-driven side of the A/B
benchmark. Historical local runs are not normative.
implemented the hard isolation this repository's own README (lines 68-98)
documents — 3 of 4 "Harness-A-only" ingestion sessions were forcibly cut
short by Cortex's own hooks firing inside a session that was supposed to run
Harness A alone, because isolation was enforced only by prose in the prompt,
never by configuration. See this directory's own `validate.mjs` for the
isolation checks.

- **Harness A**: `codebase-memory`, `graphify`, `serena`, `obsidian`,
  `supabase`, `mongodb` (**read-write** here, unlike the shared project
  `.mcp.json` — a read-only NoSQL probe cannot fairly measure the capability
  under test), and
  `opentelemetry`; plus the plugins `claude-mem@thedotmack` and
  `superpowers@superpowers-marketplace`.
- **Harness B**: no file-based MCP servers at all — `cortex` and
  `ai-architect` reach the session exclusively through the plugins
  `hypermnesia-mcp@cortex-plugins`, `hypermnesia-mcp-viz@cortex-plugins`,
  `ai-architect-mcp-codebase@ai-architect-mcp-codebase-marketplace`,
  `ai-architect-mcp-spec@ai-architect-mcp-spec-marketplace`, and
  `zetetic-team-subagents@zetetic-marketplace`. This is a deliberate,
  Claude-specific difference from `codex-harness/harness-b.mcp.json` (which
  models the same two servers as plain commands) — Claude has a first-class
  plugin/MCP distinction that Codex's manifest format does not.

## Isolation mechanism

Claude Code has no `--ignore-user-config` flag the way Codex does. The
equivalent, verified this session by inspecting the CLI binary's own
precedence-resolution code, is **`CLAUDE_CONFIG_DIR`**: it fully replaces the
`~/.claude` root (settings, `installed_plugins.json`, plugin cache,
marketplaces) for the session. `runtime/{a,b}/claude-home/` are two such
roots, each provisioned with only its own harness's `installed_plugins.json`
+ `settings.json` (`enabledPlugins` explicit, not relying on a plugin's own
`defaultEnabled`). Absence, not a toggle: the other harness's plugins simply
have no manifest to resolve in that `CLAUDE_CONFIG_DIR`, so there is nothing
for Claude Code's `enabledPlugins`-precedence fallback to fall back to — this
is stronger than the README's originally-documented `enabledPlugins: false`
mechanism (which is real and does work, per project-scope-overrides-user-scope
precedence, but depends on remembering to list every plugin explicitly and
was never actually applied in this repository, which is exactly how Finding
#1 happened).

`run-isolated.mjs` starts one *external* `claude -p` process per cell,
`CLAUDE_CONFIG_DIR` pointed at the selected harness's isolated root, plus
`--strict-mcp-config --mcp-config <resolved manifest>` so only that harness's
file-based servers (Harness A) or none at all (Harness B) are visible — never
resolved by name from any other `.mcp.json` on disk. It never writes to the
real `~/.claude/settings.json` or `~/.claude/plugins/installed_plugins.json`.
Harness B's plugin cache entries are dev-symlink mounts into the same
canonical repos already verified elsewhere this session (`Cortex`,
`ai-architect-mcp-codebase`, etc.) — never a vendored copy that can drift
stale; `validate.mjs` checks this by walking each `installPath` for at least
one symlink.

The two configurations may exist at once, but benchmark cells are run one at
a time — see `../BENCHMARK-PROCESS.md` (concurrent heavy ingestion invalidates
wall-clock comparisons; this is a methodology choice, not a technical
limitation of the isolation itself, matching `codex-harness`'s own reasoning).

## Static gate

```sh
node claude-harness/validate.mjs
```

Checks, without spawning any session: each harness's MCP server roster and
plugin roster match exactly what's intended; Claude's schema requirements
(`supabase` needs an explicit `"type": "http"` — the opposite of Codex's own
manifest, which forbids it); the mongodb `--readOnly` flag is absent; the
runner's source contains the required isolation primitives and never
references the real, shared Claude Code configuration; and both
`runtime/{a,b}/claude-home/installed_plugins.json` exist, carry exactly that
harness's plugin roster and no other, and are dev-symlink mounted rather than
vendored.

## Benchmark runners

Parity with `codex-harness/`'s revision tooling; the governing procedure is
`../BENCHMARK-PROCESS.md` (already the single source of truth — no third copy
of the revision contract lives here).

- `run-b-ingestion-unbounded.mjs` — drives AI Architect's `analyze_codebase`
  through a direct stdio MCP connection with no fixed wall-clock ceiling, so
  a host client timeout never becomes a product measurement. Claude-specific
  difference from the codex driver: Harness B has no file-based MCP servers,
  so the server is resolved the way Claude Code itself resolves it —
  `runtime/b/claude-home/installed_plugins.json` → the plugin's
  `.claude-plugin/plugin.json` → its `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}`
  substituted — never a hardcoded binary path.

  ```sh
  node claude-harness/run-b-ingestion-unbounded.mjs \
    --repo /absolute/corpus/repo \
    --output-dir <result-root>/harness-b-unbounded/graphs/<repo> \
    --report <result-root>/harness-b-unbounded/<repo>.json
  ```

- `run-probes-sequential.mjs` — runs the P1–P3 repository probes and C1–C5
  component probes, one fresh staged Claude Code process per cell, strictly
  sequential. Every cell records before/after environment brackets (UTC,
  uptime, load, free disk, peer processes, git snapshot, qualified artifact
  hash), writes every artifact create-exclusive, validates the full report
  schema before accepting or skipping a cell, and refuses to retry over
  partial prior artifacts. A pre-spawn attempt receipt lands on disk before
  each child starts, so a killed orchestrator leaves an indeterminate record
  instead of silence; reconcile it from a separate process before retrying.
  The result root defaults to `results/claude-rev1-isolated` and can be
  overridden with `CLAUDE_HARNESS_RESULT_ROOT`. `--dry-run` lists cell
  status without side effects.

Both harnesses cover the full five-repository corpus symmetrically. Rebuild
Harness A's Graphify artifact per corpus repository before A cells and run B
ingestion cells before A ingestion cells, as `../BENCHMARK-PROCESS.md`
requires. This repository never invokes these runners from another Claude
session: execute them manually in a terminal after the environment gate is
green.

## Result-envelope capture (chantier A: measured-frugality ledger)

`run-isolated.mjs` spawns `claude -p … --output-format json` with `stdio:
"inherit"` by default, so the JSON result envelope — the only place the CLI
reports `usage.*`, `modelUsage`, `total_cost_usd`, `num_turns`,
`duration_ms`, `duration_api_ms` — only ever reaches the parent's stdout and
is never stored as a per-cell artifact. Pass `--envelope-out <path>` to
capture it:

```sh
node claude-harness/run-isolated.mjs --harness A \
  --cwd <repo> --prompt-file <file> --envelope-out <result-root>/A-foo.envelope.json
```

With the flag: the runner refuses before spawning if `<path>` already exists
(create-exclusive, same discipline as the rest of this harness), spawns
`claude` with stdout piped, forwards every chunk to the orchestrator's own
stdout unchanged, and writes the accumulated raw bytes to `<path>` with
`"wx"` after the child closes. Without the flag, behaviour is byte-for-byte
unchanged from before this capability existed. `claude-harness/result-envelope.mjs`
is the pure validator (`validateResultEnvelope`) plus the read+validate
wrapper `readResultEnvelope`, wired into `run-probes-sequential.mjs`:
`acceptStagedReport` requires the envelope to exist and validate before a
cell can be accepted, and the partial-prior-artifacts refusal treats a
report present without its envelope as partial. `claude-harness/fixtures/`
carries a byte-exact CLI 2.1.258 envelope plus its provenance (command,
version, date, sha256) — captured under the operator's user-scope
`~/.claude`, field-shape evidence only, not a benchmark measurement. Every
pinned field in the validator carries a `// source:` comment (the SDK
reference docs or the measured fixture). Run the validator's own tests with:

```sh
node --test claude-harness/*.test.mjs
```

## Running a Step 0 check

```sh
HARNESS_A_OBSIDIAN_VAULT_PATH=/absolute/dedicated-vault \
  node claude-harness/run-isolated.mjs --harness A \
  --cwd ~/Developments/anthropic-partnership/zetetic-team-subagents \
  --prompt-file claude-harness/prompts/step0-a.md
```

Swap `--harness A` for `B` and the prompt file for `step0-b.md` to check
Harness B independently — each harness must pass its own Step 0 standalone,
not only as part of a joint A/B run.

The benchmark procedure itself — Step 0, separate fresh probe sessions,
contention brackets, independent source scoring, and negative-result
logging — is `../BENCHMARK-PROCESS.md`. Findings that pass the publication
gate are added to the repository's public issue registry.
