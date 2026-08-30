# HC-CORTEX-002 deterministic adapter

This adapter executes the preregistered HC-CORTEX-002 transaction-isolation
fixture against a caller-supplied, pinned Cortex checkout. It calls no model,
remote tool, embedding service, or MCP transport. The measured boundary is
Cortex `safe_handler`, its source admission semaphore and worker dispatch, plus
`SqliteMemoryStore` or `PgMemoryStore` mutations.

Interface: `hc-cortex-002/v1`

Executable: `adapters/hc-cortex-002/adapter.py`

Publication status: SQLite is adapter-verified against baseline
`8f5ae3b87b6969f3abcb3736859febfdab69304a` and candidate
`9faa80d3f36b1c7fd05edb4aca8202448a79fb27`. The live PostgreSQL path is
implemented and compatibility-tested, but **not yet live-verified**. No
PostgreSQL cell may be scored until the preregistered private service, complete
workload and fresh-process oracle pass.

## Executable fixture

For `W = --operations-per-type`, setup creates `2W + 1` disjoint targets: one
supersession target and one deletion target per normal operation, plus one fault
target. The measured phase then runs:

1. one faulted supersession;
2. `W` normal remembers;
3. `W` atomic supersessions;
4. `W` deletes.

At concurrency one, the fault rolls back alone. At concurrency two or greater,
it waits for a peer remember. The SQLite peer sets `busy_timeout=0`, records the
one permitted locked observation, waits for the exact fault rollback, and then
retries once. PostgreSQL uses the same paired choreography without the
SQLite-only retry. The rejected marker must never persist and the fault target
must remain the open head.

After load removal, one `recovery_health` operation crosses `safe_handler` and
performs only reads. It observes memory, FTS and vector counts and, for SQLite,
`integrity_check` and foreign keys. It does not add a marker or mutate the row
set. The derived final live count is:

```text
(2W + 1 seeds) - W deleted targets + W remembers + W supersessions = 3W + 1
```

