# Whole-stack parity and conflict-free setup

## Experimental rule

Claude and Codex are host drivers, not the competing solutions. The current
matched baseline declares Harness A and the complete AI Architect solution as
the two units; each unit must run through both hosts. A capability is
“available” only when the declared surface is installed, version-pinned,
isolated where stateful, and verified by an external handshake in every
required host × solution cell. Conceptual overlap is not counted as parity.

| Capability | Harness A reference | AI Architect solution | Setup required before rerun |
|---|---|---|---|
| Session memory | claude-mem | Cortex/hypermnesia | Pin versions; separate stores and verify recall. |
| Code graph/navigation | Serena + codebase-memory-mcp | ai-architect-mcp-codebase | Provision both on both hosts; record binary/plugin SHAs. |
| Knowledge graph / visualization | Graphify | ai-architect-mcp-codebase + cortex-viz | Compare the resulting capability. |
| Procedures | Superpowers | zetetic-team-subagents | Install pinned bundles; enumerate and retrieve one procedure on both. |
| Notes/vault | Obsidian MCP | Cortex wiki/notes | Explicit per-host vault/state paths; no shared mutable vault in benchmark. |
| SQL/vector | Supabase | Cortex PostgreSQL/pgvector | Separate credentials/tenants; verify read-only health. |
| NoSQL | MongoDB MCP | `UNAVAILABLE` unless declared as common infrastructure | Either provision identical scoped infrastructure for both units or retain the measured gap. |
| Telemetry | OpenTelemetry MCP | Cortex telemetry | Configure distinct service identities and a common collector for every cell. |
| Decision/provenance graph | no current baseline equivalent | ai-architect-mcp-spec + Cortex | Add an eligible reference to both hosts when this capability is compared; otherwise report the asymmetry. |
| LSP | rust-analyzer host plugin | ai-architect-mcp-codebase LSP integration | Pin language servers and measure the declared language/symbol surface rather than assuming equivalence. |

## Conflict controls

- Every host × solution cell uses separate config roots, plugin caches,
  SQLite/state roots, vaults, graph output directories, and telemetry
  `service.name` values.
- MCP processes must never share mutable graph databases or benchmark vaults.
- All versions and executable paths are captured in a parity manifest; no
  unpinned `npx -y`/`uvx` resolution is accepted for a scored run.
- Supabase/MongoDB credentials and tenants are scoped per host; no writes are
  performed by probes unless the probe explicitly requires a disposable DB.

## Operational parity gates

Every declared stack in a matched protocol must be tested with the same
workload ladder and declared
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
