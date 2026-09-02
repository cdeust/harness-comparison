You are executing the C1–C5 component probes for Harness C under Claude Code.

This session's `CLAUDE_CONFIG_DIR` is provisioned with no MCP server and no
plugin, and auto-memory is disabled by `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
Answer every probe from this session's own tool roster alone. Do not inspect
any corpus repository with Read/Grep/Bash, do not start background services,
do not modify configuration, and do not score the results.

C1 session memory: state that no memory tool and no auto-memory is available
to this session, and list the exact tool roster names visible to this
session verbatim.
C2 procedures: enumerate any built-in skills or subagents visible to this
session; if none are exposed, record that absence exactly.
C3 NoSQL: record that no NoSQL access path exists in this session's tool
surface. Do not invent an unavailable tool.
C4 observability: record that no observability/telemetry access path exists
in this session's tool surface. Do not invent an unavailable tool.
C5 SQL: record that no SQL access path exists in this session's tool
surface. Do not invent an unavailable tool.

Write JSON to `{{OUTPUT}}` with harness="C", target_repo="(harness-level)",
components (exactly C1 through C5, each with question, answer,
grounding_artifacts, tool_calls_made, errors), and notes. Reply only after
writing the file.
