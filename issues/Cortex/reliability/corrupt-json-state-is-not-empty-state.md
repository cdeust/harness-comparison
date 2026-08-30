# HC-CORTEX-007 — Corrupt JSON state is not empty state

- Project: `cdeust/Cortex`
- Category: `reliability`
- Subject: `corrupt-json-state-is-not-empty-state`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `BENCHMARK-PROCESS.md` steps 4–6
- Sovereignty dimensions: 3, 6, 7

## Observed condition

The shared JSON reader returns the same `None` value for a missing file and a
decode or I/O failure. Session and profile stores can then substitute an empty
state, so corruption is not distinguishable from first use at their public
boundary.

## Falsifiable hypothesis

A truncated or malformed state file can reset session or profile state without
an explicit failure, quarantine record or recovery receipt.

## Why it matters

Silent state loss makes deterministic orchestration and benchmark
reproducibility unverifiable even when the primary memory database remains
healthy.

## Non-claims

This does not claim that current JSON writes are non-atomic; the shared writer
uses replacement. It does not prescribe whether recovery uses a backup, journal
or user-mediated repair.

## Reproduction protocol

Create fresh missing, valid, truncated, malformed and wrong-type fixtures for
the session and profile stores, then invoke the public load/update paths from a
fresh process. From the repository root, run
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
Inject termination
at each write boundary and run the concurrency levels preregistered before the
run. An independent oracle
compares the last acknowledged state, returned status, stderr and filesystem
artifacts. Preserve all inputs and outputs under
`artifacts/<release>/issues/HC-CORTEX-007/raw/`. Stop if a fixture hash changes
before invocation or at the preregistered process timeout.

## Acceptance criteria

- Missing, corrupt and valid state produce three externally distinguishable
  outcomes through stable status, receipt or exit behavior.
- A corrupt fixture is never accepted as a successful empty initialization;
  it is either recovered from a verified copy or quarantined with an auditable
  failure.
- After injected termination, the observable state is exactly the last
  acknowledged version or the next complete version, never partial JSON.
- Concurrent acknowledged updates are reconciled exactly once by the external
  state ledger, and a rejected update changes nothing.
- Logs identify the state kind and recovery action without exposing stored
  session content.

## Regression obligation

The malformed-file and interrupted-write fixtures are mandatory after any
JSON, session-store or profile-store change. Changes to recovery semantics
require the full missing/corrupt/concurrent matrix.

## Evidence

- [Shared JSON read and atomic write behavior](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/file_io.py)
- [Profile index initialization](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/profile_store.py)
- [Session fallback state](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/session_store.py)

## Dependencies and exclusions

Requires disposable state roots and kill-point injection. Database corruption,
tenant authorization and transcript recovery are separate dossiers.

## Verdict ledger

- Missing/corrupt result collapse in source: `proven`
- Runtime silent-reset reproduction: `pending`
- Independent state oracle: `pending`
- Regression: `pending`
