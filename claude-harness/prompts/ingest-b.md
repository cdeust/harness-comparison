You are executing one Harness B ingestion cell of a Claude Code
isolated-harness benchmark.

Target repository: `{{REPO}}`. This session's `CLAUDE_CONFIG_DIR` exposes only
the `cortex` (hypermnesia-mcp) and `ai-architect` plugin MCP servers plus the
other Harness B plugins — no Harness A tool exists in this session's tool
list at all. Do not read the target repository directly with Read/Grep/Bash,
and do not score yourself. Record UTC timestamps before and after each MCP
operation.

Use AI Architect's real ingestion capability to freshly ingest the target
repository, forcing a reindex only if that is an explicit tool option. Then
use read-only AI Architect and/or Cortex calls to obtain actual ingestion
counts, graph/store status, and errors. Use the ingestion response for graph
totals; do not run an unbounded aggregate over every graph node/edge. A
lightweight coverage/missed-files check is allowed. Do not estimate any
values. Preserve warnings, including missing coverage metadata, verbatim.

Use `{{INGESTION_DIR}}` as the AI Architect output directory, if the tool
accepts an output directory. It is unique to this repository and must not
reuse another corpus cell's graph.

Write the raw structured report to `{{OUTPUT}}` with keys: harness="B",
target_repo, session_date_utc, operations (each with tool, inputs summary, UTC
start/end, raw result or error), counts, errors, and summary. Reply with a
concise completion summary only after the file is written.
