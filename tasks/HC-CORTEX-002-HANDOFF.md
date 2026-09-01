# HC-CORTEX-002 WIP handoff

Status captured on 2026-08-31 because the session reached its quota threshold;
updated 2026-09-01 at commit `93070fe` after items 1-4 below completed across
two follow-up dispatches. This branch is still an intentionally incomplete
engineering checkpoint. It is not a preregistered protocol release, benchmark
result, or publishable score. **Resume from item 5.**

## Resume location

- Harness worktree: `/private/tmp/harness-hc-cortex-002-protocol`
- WIP branch: `wip/hc-cortex-002-capstone-protocol`
- Base harness revision: `6f4c1f27626dc74b7df326ecb15c6260ebd1978e`
- Cortex candidate worktree: `/private/tmp/cortex-hc-cortex-002`
- Cortex candidate revision: `9faa80d3f36b1c7fd05edb4aca8202448a79fb27`
- Cortex baseline worktree: `/private/tmp/cortex-hc-cortex-002-baseline`
- Cortex baseline revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Draft source fix: `cdeust/Cortex#452`

Use `/private/tmp/cortex-hc-cortex-002/.venv/bin/python` as the Python
invocation. Do not replace that path with its `realpath`: the virtual
environment identity and `pyvenv.cfg` binding depend on the invocation path.

## Scientific state

- No scored cell has run.
- No benchmark result or maturity score is publishable yet.
- The dated protocol contains 18 ordered cells: regression baseline and
  candidate controls, then two repetitions of SQLite and PostgreSQL at
  concurrency 1, 2, 4, and 5.
- Earlier temporary C1/C2 experiments and the corrected baseline C2/W1 and
  candidate C5/W100 experiments are development pilots only.
- A real PostgreSQL 17.9 C1/W1 producer-to-oracle smoke was run during tooling
  development and returned `proven`; it is also unscored and must not enter the
  release matrix.
- A second, separately-scoped real PostgreSQL 17.9 smoke ran at commit
  `93070fe`: the *provisioner's* full prepare/status/stop infrastructure
  lifecycle against the real registered protocol (§2 of
  `protocols/HC-CORTEX-002-RUNBOOK.md`), not a workload/oracle producer run.
  It provisioned and tore down real infrastructure only — no cell executed —
  and is likewise unscored and must not enter the release matrix. Linux was
  not available on this host and remains untested for both PostgreSQL smokes.
- `registeredAt` in the protocol is not the final freeze timestamp. Set it only
  at the actual preregistration freeze, document all prior pilots as protocol
  refinements, commit and push that exact protocol before any scored cell.

## Implemented on this WIP branch

- Protocol-driven runner with fresh workload/oracle processes, immutable raw
  ledgers, per-cell attempt identities, exact Git registration, fsync of raw
  streams, private child environments, and fail-closed stop rules.
- Runtime/source/adapter provenance is rechecked before and after each process.
  Python 3.12, the virtual environment, source lockfiles, package inventory,
  SQLite/libpq versions, and selected source bytes are bound without claiming a
  byte-identical container.
- PostgreSQL 17 provisioner using a private POSIX Unix socket, no TCP listener,
  one `template0` database per cell, live service identity checks, owner/mode
  checks, symlink rejection, and loader-variable stripping.
- Structural JSON/JSONL privacy scanning for secret-bearing keys, DSNs,
  `file://` values, and absolute POSIX/Windows paths. This is explicitly a
  bounded publication scan, not DLP.
- Independent analyzer, sealer, generic release validator, release discovery,
  negative-evidence preservation, PILOT partial-release support, and a
  read-only issue-specific derived-evidence verifier.
- The adapter now emits an exact raw `load_window`, normalized persisted rows,
  and PostgreSQL constraint observations. Candidate adapter tests reached
  23/23 and Ruff was clean before this checkpoint.
- The sealer no longer claims an isolated host or an observed empty port list.
  It describes same-user local execution and declared endpoints; PostgreSQL
  port 5432 is a Unix-socket suffix, with `networkScanPerformed: false`.

## Incomplete work at the checkpoint

Items 1-4 are complete as of commit `93070fe`, verified with an integrated
green run each time (see "Last known verification evidence" below). **Resume
from item 5.**

1. ~~Finish the Node persisted-state recomputation in
   `scripts/hc-cortex-002-analysis-lib.mjs`.~~ **Done.** `persistedState()`
   is now wired into `validateOracleLedger`'s context (it was implemented but
   never called at the prior checkpoint, so every dependent check crashed);
   `load_window_exact` independently recomputes BigInt arithmetic, enclosure,
   and the producer's `summary_elapsed_ns`/`load_intent_count`/
   `load_outcome_count` fields rather than trusting `expected` prose; analysis
   fixtures carry a coherent row/marker/edge story with raw causal corruption
   in the blocked-baseline control; adversarial forged-row/forged-edge tests
   are green against the fix and were confirmed red against the pre-fix code.

2. ~~Repair issue-specific verification in discovery.~~ **Done.**
   `withIssueSpecificVerification` derives the protocol location from the
   already-validated manifest's `protocol.path` field (re-verified with a
   manifest-digest quiescence check) instead of assuming
   `<release>/protocol.json`; regression-tested against a nonstandard path,
   confirmed to fail with `ISSUE_SPECIFIC_VERIFICATION_FAILED` on the pre-fix
   code.

