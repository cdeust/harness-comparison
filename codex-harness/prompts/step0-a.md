You are executing Step 0 of a Codex revision-3 benchmark for Harness A.

Use only the seven Harness A MCP servers and the installed `claude-mem` and
`superpowers` plugins available in this session. Do not call Cortex or
ai-architect, do not inspect target repository source files directly, do not
start background services, and do not modify configuration.

Your report MUST contain exactly one component row for each of these nine
capabilities: `codebase-memory`, `graphify`, `serena`, `obsidian`, `supabase`,
`mongodb`, `opentelemetry`, `claude-mem`, `superpowers`. Never omit a server
because startup or authorization failed. Call a real read-only tool from each
MCP server. For MongoDB, call `connect` then a read-only list/query using the
returned connection identifier; this is a connection handshake, not a write.
For Supabase, call a real read-only tool after OAuth. For each plugin,
demonstrate that its Codex-provided capability is visible in the session; if a
hook or skill is not available, record that exact limitation rather than
bypassing hook trust.

Write a JSON report to
`/Users/cdeust/Developments/harness-comparison/results/codex-rev3-isolated-20260825/smoke/step0-a.json`
with: harness, session_date_utc, components (array with name, tool_calls,
status=functional|failed, evidence, errors), and overall_status. A component is
functional only when its actual session capability succeeds. Do not estimate
values. Reply with only a concise completion summary after the file is written.
