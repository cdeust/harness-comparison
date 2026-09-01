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
root, validate
[`protocols/2026-08-30-hc-cortex-002-v1.json`](../../../protocols/2026-08-30-hc-cortex-002-v1.json),
then generate or execute its exact plan with
`node scripts/run-workload-ladder.mjs --protocol <protocol> --release-root <new-release> --source <id=checkout> --runtime <id=executable> [--database <cell=url>]`.
The focused deterministic adapter deliberately excludes the LLM and host
scheduler; it measures the declared transaction boundary and makes no complete
Claude/Codex parity claim. A distinct oracle process reconciles acknowledgements,
rollbacks and persisted rows. Preserve operation ledgers,
database/FTS/vector observations, throughput, p50/p95/p99, queueing, retries,
CPU, memory, disk, connections and recovery in the content-addressed release.
Stop according to the preregistered failure scope and resource policy.

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
- [Preregistered HC-CORTEX-002 protocol](../../../protocols/2026-08-30-hc-cortex-002-v1.json)

## Dependencies and exclusions

Requires an isolated filesystem and deterministic operation ledger. This issue
does not prescribe per-thread connections, a pool, or global serialization.

## Engineering readiness (2026-09-01, harness commit `93070fe`)

No cell of the preregistered 18-cell matrix has run and no verdict below is
upgraded by this note; it records what the pipeline that will produce that
evidence has itself verified so far. Exact commands are in
[`../../../protocols/HC-CORTEX-002-RUNBOOK.md`](../../../protocols/HC-CORTEX-002-RUNBOOK.md).

- The runner, real Python adapter, independent analyzer, sealer, and
  read-only verifier are now integration-tested end-to-end (not unit fakes)
  on a disposable SQLite C1/W1 fixture against the pinned candidate
  checkout — the first time this chain has been driven with real ledger
  evidence rather than synthetic Node fixtures.
  (`scripts/hc-cortex-002-real-adapter-e2e.test.mjs`.)
- That real run surfaced and fixed two integration defects that no synthetic
  fixture had exercised: the privacy scanner treated raw binary evidence
  (a real SQLite database) as UTF-8 text and produced false-positive path
  matches, and the analyzer's provenance-entry validator rejected the real
  runner's own `gitBlob` field. Both are fixed at the source; see
  `scripts/hc-cortex-002-evidence-lib.mjs` and
  `scripts/hc-cortex-002-analysis-lib.mjs`.
- A real PostgreSQL 17.9 (Homebrew) reference-service smoke — `prepare` /
  `status` / `stop` against the actual `initdb`/`pg_ctl` binaries, no fakes —
  completed on this macOS host: eight fresh `template0` databases created
  (one per registered PostgreSQL cell), Unix-socket-only isolation verified
  live, then a clean, non-destructive stop with the process confirmed gone.
  **Linux is untested on this host**; a Linux PostgreSQL smoke remains
  outstanding before any PostgreSQL cell is scored.
- The read-only verifier's rehashed-but-forged rejection is now covered for
  every output document class (analysis, negative evidence, and a manifest
  projection with no separate artifact hash to rehash), not only scoring.
- Remaining before any scored cell: the two-run SQLite ladder and the matched
  PostgreSQL reference cell from the preregistered protocol, run against the
  frozen protocol after the item-5 preregistration PR merges.

## Verdict ledger

- Shared-connection condition: `proven`
- Concurrent corruption reproduction: `pending`
- Independent reconciliation oracle: `pending`
- Regression: `pending`
