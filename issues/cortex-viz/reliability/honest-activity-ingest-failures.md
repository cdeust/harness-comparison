# HC-CORTEX-VIZ-002 — Honest activity ingest failures

- Project: `cdeust/cortex-viz`
- Category: `reliability`
- Subject: `honest-activity-ingest-failures`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6, 9; `BENCHMARK-PROCESS.md` steps 4–6
- Sovereignty dimensions: 3, 6, 7

## Observed condition

The activity endpoint can return HTTP success with an `{ok:false}` body when a
database write fails, and returns no-content success when no database is
configured. The producer hook waits for the response body but does not validate
the application result; transport exceptions are swallowed.

## Falsifiable hypothesis

Database unavailability, schema failure or transport rejection can be observed
by the producer and benchmark harness as a successful activity publication even
though no durable row exists.

## Why it matters

Silent loss in the evidence channel invalidates orchestration audit trails and
can make benchmark completeness look better than the underlying execution.

## Non-claims

This does not claim activity must block the developer workflow indefinitely or
that every event requires synchronous database durability. A documented local
spool is an admissible delivery contract.

## Reproduction protocol

Send uniquely identifiable valid events through the installed hook with a
healthy database, no configured database, connection refusal, missing schema,
constraint failure and interrupted response. From the repository root, execute
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
in fresh processes. The external
oracle reconciles hook exit/status, HTTP status/body, logs, metrics, any spool
and durable rows after recovery. Preserve fault controls and raw evidence under
`artifacts/<release>/issues/HC-CORTEX-VIZ-002/raw/`. Stop if a fault is not
confirmed by the database oracle or at the preregistered hook timeout.

## Acceptance criteria

- The healthy fixture yields exactly one durable event and one producer
  acknowledgement bound to the same correlation identifier.
- Each injected persistence or transport failure produces a defined non-success
  signal or a durable retry/spool receipt that the producer detects.
- No-database mode is explicitly disabled or visibly degraded; it never returns
  an indistinguishable durable-success outcome.
- Recovery reconciles accepted, retried and rejected events without hidden loss
  or duplicate durable rows.
- Logs and counters expose failure class and correlation while redacting event
  payload secrets.

## Regression obligation

The healthy write and smallest baseline-reproducing persistence failure are
mandatory after hook, endpoint or store changes. Delivery-contract changes
require the full fault and recovery matrix.

## Evidence

- [Activity endpoint response behavior](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_standalone_activity.py)
- [Producer hook response and exception handling](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/hooks/activity_capture.py)
- [Current live endpoint contract coverage](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/tests/test_http_live_coverage_contracts.py)

## Dependencies and exclusions

Requires controllable database failures and an isolated hook installation.
Writer authentication and stream fan-out are evaluated separately.

## Verdict ledger

- Success-like failure responses in source: `proven`
- Fault-injected end-to-end reproduction: `pending`
- Independent durable-row oracle: `pending`
- Regression: `pending`
