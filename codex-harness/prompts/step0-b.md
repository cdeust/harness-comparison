You are executing Step 0 of a Codex revision-3 benchmark for Harness B.

Use only the `cortex` and `ai-architect` MCP servers available in this session.
Do not call any Harness A tool, do not inspect source files directly, do not
start background services, and do not modify configuration. Call a real,
read-only tool from each server, recording the exact tool names and concise raw
responses or errors.

Write a JSON report to
`/Users/cdeust/Developments/harness-comparison/results/codex-rev3-isolated-20260825/smoke/step0-b.json`
with: harness, session_date_utc, components (array with name, tool_calls,
status=functional|failed, evidence, errors), and overall_status. A component is
functional only when a real MCP tool response succeeds. Do not estimate values.
Reply with only a concise completion summary after the file is written.
