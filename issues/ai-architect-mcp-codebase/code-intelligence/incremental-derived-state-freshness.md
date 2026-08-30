# HC-AIACB-004 — Fresh incremental derived state

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `incremental-derived-state-freshness`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: RESEARCH-PROCESS.md §5 and §5a
- Sovereignty dimensions: 6, 7

## Observed condition

The incremental `index_codebase` path updates indexed graph content, but its
completion path does not run the full resolver, clustering, process, and search
index phases used by `analyze_codebase`. Existing tests cover index-stage
preservation, not equivalence of all read tools after an incremental edit.

## Falsifiable hypothesis

After an edit, add, delete, or rename, a single incremental update can leave
resolved edges, communities, processes, or ranked search results different from
a clean full rebuild while subsequent reads appear usable.

## Why it matters

Stale derived state is a silent-failure and scalability boundary. If freshness
requires an undocumented full rebuild, incremental cost claims and agent
decisions based on search or impact are not reproducible.

## Non-claims

The index-stage incremental algorithm is not claimed to lose every edge. No
latency or throughput target is set here, and a full rebuild is not assumed to
be the desired implementation.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Pin independent small, medium, and large corpus repositories according to
  `CORPUS-DESIGN.md`. Predeclare edit, add, delete, and rename mutations.
- For every mutation, clone the same clean snapshot twice. On one arm run a
  full rebuild; on the other run the documented incremental command once.
  Query `search_codebase`, `get_context`, `get_impact`, graph schema, clusters,
  processes, and freshness metadata through Claude and Codex.
- Compare both arms with a canonical graph/search export that normalizes only
  preregistered nondeterministic fields.
- Capture throughput, p50/p95/p99, queueing, retries, CPU, memory, disk,
  connections, model/tool cost, and post-interruption recovery from a
  single-client baseline followed by preregistered workload levels.
- Preserve mutations, commands, snapshots, raw envelopes, canonical exports,
  telemetry, and hashes under `results/<protocol-id>/raw/`. Apply the declared
  stop rule; never convert an unavailable phase into equality.

## Acceptance criteria

- For every mutation, one incremental refresh and a clean rebuild produce the
  same canonical nodes, resolved relations, communities, processes, freshness
  state, and preregistered search/context/impact results.
- Deleted and renamed entities leave no stale searchable or traversable state;
  new and changed entities are visible without an undocumented manual phase.
- The workload report publishes all required latency, throughput, queue,
  retry, resource, connection, cost, saturation, and recovery fields for both
  paths, with repetitions and resource policy frozen before execution.
- Results pass separately on Claude and Codex with isolated mutable graphs.

## Regression obligation

Run the smallest baseline-reproducing mutation-equivalence fixture after index,
resolver, clustering, process, search, or freshness changes. Changes to phase
ordering, protocol, or stack surface require the complete corpus and workload
matrix.

## Evidence

- [Incremental handler](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/indexing_handlers.rs)
- [Incremental index implementation](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/indexer/incremental.rs)
- [Full analysis pipeline](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/analyze_handlers.rs)
- [Workload contract](../../../RESEARCH-PROCESS.md)
- [Independent corpus contract](../../../CORPUS-DESIGN.md)

## Dependencies and exclusions

Depends on canonical export rules, pinned corpus snapshots, isolated graph
roots, and an instrumented workload runner. Choosing a new clustering or
ranking algorithm is excluded; the oracle is rebuild equivalence at one
revision.

## Verdict ledger

- Pinned-source observation: `proven`
- External mutation reproduction: `pending`
- Rebuild-equivalence oracle: `pending`
- Workload and regression matrix: `pending`
