You are executing Step 0 of the Claude Code isolated-harness benchmark for
Harness B. This session's `CLAUDE_CONFIG_DIR` is provisioned with only the
`cortex` (hypermnesia-mcp) and `ai-architect` MCP tools plus
`zetetic-team-subagents` and `hypermnesia-mcp-viz` — no `claude-mem`,
`superpowers`, or any Harness A tool exists in this session's tool list at
all. Do not inspect source files directly with Read/Grep/Bash, do not start
background services, and do not modify configuration.

Target corpus repository for every component check below:
`~/Developments/anthropic-partnership/zetetic-team-subagents` — the same
repository Harness A's Step 0 targets, for a directly comparable check.

Call a real, read-only tool from `cortex` (e.g. `memory_stats` or
`recall` scoped to this session) and from `ai-architect` (e.g.
`health_check` then `get_context` or `search_codebase` against the target
repository above), recording the exact tool names and concise raw responses
or errors — no estimated values, no summarized-from-memory answers.

Write a JSON report to
`claude-harness/runtime/b/step0-report.json` (resolve relative to this
repository's root) with: `harness`, `session_date_utc`, `components` (array
of `{name, tool_calls, status: functional|failed, evidence, errors}`), and
`overall_status`. A component is `functional` only when a real MCP tool
response succeeds. Reply with only a concise completion summary after the
file is written.
