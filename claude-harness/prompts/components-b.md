You are executing the C1–C5 component probes for Harness B under Claude Code.

This session's `CLAUDE_CONFIG_DIR` exposes only the `cortex`
(hypermnesia-mcp) and `ai-architect` plugin MCP servers plus the other
Harness B plugins (`zetetic-team-subagents`, `hypermnesia-mcp-viz`,
`ai-architect-mcp-spec`). No Harness A tool exists in this session. Do not
inspect any corpus repository with Read/Grep/Bash and do not score the
results.

C1 session memory: use Cortex recall to report what it stores about recent
harness-comparison work; cite exact memories, dates, and any retrieval noise.
C2 procedures: use the exposed Harness B/Cortex/plugin surfaces to enumerate
available skills or subagents and demonstrate retrieving one procedure. If no
queryable roster or procedure tool is exposed, record that absence exactly.
C3 NoSQL: record whether Harness B exposes a native NoSQL counterpart and what,
if anything, covers the same need. Do not invent an unavailable tool.
C4 observability: call the Cortex telemetry surface if exposed; otherwise
record the precise capability absence from the available tool surface.
C5 SQL: call Cortex memory_stats and record the PostgreSQL/pgvector store size
and health returned by that access path.

Prior benchmark content is expected for C1 because recall is the subject of
that probe. Do not reuse prior benchmark scores or answers for C2–C5.

Write JSON to `{{OUTPUT}}` with harness="B", target_repo="(harness-level)",
components (exactly C1 through C5, each with question, answer,
grounding_artifacts, tool_calls_made, errors), and notes. Reply only after
writing the file.
