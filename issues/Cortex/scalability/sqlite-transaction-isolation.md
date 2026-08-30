# HC-CORTEX-002 — SQLite transaction isolation under concurrent tools

- Project: `cdeust/Cortex`
- Category: `scalability`
- Subject: `sqlite-transaction-isolation`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §5a
- Sovereignty dimensions: 3, 6, 7

## Observed condition

The process-wide SQLite store owns one connection created with
`check_same_thread=False`. Tool handlers are dispatched through worker threads,
and no store-level `Lock` or `RLock` serializes transactions on that connection.

## Falsifiable hypothesis

Concurrent `remember`, `supersede` and `forget` calls can interleave transaction
state, allowing one call to commit or roll back another call's work.

## Why it matters

Silent cross-request transaction interference would corrupt the default local
store precisely when workload concurrency increases.

## Non-claims

Static evidence alone does not establish an observed corruption rate or a safe
maximum concurrency. PostgreSQL pool behavior is not accused by this dossier.

## Reproduction protocol

Populate a disposable SQLite fixture with uniquely traceable rows. Execute a
single-client baseline followed by concurrency levels preregistered before the
run for mixed remember, supersede and forget operations, with a fault-injected
rollback at every level. Use a fresh process per level. From the repository
root, invoke the preregistered cell with
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
An independent operation ledger reconciles acknowledgements, rollbacks and
persisted rows. Preserve operation ledgers, database/FTS/vector snapshots,
throughput, p50/p95/p99, queueing, retries, CPU, memory, disk and recovery under
`artifacts/<release>/issues/HC-CORTEX-002/raw/`. Stop at fixture corruption or
the preregistered resource safety bound.

## Acceptance criteria

- Every acknowledged operation appears exactly once in the independent
  operation-to-row reconciliation; every rejected operation appears zero times.
- An injected rollback removes only the transaction that received the fault.
- `PRAGMA integrity_check`, foreign-key checks and reconciled memory, FTS and
  vector counts pass after every level and after process restart.
- Every ladder level publishes throughput, p50/p95/p99, queue depth, errors,
  retries, CPU, memory, disk, connections and post-load recovery.
- A second clean run reproduces the outcome schema and any observed saturation
  point without changing the pass threshold post hoc.

## Regression obligation

The smallest baseline-reproducing concurrent fault fixture is the regression
slice. Any
connection or transaction-boundary change requires the full preregistered
SQLite ladder and the matched PostgreSQL reference cell.

## Evidence

- [Shared SQLite connection](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/sqlite_store.py)
- [Process-wide store cache](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/memory_store.py)
- [Worker-thread dispatch](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/tool_error_handler.py)

## Dependencies and exclusions

Requires an isolated filesystem and deterministic operation ledger. This issue
does not prescribe per-thread connections, a pool, or global serialization.

## Verdict ledger

- Shared-connection condition: `proven`
- Concurrent corruption reproduction: `pending`
- Independent reconciliation oracle: `pending`
- Regression: `pending`