3. ~~Complete the real contract E2E.~~ **Done**, with two caveats noted
   honestly rather than glossed over:
   - `scripts/hc-cortex-002-real-adapter-e2e.test.mjs` chains the real runner
     into the real Python adapter (pinned candidate) and the analyzer/sealer/
     verifier, on a disposable SQLite C1/W1 fixture — 1/1 green, ~20s wall
     time. This surfaced and fixed two previously latent integration defects
     no synthetic fixture had exercised (privacy scanner false-positiving on
     real binary SQLite evidence; the analyzer's provenance validator
     rejecting the real runner's own `gitBlob` field). See
     `protocols/HC-CORTEX-002-RUNBOOK.md` §8 for the sealer's own
     `protocol.json` limitation this uncovered.
   - The PostgreSQL smoke completed on **macOS only** (Homebrew PostgreSQL
     17.9, real `initdb`/`pg_ctl`, no fakes) — see
     `protocols/HC-CORTEX-002-RUNBOOK.md` §2. **Linux was never available on
     this host and remains untested**; do not treat macOS conformance as
     Linux conformance (this is the same POSIX-host-specificity rule already
     stated below).
   - The read-only verifier's rehashed-but-forged rejection is now covered
     for analysis, negative evidence, and a manifest projection, in addition
     to the scoring case that was already tested.

4. ~~Reconcile documentation and preregistration.~~ **Partially done, by
   design** — everything except the `registeredAt` freeze:
   - `protocols/HC-CORTEX-002-RUNBOOK.md` (new) has the exact runbook:
     protocol validation, PostgreSQL prepare/status/stop (with the git-push
     gotcha), runner bindings, analysis, sealing, deep verification, and
     generic release validation/discovery, linked from `protocols/README.md`.
   - The Cortex issue dossier
     (`issues/Cortex/scalability/sqlite-transaction-isolation.md`) and
     `tasks/todo.md` are updated from the final integrated state only; no
     verdict-ledger row was upgraded (all remain `pending` — no scored cell
     has run).
   - `.gitattributes` was added (previously absent) for LF-stable research
     artifacts.
   - **`registeredAt` was deliberately NOT replaced.** That freeze, plus the
     preregistration PR itself, is item 5's job — do not do it as a side
     effect of a documentation pass.

5. **Next.** Run independent release review, then open the harness
   preregistration PR: replace the provisional `registeredAt` at the actual
   freeze timestamp, document every prior pilot/smoke (including this
   checkpoint's development smokes and the macOS-only PostgreSQL smoke) as
   protocol refinements rather than scored evidence, commit and push that
   exact protocol, and wait for the PR to merge before running any scored
   cell. Do not merge the Cortex source PR (`cdeust/Cortex#452`) or execute
   the 18 scored cells in the same step as the preregistration PR.

## Last known verification evidence

These passes are current as of commit `93070fe` (items 1-4 complete), each
re-run on the final state after the last edit that touched it:

- `hc-cortex-002-analysis.test.mjs`: 27/27
- `validate-benchmark-release.test.mjs`: 27/27
- `hc-cortex-002-real-adapter-e2e.test.mjs` (new): 1/1, real Python adapter
  against the pinned candidate, ~20s wall time
- `hc-cortex-002-postgresql.test.mjs`: 15/15
- `run-workload-ladder.test.mjs`: 9/9
- Candidate adapter pytest: 23/23
- Issue registry: PROVEN (55 dossiers, 2 candidate cards)
- `git diff --check`: clean
- Real macOS PostgreSQL 17.9 smoke (prepare/status/stop against the
  registered protocol): receipt captured in
  `protocols/HC-CORTEX-002-RUNBOOK.md` §2; Linux untested.

Treat every suite as needing a fresh run before resuming item 5 — the commands
below are unchanged, but re-run them on whatever commit you actually resume
from.

## Resume verification commands

Run focused tests first:

```sh
node --check scripts/hc-cortex-002-analysis-lib.mjs
node --check scripts/hc-cortex-002-evidence-lib.mjs
node --check scripts/validate-benchmark-release.mjs
node --check scripts/hc-cortex-002-real-adapter-e2e.test.mjs
node --test scripts/hc-cortex-002-analysis.test.mjs
node --test scripts/validate-benchmark-release.test.mjs
node --test scripts/hc-cortex-002-real-adapter-e2e.test.mjs
node --test scripts/hc-cortex-002-postgresql.test.mjs
node --test scripts/run-workload-ladder.test.mjs
/private/tmp/cortex-hc-cortex-002/.venv/bin/python -m pytest -q adapters/hc-cortex-002/tests
node scripts/validate-issue-registry.mjs
```

Then run repository gates, formatting/type checks applicable to the adapter,
`git diff --check`, and a publication privacy scan. `hc-cortex-002-real-
adapter-e2e.test.mjs` already exercises the real SQLite E2E on every run; the
real PostgreSQL smoke commands are in `protocols/HC-CORTEX-002-RUNBOOK.md`
§2 (run them explicitly — they are not part of the `node --test` suites, since
they provision and tear down a real local PostgreSQL cluster). Preserve exact
stdout/stderr and version receipts.

## Release gates that remain mandatory

- Protocol bytes must be committed and remotely reachable before scoring.
- Every scored cell must use a fresh store and process pair in exact registered
  order.
- PostgreSQL must be the same live owner-private service receipt before and
  after each process, with a fresh database per cell.
- Raw rows and metrics are recomputed independently; producer `passed` flags
  are never accepted as ground truth.
- Negative, skipped, failed, and indeterminate evidence is preserved.
- Full-matrix results are POSIX host-specific. Validator conformance on Windows
  does not imply Windows workload support.
- This issue-specific experiment contributes evidence to the later AI
  Architect maturity score; it must not fabricate a complete-stack maturity
  score by itself.

## Cortex memory follow-up

Before resuming, recall `HC-CORTEX-002`, failed attempts, and prior scores.
After the integrated run, archive the exact before/after result and the change
that caused it. Keep session state in the block-memory checkpoint, not in a flat
archival fact.
