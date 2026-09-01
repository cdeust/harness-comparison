# Claude-harness parity worklog (2026-09-01)

Goal: bring `claude-harness/` to parity with the solutions already implemented
in `codex-harness/`, per the capstone charter and BENCHMARK-PROCESS.md.

Check named before implementation: `node --check` on every new script,
`node claude-harness/validate.mjs` green, and a side-effect-free
`run-probes-sequential.mjs --dry-run` listing all cells as PENDING.

## Plan

- [x] Add the six missing benchmark prompts (ingest-a/b, probe-a/b,
  components-a/b), Claude-adapted (Read/Grep/Bash prohibition, plugin-based
  Harness B, `{{PLACEHOLDER}}` outputs).
- [x] Add `run-b-ingestion-unbounded.mjs` — direct-stdio AI Architect driver
  resolving the server from the isolated Harness B plugin config, not a
  hardcoded binary path.
- [x] Add `run-probes-sequential.mjs` — sequential no-overwrite cell runner
  with environment brackets, git snapshots, staged reports, full report-schema
  validation on skip (lesson 4353667), and a pre-spawn attempt ledger so a
  crashed orchestrator leaves an indeterminate record, never silence
  (lesson 4353868).
- [x] Extend `validate.mjs` with static gates for the new runners.
- [x] Update `claude-harness/README.md`; reference `../BENCHMARK-PROCESS.md`
  (no third copy of the revision contract — codex's own copy is already
  flagged for dedup).
- [x] Run the named checks and record the outcome here.

## Review

- `node --check` passed on all three scripts; `node claude-harness/validate.mjs`
  and `node codex-harness/validate.mjs` both report valid; issue registry
  reports PROVEN (55 dossiers, 2 candidate cards).
- `run-probes-sequential.mjs --dry-run` (result root pointed at a scratch
  directory) lists all 12 cells PENDING with no repository side effects.
- Plugin-server resolution smoke test: the driver resolves
  `ai-architect-mcp-codebase@…` → `.claude-plugin/plugin.json` → `.mcp.json`
  → an existing `bin/launch-plugin.sh` in the pinned 0.11.1 install.
- Deliberate deviations from the codex runner, both documented in the README:
  symmetric five-repository A/B coverage (codex's A-side slice was a
  run-specific artifact), and a `CLAUDE_HARNESS_RESULT_ROOT` override instead
  of a dated hardcoded result root.
- No benchmark cell was executed — runners are operator-launched only, after
  the environment gate, per BENCHMARK-PROCESS.md.
