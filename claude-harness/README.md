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
- **Harness C**: the memory-free control arm — no MCP server, no plugin, and
  auto-memory disabled by `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. See "Control
  arm (Harness C)" below.

## Control arm (Harness C)

Harness C exists to answer a single question: how much of Harness A's and
Harness B's advantage over plain file exploration is attributable to the
memory tooling itself, holding every other factor fixed? The single-factor
rule (Move 7 / owner's plan, `tasks/todo.md:306-310`) requires that Harness C
differ from A and B in exactly one dimension — memory tooling — and nothing
else: same probe prompts (P1–P3, C1–C5), same `--permission-mode
bypassPermissions`, same `--strict-mcp-config`, same runner flow, same
Claude Code CLI version.

**Why the env var, not `--bare`.** Claude Code's CLI (2.1.258, binary at
`/Users/cdeust/.local/share/claude/versions/2.1.258`) gates auto-memory on
`process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY` — a "1"-like value disables it,
a "0"-like value forces it on, otherwise the `autoMemoryEnabled` setting
applies (default on; confirmed by `grep -a` against the installed binary).
Per the docs (https://code.claude.com/docs/en/memory), auto-memory is on by
default and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` disables it; `claude -p`
loads the same context as an interactive session unless `--bare` is passed
(https://code.claude.com/docs/en/headless). `--bare` was rejected because it
also drops CLAUDE.md, hooks, and plugins the same way arms A and B load them
— it would vary more than the one factor under test. The env var isolates
exactly the auto-memory factor and nothing else.

**The `environment` manifest key.** `harness-c.mcp.json` carries a new,
harness-level `environment` object: variables the runner injects into the
child process, overriding the operator's shell (`{"environment":
{"CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}}`). Composition is
`claude-harness/harness-environment.mjs`'s pure `composeIsolatedEnvironment`
— shell, then manifest, then `CLAUDE_CONFIG_DIR` pinned last so no manifest
or shell value can override the isolated config root. Like `plugins`, the
`environment` key never reaches `--mcp-config`. Harness A and B's own
manifests carry no `environment` key: their auto-memory state is left at the
CLI default for now — a confound reported to the owner rather than silently
fixed here.

**No ingestion cells.** Harness C answers every probe by reading the target
repository file by file with the built-in Read, Grep, and Glob tools; there
is no precompute/indexing step by construction, so `run-probes-sequential.mjs`
defines no `C-` ingestion cells — only the same repository probe cells
(`C-<repo>`) and one components cell (`C-components`) that A and B already
have.

**Operator precondition.** Same as A and B: the isolated home starts logged
out. Run `CLAUDE_CONFIG_DIR=claude-harness/runtime/c/claude-home claude` and
`/login` once before any scored Harness C cell (see "Result-envelope
capture" below for what an unauthenticated cell looks like — zero cost,
`is_error: true`, `terminal_reason: "api_error"`).

Preregistration fragment: `claude-harness/harness-c.experimental-unit.json`
(validated by `validate.mjs` against
`schemas/benchmark-protocol-v1.schema.json`'s
`properties.experimentalUnits.items`) is the exact object protocol v2 will
embed as its fourth `experimentalUnit`, after auto-memory, Cortex, and
Zikkaron.

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
report present without its envelope as partial. The validator pins the field
shapes and additionally refuses `is_error: true`: an errored result (measured
2026-09-02 as `terminal_reason: "api_error"` with an empty `modelUsage` under an
isolated home that was never logged in) is never a measured cell, even when a
report landed on disk. That measurement also fixes an operator precondition:
the isolated home starts logged out, so run `CLAUDE_CONFIG_DIR=claude-harness/runtime/<a|b>/claude-home claude`
and `/login` once per harness before any scored cell. `claude-harness/fixtures/`
carries a byte-exact CLI 2.1.258 envelope plus its provenance (command,
version, date, sha256) — captured under the operator's user-scope
`~/.claude`, field-shape evidence only, not a benchmark measurement. Every
pinned field in the validator carries a `// source:` comment (the SDK
reference docs or the measured fixture). Run the validator's own tests with:

```sh
node --test claude-harness/*.test.mjs
```

## Precompute line (chantier A, etape 3)

`run-precompute.mjs` measures a precompute step's own resource cost —
Harness A's per-repo Graphify rebuild (`BENCHMARK-PROCESS.md` step 2) or
Harness B's `run-b-ingestion-unbounded.mjs` — and writes a
`precompute-receipt-v1` JSON. `precompute-ledger.mjs`'s
`precomputeLedgerLine` turns a validated receipt into a ledger row: raw
figures always published next to the per-task amortized figures, `n` (the
accepted probe cell count for that harness×repo) always shown beside them —
`tasks/todo.md:331-334`'s "never diluted in silence" rule.

**Darwin only.** `ru_maxrss` from `getrusage(2)` is documented in **bytes**
on macOS and in **kilobytes** on Linux (`man getrusage`); mixing the two into
one ledger column without converting would silently corrupt every RSS figure
on a mixed-OS run. `run-precompute.mjs` and
`precompute-ledger.mjs#validatePrecomputeReceipt` both refuse any
`platform !== "darwin"` receipt.

**Three known semantic gaps, printed on every line (never silent):**
- `wall_ms` is an **upper bound**: it spans `Date.parse(utcEnd) -
  Date.parse(utcStart)` around the runner's own `spawn("/usr/bin/time", ...)`
  call, so it includes the `/usr/bin/time` + `env` wrapper's own
  process-startup cost, not only the measured command. Use `raw.real_seconds`
  (the `/usr/bin/time -l` "real" field, timing the command alone) for the
  command's cost without wrapper bias. Measured 2026-09-02 on macOS 26.6.2
  with `node -e "console.log(1)"` as the measured command: `wall_ms=47`,
  `real_seconds=0.04` (40ms) — a 7ms / 17.5% bias on a near-instant command
  (the review that found this reproduced +35% and +52% biases on other short
  commands).
- `cpu_seconds` is a **lower bound**: this harness has no
  `getrusage(RUSAGE_CHILDREN)` collector (Node exposes none — only
  `RUSAGE_SELF`, confirmed against `scripts/workload-ladder-runner-lib.mjs:873`
  and `adapters/hc-cortex-002/hc_cortex_002/metrics.py:53`, neither of which
  measures a child tree either). Measured 2026-09-02 on macOS 26.6.2: a
  **waited-on** child's CPU seconds are captured correctly by
  `/usr/bin/time -l` (0.67s user, 50.9MB max RSS); a child the parent does
  not wait for (`cmd & disown`) reports 0.00s user. Any grandchild that
  detaches from the measured command's own process tree is invisible here.
- `max_rss_bytes` is the **largest single process** in the tree, never a sum
  across it (`man getrusage`: `ru_maxrss` is per-process) — a peak, not a
  flow, and `precomputeLedgerLine` never amortizes it into `per_task`.

Usage — Harness A (the per-repo Graphify rebuild verified against the
installed package's own `--help`, never invented flags):

```sh
node claude-harness/run-precompute.mjs --harness A \
  --repo /absolute/corpus/repo \
  --receipt-out <result-root>/precompute/A-repo.receipt.json \
  --artifact /absolute/corpus/repo/graphify-out/graph.json \
  -- npx -y @dreamtree-org/graphify --no-install --no-hooks --no-viz /absolute/corpus/repo
```

`--no-install`, `--no-hooks`, and `--no-viz` are mandatory here: without them
a plain build installs the Graphify agent skill and registers Claude Code
hooks inside the measured **corpus repo** (`--no-install` "skip
auto-installing the agent skill + MCP config after the build", `--no-hooks`
"skip registering the Claude Code hooks in `.claude/settings.json`" — both
confirmed against the installed package's own `npx -y @dreamtree-org/graphify
--help`), and renders `graph.html` (`--no-viz` "skip graph.html") that this
precompute step never reads. None of that belongs in a corpus this harness
does not own.

Usage — Harness B (the existing unbounded ingestion driver):

```sh
node claude-harness/run-precompute.mjs --harness B \
  --repo /absolute/corpus/repo \
  --receipt-out <result-root>/precompute/B-repo.receipt.json \
  --artifact <result-root>/harness-b-unbounded/graphs/repo/graph.json \
  -- node claude-harness/run-b-ingestion-unbounded.mjs \
       --repo /absolute/corpus/repo \
       --output-dir <result-root>/harness-b-unbounded/graphs/repo \
       --report <result-root>/harness-b-unbounded/repo.json
```

Both invocations refuse before spawning if `--receipt-out` (or its derived
`.time.txt`/`.log` siblings) already exists — same create-exclusive
discipline as the rest of this harness — and still write the receipt on a
non-zero child exit, so a failed precompute is preserved as evidence rather
than lost. Pass `--envelope <path>` when the precompute step is itself
LLM-driven (`prompts/ingest-{a,b}.md` through `run-isolated.mjs
--envelope-out`) to embed the already-captured, already-validated
`usage.*` block as the receipt's `llm_usage`.

Publish a line:

```sh
node claude-harness/precompute-line.mjs \
  --receipt <result-root>/precompute/B-repo.receipt.json --tasks 3
```

`--tasks` is `n`: the count of accepted probe cells for that harness×repo
(e.g. the number of `B-<repo>` probe cells that reached `status: "ok"` in
`run-summary.json`) — never an invented amortization base.

`claude-harness/fixtures/time-report.darwin-26.6.2.txt` (+
`.provenance.json`) is a byte-exact `/usr/bin/time -l -o` report captured
directly on this machine — field-shape and unit evidence only, not a
benchmark measurement.

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
