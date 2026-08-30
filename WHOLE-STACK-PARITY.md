# Whole-stack parity and conflict-free setup

## Experimental rule

The benchmark compares the declared solutions at the scope appropriate to the
research question. A capability is “available” only when
the same surface is installed, version-pinned, isolated where stateful, and
verified by an external handshake on both Claude and Codex. Conceptual overlap
is not counted as parity.

| Capability | Claude stack | Codex stack | Setup required before rerun |
|---|---|---|---|
| Session memory | claude-mem | Cortex/hypermnesia | Pin versions; separate stores and verify recall. |
| Code graph/navigation | Serena + codebase-memory-mcp | ai-architect-mcp-codebase | Provision both on both hosts; record binary/plugin SHAs. |
| Knowledge graph / visualization | Graphify | ai-architect-mcp-codebase + cortex-viz | Compare the resulting capability. |
| Procedures | Superpowers | zetetic-team-subagents | Install pinned bundles; enumerate and retrieve one procedure on both. |
| Notes/vault | Obsidian MCP | Cortex wiki/notes | Explicit per-host vault/state paths; no shared mutable vault in benchmark. |
| SQL/vector | Supabase | Cortex PostgreSQL/pgvector | Separate credentials/tenants; verify read-only health. |
| NoSQL | MongoDB MCP | no declared native equivalent | Install the same scoped MongoDB MCP on Codex or record a measured gap. |
| Telemetry | OpenTelemetry MCP | Cortex telemetry | Configure distinct service names and a common collector. |
| Decision/provenance graph | no baseline equivalent | ai-architect-mcp-spec + Cortex | Add Semantica on both hosts if this capability is in scope; otherwise score as B-specific. |
| LSP | rust-analyzer host plugin | no declared native equivalent | Install equivalent language servers and verify symbol navigation. |

## Conflict controls

- Claude and Codex use separate config roots, plugin caches, SQLite/state roots,
  vaults, graph output directories, and telemetry `service.name` values.
- MCP processes must never share mutable graph databases or benchmark vaults.
- All versions and executable paths are captured in a parity manifest; no
  unpinned `npx -y`/`uvx` resolution is accepted for a scored run.
- Supabase/MongoDB credentials and tenants are scoped per host; no writes are
  performed by probes unless the probe explicitly requires a disposable DB.

## Operational parity gates

Both stacks must be tested with the same workload ladder and declared
concurrency. Record throughput, p95/p99 latency, queueing, retries, resource
usage, database connections, recovery, and model/tool cost. A separate
security track must verify outbound network policy, TLS, localhost ports,
credential scope, secret redaction, path containment, cross-project memory
isolation, prompt-injection resistance, and unauthorized-write denial.

## Starship follow-ups

The most valuable additional starship capability is Semantica's provenance,
ontology, conflict-detection, temporal-graph, entity-resolution, and
deterministic-reasoning surface. It should be installed and handshaken on both
Claude and Codex before being claimed as shared parity. OpenTelemetry's
collector-backed export and MongoDB's writable round-trip are the next highest
value parity additions.
