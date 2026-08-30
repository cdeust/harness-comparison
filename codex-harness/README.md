# Codex harness isolation

These two manifests reproduce the active Claude Code local rev.3 surfaces:

- The A-side configuration exposes `codebase-memory`, `graphify`, `serena`, `obsidian`, `supabase`,
  `mongodb`, and `opentelemetry`; plus the native Codex plugins
  `claude-mem@13.15.3` and `superpowers@6.3.0`.
- Harness B: Cortex and `ai-architect`, with the same `lean` and `core`
  profiles used by the verified local rev.3 run.

`run-isolated.mjs` starts one *external* Codex `exec` process using only the
selected manifest. It supplies a dedicated `CODEX_HOME`, SQLite, XDG cache/data,
temporary root, npm/uv caches, Serena state, and claude-mem data root per
harness, and passes `--ephemeral`; it never reads or modifies the current
user's Codex home, adds/removes MCP servers, or resumes an interactive session.
Agent shell actions use Codex's `--approve-for-me` automatic-review policy;
the runner never enables dangerous sandbox or hook-trust bypasses.
This repository never invokes that runner from another Codex session: execute
it manually in a terminal after the environment gate is green.

The two configurations may exist at once, but benchmark cells are run one at a
time. Claude rev.3 recorded resource brackets before/after each cell; concurrent
heavy ingestion invalidates wall-clock comparisons.

## Static gate

```sh
node codex-harness/validate.mjs
```

The gate checks the component rosters, the required isolation flags, and that
the runner contains no `codex mcp add/remove`, `app-server`, or global-config
write path. It deliberately does not start Codex or any MCP process.

## Running a reviewed cell

```sh
HARNESS_A_OBSIDIAN_VAULT_PATH=/absolute/dedicated-vault \
  node codex-harness/run-isolated.mjs --harness A --cwd /absolute/corpus/repo \
  --prompt-file /absolute/ingest-prompt.md
```

The benchmark procedure, including Step 0, separate fresh probe sessions,
contention brackets, independent source scoring, and negative-result logging,
is defined by `../RESEARCH-PROCESS.md` and `../CAPSTONE-CHARTER.md`.
