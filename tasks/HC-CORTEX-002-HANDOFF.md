# HC-CORTEX-002 WIP handoff

Status captured on 2026-08-31 because the session reached its quota threshold.
This branch is an intentionally incomplete engineering checkpoint. It is not a
preregistered protocol release, benchmark result, or publishable score.

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

The tree is syntactically valid, but the latest cross-contract changes have not
received an integrated green run. Resume from these items in order.

1. Finish the Node persisted-state recomputation in
   `scripts/hc-cortex-002-analysis-lib.mjs`.
   - The initial normalized-row/edge/count/constraint implementation was added
     immediately before this checkpoint.
   - Fix the `load_window_exact` consumer to match the producer contract. The
     producer `observed` object contains `event_count`, start/end/elapsed,
     `summary_elapsed_ns`, `load_intent_count`, and `load_outcome_count`.
     Recompute the BigInt arithmetic and enclosure directly; do not make truth
     depend on the producer's explanatory `expected` prose.
   - Pass the independently recomputed persisted state into every relevant
     oracle predicate and validate the normalized snapshot before accepting the
     producer verdict.
   - Update analysis fixtures with realistic row IDs, markers, reciprocal
     supersession edges, the deleted target, the rejected fault row, scope, and
     `postgresql_constraints: "not_applicable"` for SQLite. The blocked
     baseline fixture must contain raw causal corruption, not merely a false
     producer check.
   - Add adversarial tests where a producer reports `proven` while normalized
     row content or an edge is forged; Node must reject both.

2. Repair issue-specific verification in discovery.
   - The latest `validate-benchmark-release.mjs` integration assumes
     `<release>/protocol.json`.
   - The generic manifest contract permits another registered protocol snapshot
     path, and the validator fixture uses `protocols/fixture.json`.
   - Derive the protocol location from the already validated manifest, retain
     safe-path checks, and add quiescence across generic plus issue-specific
     verification. A release-gate reviewer reproduced this regression before
     the session stopped.

3. Complete the real contract E2E.
   - Add a runner -> real Python adapter -> analyzer -> sealer -> read-only
     verifier SQLite C1/W1 conformance test against the pinned candidate.
   - Keep a separate real PostgreSQL 17 smoke on Linux and macOS. Unit fakes do
     not establish workload support.
   - The read-only verifier must reject rehashed but forged analysis, scoring,
     negative evidence, and manifest projections.

4. Reconcile documentation and preregistration.
   - Add an exact runbook for protocol validation, PostgreSQL prepare/status/
     stop, runner bindings, analysis, sealing, deep verification, and generic
     release validation.
   - Update the Cortex issue dossier and `tasks/todo.md` only from the final
     integrated state.
   - Add `.gitattributes` for LF-stable research artifacts if it is still
     absent.
   - Replace the provisional `registeredAt` at freeze time, commit and push the
     preregistration PR, and wait for merge before running scored cells.

5. Run independent release review, then open the harness preregistration PR.
   Do not merge the Cortex source PR or execute the 18 scored cells in the same
   step.

## Last known verification evidence

These passes occurred before the final incomplete persisted-state/CLI edits:

- runner conformance: 9/9
- independent analysis/sealing: 21/21
- generic release validator: 26/26
- PostgreSQL provisioner targeted suite: 12/12, followed by the security
  review's combined targeted 33/33
- candidate adapter: 23/23, Ruff clean
- Cortex candidate source suite: 7,669 tests plus 123 subtests, with draft PR CI
  green

After the final edits, only syntax was checked successfully for the runner,
analyzer, and release-validator CLI. Treat every behavioral suite as needing a
fresh run.

## Resume verification commands

Run focused tests first:

```sh
node --check scripts/hc-cortex-002-analysis-lib.mjs
node --check scripts/validate-benchmark-release.mjs
node --test scripts/hc-cortex-002-analysis.test.mjs
node --test scripts/validate-benchmark-release.test.mjs
node --test scripts/hc-cortex-002-postgresql.test.mjs
node --test scripts/run-workload-ladder.test.mjs
/private/tmp/cortex-hc-cortex-002/.venv/bin/python -m pytest -q adapters/hc-cortex-002/tests
```

Then run repository gates, formatting/type checks applicable to the adapter,
`git diff --check`, a publication privacy scan, the real SQLite E2E, and the
real PostgreSQL smoke. Preserve exact stdout/stderr and version receipts.

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
