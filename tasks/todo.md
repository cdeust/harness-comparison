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

- Legacy inventory: 118 records, with the complete disposition table in
  [`issues/AUDIT.md`](../issues/AUDIT.md).
- Active product work: 42 consolidated dossiers across the five-project AI
  Architect population.
- Benchmark and study work: 13 dossiers, including separate ECC and DeepSeek
  Harness inclusion pilots.
- Automated gate: 55 unique dossiers and 2 candidate cards; both host isolation
  validators pass.
- Publication status: source audit complete; runtime reproduction, matched
  comparison and independent scoring remain explicitly `pending`.

## Registry validator follow-up

- [x] Reproduce the ignored-runtime false-positive on merged `main`.
- [x] Add a regression proving ignored Markdown is excluded.
- [x] Prove untracked, non-ignored Markdown remains covered.
- [x] Make repository-wide Markdown discovery honor the Git source boundary.
- [x] Run the registry, host-isolation, privacy and diff gates.
- [ ] Publish the correction through a dedicated pull request.

### Validator review

- Before: 201 false link failures from 636 ignored third-party Markdown files
  under `codex-harness/runtime/` on the merged checkout.
- Regression: ignored broken Markdown leaves the validator green; untracked,
  non-ignored broken Markdown still fails and is named in stderr.
- After: the registry reports 55 valid dossiers and 2 candidate cards; both
  host-isolation validators and the diff/privacy gates pass.
- Independent read-only review found no merge blocker and confirmed that
  NUL-delimited `git ls-files` plus `execFileSync` avoids shell and platform
  quoting differences. A tracked file missing from a sparse or unstaged
  worktree can still produce an unhandled read error; controlled diagnostics
  for that separate edge remain future hardening.

## HC-CORTEX-002 — transaction-isolation benchmark

WIP handoff: [`HC-CORTEX-002-HANDOFF.md`](HC-CORTEX-002-HANDOFF.md). Resume
from that file before changing or running the protocol.

- [x] Reproduce the shared-connection failure on the pinned Cortex baseline.
- [x] Implement and independently review request-scoped SQLite transaction
  isolation in the Cortex candidate branch.
- [ ] Seal a dated protocol before executing any benchmark cell, including the
  candidate SHA, PostgreSQL reference, ladder derivation, operation ledger,
  stop rules, metrics, repetitions and non-claims.
- [ ] Add the smallest reusable preregistration and artifact-integrity gate
  needed to reject incomplete or mutated result releases.
- [ ] Add a protocol-driven workload adapter that executes every declared cell
  in a fresh process and emits one common raw-event and metric schema.
- [ ] Freeze the independent aggregation/scoring code and the manifest sealer
  before any scored cell so analysis choices cannot follow the observed data.
- [ ] Run the validator fixtures and one unscored smoke cell; independently
  review the protocol and runner before the main run.
- [ ] Execute two clean SQLite runs and the matched PostgreSQL reference cells,
  preserving restart/recovery and store-integrity oracles.
- [ ] Analyze the immutable artifacts, update the public Cortex dossier only
  from observed evidence, and publish through a dedicated pull request.

### HC-CORTEX-002 review

- Cortex baseline: `8f5ae3b87b6969f3abcb3736859febfdab69304a`.
- Cortex candidate: `9faa80d3` in draft PR `cdeust/Cortex#452`.
- Candidate regression status: focused, affected and full local suites pass;
  draft PR `cdeust/Cortex#452` is green on remote CI.
- Adapter smoke status: the first C1/C2 implementation smokes were invalidated
  before scoring because they used a write recovery probe, an eager task
  backlog, the wrong queue boundary and no peak-connection observation. They
  are development evidence only and will not enter a benchmark release.
- Corrected development smokes remain unscored: the pinned baseline C2/W1
  produced the expected blocked oracle, while candidate C5/W100 produced a
  proven oracle with `301 = 3W + 1` measured terminal operations, five actual
  dispatcher requests in flight and one request observed at the source
  admission queue. Their temporary trees are excluded from publication.
