# HC-AIACB-008 — Bounded transitive impact traversal

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `bounded-transitive-impact`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P2`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: RESEARCH-PROCESS.md §5a
- Sovereignty dimensions: 4, 5, 6, 7

## Observed condition

The pinned `get_impact` schema exposes no traversal-depth parameter.
`reverse_dependents` returns the immediate reverse dependency lists, while
callers can manually chain other graph tools. That manual composition does not
publish a bounded, deduplicated, path-carrying transitive result.

## Falsifiable hypothesis

For a dependency graph with chains, fan-out, and cycles, the typed impact
surface cannot return a deterministic bounded transitive blast radius or
distinguish complete from truncated traversal in one auditable operation.

## Why it matters

Long-horizon planning needs both direct and downstream consequences. Manual
agent traversal can vary by host, consume unbounded context/tool calls, and
lose provenance or stopping information.

## Non-claims

One-hop impact is not claimed incorrect. This dossier does not prescribe BFS,
DFS, a default depth, or a universal maximum; limits must be chosen from the
preregistered workload and measured evidence.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Generate a pinned external repository/graph fixture with acyclic chains,
  branching fan-out, shared descendants, multiple edge kinds, cycles, and
  deliberately unresolved edges.
- Freeze expected node, minimum depth, predecessor/path, and epistemic status
  for each declared traversal policy.
- Invoke `get_impact` through isolated Claude and Codex adapters across the
  preregistered depth/node/time policies, starting with a single-client
  baseline and then the preregistered load levels.
- Capture result ordering, duplicates, completeness/partial markers,
  p50/p95/p99, throughput, queueing, retries, resources, connections, cost, and
  recovery after cancellation or load removal.
- Store generator seed/source, graph, oracle, envelopes, telemetry, and hashes
  under `results/<protocol-id>/raw/`. Stop according to the frozen policy and
  never label a capped result exact.

## Acceptance criteria

- Each policy returns exactly the oracle node set, minimum depth, and
  re-queryable path/evidence without duplicate nodes, including cycle cases.
- Depth, node, and execution limits are explicit inputs or versioned policy;
  reaching one returns a stable partial status and continuation evidence.
- Unresolved or heuristic edges preserve lower-bound epistemic status through
  every path.
- The full workload report is reproducible on Claude and Codex with isolated
  state; thresholds, repetitions, and resource policy are frozen before
  results.

## Regression obligation

Run the smallest baseline-reproducing chain, fan-out, or cycle fixture after
impact, resolver, pagination, or response-budget changes. A traversal-policy or
output-contract change requires the full workload and host matrix.

## Evidence

- [Impact tool schema](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/tool_schemas.rs)
- [Impact traversal implementation](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/clustering/impact.rs)
- [Workload and scalability rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a deterministic graph generator, independent traversal oracle, and
response-budget telemetry. Cross-repository super-graph semantics and
predictive impact inference are excluded.

## Verdict ledger

- Pinned-source surface observation: `proven`
- External traversal reproduction: `pending`
- Independent graph oracle: `pending`
- Workload and cross-host regression: `pending`
