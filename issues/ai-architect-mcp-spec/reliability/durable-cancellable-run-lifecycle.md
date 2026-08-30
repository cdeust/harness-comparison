# HC-AIASPEC-001 — Durable cancellable run lifecycle

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `durable-cancellable-run-lifecycle`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §5 and §5a
- Sovereignty dimensions: 2, 6, 7

## Observed condition

The pinned MCP server composes an in-memory run store. Capacity is parsed with
`Number(environmentValue ?? 8)` without validating that the result is a finite
positive integer. Pipeline admission treats every step other than `complete`
as in flight, while no public abort/cancel operation makes failed or abandoned
runs terminal and reclaims their slots.

## Falsifiable hypothesis

Invalid capacity configuration, process restart, failed execution, or user
cancellation can lose run state or leave admission capacity occupied until the
server restarts, with behavior that degrades under concurrent workloads.

## Why it matters

Durable state and deterministic cancellation are control-loop boundaries. A
conversational agent cannot become a reliable multi-project orchestrator if
work disappears on restart or abandoned work blocks unrelated projects.

## Non-claims

No persistence technology, queue discipline, default capacity, or performance
threshold is prescribed. The in-memory implementation can remain useful for
tests and ephemeral single-run operation.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an external pipeline fixture with successful, failing, blocked, and
  deliberately interrupted actions. Preregister capacity configurations
  including absent, blank, zero, negative, nonnumeric, and fractional values.
- Through isolated Claude and Codex adapters, run a single-client baseline and
  then the preregistered concurrency levels; abort selected runs,
  terminate/restart the server, and resume by run identifier.
- Use a deterministic event ledger as the oracle for admission, current
  `NextAction`, terminal transition, cancellation, slot reclamation, project
  isolation, and replay.
- Capture throughput, p50/p95/p99, queue depth, retries, CPU, memory, disk,
  connections, cost, restart/recovery time, event logs, and state snapshots.
  Store artifacts and hashes under `results/<protocol-id>/raw/`.
- Apply the frozen stop rule. Lost state, ambiguous terminal state, or missing
  telemetry is a recorded failure/missingness, not a successful empty run.

## Acceptance criteria

- Each invalid capacity value either prevents startup with a stable diagnostic
  or applies a documented deterministic fallback established before the run;
  capacity is never silently disabled.
- Abort is public and idempotent. Failed, abandoned, and cancelled runs become
  explicit terminal states and release admission capacity without restart.
- After process restart, every nonterminal run resumes at exactly the
  oracle-recorded `NextAction`; no event is duplicated or skipped.
- Concurrent projects and tenants remain isolated. The complete workload report
  reproduces on Claude and Codex with thresholds, repetitions, resources, and
  stop rules preregistered.

## Regression obligation

Run the smallest baseline-reproducing admission/abort/restart fixture after
run-store, state-machine, MCP schema, or capacity changes. Persistence or
lifecycle-contract changes require the full workload, isolation, and cross-host
matrix.

## Evidence

- [Pipeline admission and tool surface](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/mcp-server/src/pipeline-tools.ts)
- [Run-store contract and implementation](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/run-store.ts)
- [Workload contract](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a versioned event schema, isolated persistent stores, and a
fault-injection workload runner. Distributed consensus, cross-region failover,
and a specific database selection are excluded.

## Verdict ledger

- Pinned-source lifecycle observation: `proven`
- External failure/restart reproduction: `pending`
- Deterministic event oracle: `pending`
- Workload and cross-host regression: `pending`