- Cross-contract review prevented two post-hoc repairs: the runner now emits a
  unique attempt ID per cell rather than one release-wide ID, and persists the
  complete external Git protocol registration required by the sealer.
- PostgreSQL is still `unverified` for scoring purposes: the protocol
  requires an owner-only Unix socket, no TCP listener, rejected host
  authentication and one fresh `template0` database per PostgreSQL cell.
  A real macOS PostgreSQL 17.9 (Homebrew) prepare/status/stop smoke against
  the registered protocol completed (see below); Linux remains untested.
- Benchmark status: `pending`. No workload or PostgreSQL result is publishable
  until the protocol hash and artifact validator are sealed.

### HC-CORTEX-002 review (2026-09-01 continuation, commit `93070fe`)

Handoff items 1-4 from `HC-CORTEX-002-HANDOFF.md`'s incomplete-work list are
now complete. Item 5 (independent release review, then the harness
preregistration PR) is next; `registeredAt` remains provisional until that
freeze. Exact commands: [`protocols/HC-CORTEX-002-RUNBOOK.md`](../protocols/HC-CORTEX-002-RUNBOOK.md).

- Item 1 (persisted-state recomputation): `persistedState()` was implemented
  but never wired into `validateOracleLedger`'s context, so every check
  depending on it crashed. Wired it in, added a marker-derived-vs-formula
  cross-check, and rewrote `load_window_exact` to independently recompute
  BigInt arithmetic, load-window enclosure, and the producer's
  `summary_elapsed_ns`/`load_intent_count`/`load_outcome_count` fields
  against raw ledger data rather than trusting `expected` prose. Rebuilt the
  analysis fixtures with a coherent row/marker/edge story and raw causal
  corruption in the blocked-baseline control (not merely a false check).
- Item 2 (discovery path fix): `validate-benchmark-release.mjs`'s
  `withIssueSpecificVerification` hardcoded `<release>/protocol.json`; the
  generic manifest contract only guarantees `manifest.protocol.path`. Fixed
  to derive the path from the already-validated manifest with a quiescence
  check; regression-tested against a nonstandard path.
- Item 3 (real E2E): first test in the repository to chain the real runner
  into the real Python adapter (pinned candidate `9faa80d3`) and the
  analyzer/sealer/verifier chain (`scripts/hc-cortex-002-real-adapter-e2e.test.mjs`),
  on a disposable SQLite C1/W1 fixture. Surfaced and fixed two previously
  latent integration defects no synthetic fixture had exercised: the privacy
  scanner false-positived on raw binary SQLite evidence (treated it as UTF-8
  text), and the analyzer's provenance validator rejected the real runner's
  own `gitBlob` field. A real PostgreSQL 17.9 smoke (prepare/status/stop, no
  fakes) completed on macOS; Linux is untested on this host. Extended the
  read-only verifier's adversarial coverage to analysis, negative evidence,
  and manifest-projection forgery (previously only scoring was covered).
- Item 4 (documentation): added `protocols/HC-CORTEX-002-RUNBOOK.md` with
  every exact command, including the PostgreSQL provisioner's git-registration
  gotcha (needs a pushed commit, not merely a committed one); added
  `.gitattributes`; updated the Cortex issue dossier's engineering-readiness
  note without upgrading any verdict-ledger row; documented the sealer's
  hardcoded `protocol.json` limitation as a known limitation, not refactored.
- Known limitation carried forward, not fixed here: `hc-cortex-002-seal-lib.mjs`
  hardcodes the literal `"protocol.json"` path, so a fully-verified-positive
  HC-CORTEX-002 release at a nonstandard protocol path is architecturally
  impossible with this pipeline's own tooling today (see the runbook §8).

## Claude-harness parity worklog review (2026-09-01)

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