This fixture follows SQLite's documented connection isolation boundary
([SQLite isolation](https://www.sqlite.org/isolation.html)) and uses PostgreSQL
transactions as the matched backend reference
([PostgreSQL transactions](https://www.postgresql.org/docs/17/tutorial-transactions.html)).

## Closed-loop admission policy

The ordinary load list is deterministic: remaining remembers first, then
supersessions, then deletes. Exactly `min(C, remaining operations)` worker loops
exist. A worker submits its next operation only after its prior operation has a
terminal outcome; the adapter never creates one task per future operation.

The initial worker cohort synchronizes at a no-timeout async gate after every
cohort intent is durably journaled and before any cohort call reaches
`safe_handler`. This makes the main `W=100` C4/C5 boundary reproducible without
altering Cortex admission semantics: C4 offers four remembers to the source
budget of four, while C5 offers five and observes the source queue. The ledger
records the cohort policy and initial operation types.

Queue time begins immediately before Cortex's imported `admit(tool_name)` and
ends after its context manager acquires. Service time begins there and ends
when `safe_handler` returns. Pre-admission adapter time is reported separately.
Each outcome retains the observed tool, source budget, queued flag and monotonic
admission timestamps. Setup and recovery cross the same boundary but are
excluded from load distributions.

## Fresh-store and local-service boundary

The workload checks freshness before constructing a Cortex store and never
cleans or reuses a target:

- SQLite inspects non-internal `sqlite_master` relations. A missing or zero-byte
  file is empty; an existing populated schema fails closed.
- PostgreSQL counts non-system, non-extension-owned relations in `pg_catalog`.
  Installed extensions are permitted; any user relation fails closed before
  `PgMemoryStore` schema initialization.

Because `--database` is process argv, PostgreSQL accepts only a credential-free
local binding. Passwords, password/SSL-key/service-file settings, remote hosts
and TCP/loopback bindings are rejected before a journal is created. Scored runs
must use one owner-controlled Unix-domain socket directory with mode `0700`;
the provisioned server has empty `listen_addresses`, local trust behind that
filesystem boundary and rejected host authentication. This study does not
evaluate networked PostgreSQL security.

Never point the adapter at a production or shared database.

## Invocation

Use the Python executable and `PYTHONPATH` belonging to the pinned Cortex
checkout. The adapter is working-directory independent.

```sh
PYTHONPATH=/absolute/pinned/Cortex \
  /absolute/pinned/Cortex/.venv/bin/python \
  adapters/hc-cortex-002/adapter.py \
  --mode workload \
  --release-id <release-id> \
  --protocol-id <protocol-id> \
  --protocol-sha256 <registered-protocol-sha256> \
  --cell-id <planned-cell-id> \
  --attempt-id <unique-attempt-id> \
  --process-instance-id <workload-process-instance-id> \
  --backend sqlite \
  --database <fresh-database-path> \
  --concurrency <registered-concurrency> \
  --operations-per-type <registered-count> \
  --run-id <unique-data-namespace> \
  --output-dir <immutable-cell-artifact-directory>
```

After workload exit, invoke the same arguments with `--mode oracle` and a new
`--process-instance-id`. The oracle must be a fresh process. SQLite `:memory:`
is rejected because it cannot cross that boundary.

Stdout contains exactly one portable orchestration envelope. `ledger_path` is a
basename relative to the supplied output directory, never a private host path:

```json
{
  "interface": "hc-cortex-002/v1",
  "mode": "workload",
  "status": "complete",
  "ledger_path": "<run-id>.workload.jsonl",
  "verdict": "pending"
}
```

Workload returns `complete/pending` with exit 0. Oracle returns
`complete/proven` with exit 0 or `complete/blocked` with exit 1. Adapter failure
or interruption returns exit 2 with `failed` or `indeterminate`; uncertain
native work is never relabelled as rejected.

## Immutable raw evidence

Each process creates its own JSONL ledger with `O_EXCL | O_APPEND`. Every line
binds release, protocol, protocol SHA-256, cell, attempt and process-instance
identity; records a canonical UTC `Z` timestamp, monotonic time and sequence;
and includes predecessor and line SHA-256 digests. The writer loops across
legal short writes and `fsync`s every complete line. An operation intent is
therefore durable before its effect begins. SHA-256 follows the NIST Secure Hash
Standard ([FIPS 180-4](https://doi.org/10.6028/NIST.FIPS.180-4)).

The workload emits one raw `load_window` after `_load` returns and before the
measurement summary. Its `start_monotonic_ns`, `end_monotonic_ns` and
`elapsed_ns` values are canonical decimal strings; `elapsed = end - start`
exactly. Load `operation_outcome` records retain their numeric duration fields
and decimal-string admission timestamps, so a consumer can recompute
throughput, quantiles, queue depth and concurrent admission without trusting
the aggregate summary.

The oracle publishes a `hc-cortex-002/persisted-state/v1` snapshot rather than
only its verdict. Rows are ordered by ID and expose exactly `id`, `content`,
`supersedes_id`, `superseded_by_id`, `fts_populated` and `vector_populated`.
The scope binds the fixed `hc-cortex-002` domain to the run ID. PostgreSQL also
publishes every non-system, non-extension-owned user-table constraint with its
table, type, ordered local/reference columns, definition and `convalidated`
observation. The snapshot contains no database binding, checkout path or
credential.

Runtime provenance publishes the Cortex commit, dirty observation, package-file
digest, version and platform. Checkout and Python executable locations appear
only as SHA-256 identities (plus the executable basename). Database bindings
are never emitted; PostgreSQL identity excludes credentials before hashing.
Errors redact PostgreSQL URLs, keyword secrets and POSIX/Windows absolute paths.
Expected Cortex traceback logging is disabled because it embeds private source
paths; the chained outcome record remains the diagnostic evidence.

## Independent oracle

The oracle refuses the cell unless all registered exact predicates pass:

- the workload chain and bound configuration verify;
- one pre-store observation proves zero user relations;
- each unique intent has exactly one outcome;
- all ordinary operations are acknowledged and the fault is rejected;
- acknowledged markers occur once, rejected/deleted markers zero times, and no
  unexpected run marker exists;
- supersession edges are reciprocal, deleted targets are absent, and the fault
  target remains unsuperseded;
- post-load read-only health and post-restart memory/FTS/vector counts equal
  `3W + 1`;
- SQLite integrity and foreign-key checks pass;
- every observed PostgreSQL user-table constraint is validated, and the two
  self-referential memory supersession foreign keys declared by the pinned
  Cortex schema are present;
- workload and oracle boot nonces and process-instance identities differ;
- the raw load window is canonical, encloses every measured intent/outcome and
  agrees exactly with the summarized elapsed duration;
- telemetry contains only the `3W + 1` measured load outcomes, every operation
  type, explicit connection fields and the zero-model boundary.

Missing sqlite-vec capability is recorded as unavailable and blocks the vector
predicate. It is not converted into a zero-count pass.

## Measurements and non-claims

The workload reports aggregate and per-operation-type completed/outcome/error/
retry counts, throughput using the common measured load wall time, and queue,
service and total p50/p95/p99. Quantiles use **Hyndman-Fan type 1**, the inverse
empirical distribution at rank `ceil(n*p)`
([Hyndman and Fan 1996](https://doi.org/10.1080/00031305.1996.10473566)).

It also reports maximum source-admission queue depth, maximum dispatcher
in-flight count, CPU, maximum RSS when available, database/WAL/SHM or PostgreSQL
database bytes, and store-owned `open_after_load` plus `peak_open` connections
with the observation method. Candidate SQLite registry handles are sampled
inside service before request release; the baseline's revision has one explicit
shared-handle capability. Unsupported telemetry is `null` with a reason, never
inferred. On platforms without Python's POSIX `resource` module, RSS is likewise
`null` and CPU uses the cross-platform standard-library process times.

Model/tool cost is emitted exactly as:

```json
{"model_calls":0,"remote_tool_calls":0,"attributable_cost":null,"unit":"not-applicable"}
```

There are no adapter latency, throughput, queue, memory, connection or recovery
thresholds. Performance is observational. `asyncio.to_thread` cancellation
does not prove native work stopped, so cancellation or a missing admission/
terminal observation remains indeterminate until reconciliation
([Python `asyncio.to_thread`](https://docs.python.org/3/library/asyncio-task.html#asyncio.to_thread)).

The adapter tests request-boundary isolation only. It does not claim that an
already committed store call can be undone as part of a larger handler unit of
work, and one proven cell generalizes only to its exact pinned source, backend,
parameters, host and repetition.

## Verification

Run with the pinned candidate environment:

```sh
PYTHONPATH=/absolute/pinned/Cortex \
  /absolute/pinned/Cortex/.venv/bin/python -m pytest \
  adapters/hc-cortex-002/tests -q
```

The suite covers short journal writes and identity drift, cross-platform RSS
fallback, baseline/candidate and PostgreSQL cursor compatibility, fail-closed
freshness, connection open/peak telemetry, credential/path privacy, real C4/C5
source admission behavior, a real two-process SQLite workload/oracle, raw-row
recomputation against forged clean verdicts, and PostgreSQL constraint-contract
mutations. A PostgreSQL cell remains unscored until the complete registered
matrix is executed and sealed; an ad hoc local smoke is not publication data.
