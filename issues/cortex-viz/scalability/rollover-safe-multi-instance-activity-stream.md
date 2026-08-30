# HC-CORTEX-VIZ-001 — Rollover-safe multi-instance activity stream

- Project: `cdeust/cortex-viz`
- Category: `scalability`
- Subject: `rollover-safe-multi-instance-activity-stream`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §5a; `BENCHMARK-PROCESS.md` steps 4–6
- Sovereignty dimensions: 3, 6, 7

## Observed condition

The in-memory graph event stream stores a bounded deque but represents a
subscriber cursor as a deque position. After rollover, retained length and
position no longer identify which events a client has seen. Activity tailing
also uses a process-local singleton; the PostgreSQL activity store does not
provide an inter-process notification path.

## Falsifiable hypothesis

A slow or reconnecting client can silently miss retained events after rollover,
and a server instance can fail to observe activity written through another
instance sharing the same durable database.

## Why it matters

An observability surface cannot support workload supervision if scale or
horizontal execution turns a live stream into an incomplete, unmarked view.

## Non-claims

This does not claim durable activity rows are lost or require one messaging
technology. It does not infer a safe stream capacity or acceptable latency from
source inspection.

## Reproduction protocol

Seed the activity store with unique ordered canaries. Run a single-client
baseline, then the producer, subscriber, reconnect and server-instance levels
preregistered before execution. From the repository root, invoke
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
Force rollover at the capacity
declared in the frozen environment manifest and write additional events through
a peer process and directly through the shared database. An independent
sequence oracle compares durable IDs with every delivered or resync response.
Preserve event ledgers, connections, traces and resource samples under
`artifacts/<release>/issues/HC-CORTEX-VIZ-001/raw/`. Stop on fixture drift,
silent sequence divergence or the preregistered resource safety bound.

## Acceptance criteria

- Each event has a durable monotonic identity independent of deque position,
  and rollover produces either exact continuation or an explicit resync signal.
- Fast, slow and reconnecting clients converge to the durable oracle without
  unmarked gaps or duplicates under every preregistered workload level.
- Separate server instances sharing a database observe peer-process and direct
  database writes through a documented wake-up or polling contract.
- Every workload level publishes throughput, p50/p95/p99 latency, queueing,
  retries, CPU, memory, disk, connection count and post-load recovery.
- Process restart and connection loss preserve the last acknowledged cursor or
  require an explicit replay; neither is reported as an uninterrupted success.

## Regression obligation

The smallest baseline-reproducing rollover and peer-instance fixtures are
mandatory after cursor, stream or activity-store changes. Protocol or capacity
changes require the complete preregistered workload matrix.

## Evidence

- [Bounded deque and positional subscription cursor](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/graph_event_stream.py)
- [Process-local live activity transport](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_standalone_activity.py)
- [Activity stream singleton](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/activity_stream.py)
- [Durable PostgreSQL activity store](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/infrastructure/activity_store.py)

## Dependencies and exclusions

Requires a shared disposable PostgreSQL instance, isolated server processes and
a frozen workload manifest. UI rendering throughput and network authentication
are separate dossiers.

## Verdict ledger

- Positional cursor and process-local notification in source: `proven`
- Rollover and peer-instance reproduction: `pending`
- Independent durable-sequence oracle: `pending`
- Regression: `pending`
