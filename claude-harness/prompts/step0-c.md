You are executing Step 0 of the Claude Code isolated-harness benchmark for
Harness C. This session's `CLAUDE_CONFIG_DIR` is provisioned with no MCP
server and no plugin, and auto-memory is disabled by
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Answer from this session's own tool
roster alone. Do not inspect target repository source files directly with
Read/Grep/Bash, do not start background services, and do not modify
configuration.

Target corpus repository for this check:
`~/Developments/anthropic-partnership/zetetic-team-subagents` — the same
repository Harness A's and Harness B's Step 0 target, for a directly
comparable check.

List every tool name available to this session verbatim. Assert that none
of them starts with `mcp__` and that no plugin skill is listed. An empty
`components` array is the expected result for this harness.

Write a JSON report to
`claude-harness/runtime/c/step0-report.json` (resolve relative to this
repository's root) with: `harness`, `session_date_utc`, `tool_roster` (array
of tool names), `components` (empty array is expected), and
`overall_status`. Do not estimate any value. Reply with only a concise
completion summary after the file is written.
