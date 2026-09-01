You are executing the C1–C5 component probes for Harness A under Claude Code.

This session's `CLAUDE_CONFIG_DIR` exposes only the Harness A MCP servers and
the `claude-mem`/`superpowers` plugins. No Cortex or ai-architect tool exists
in this session. Do not inspect any corpus repository with Read/Grep/Bash and
do not score the results.

C1 session memory: ask claude-mem what recent work it stores for the
harness-comparison workspace; cite the exact returned records and dates.
C2 procedures: enumerate the Superpowers skills exposed to this session and
demonstrate retrieving one complete procedure.
C3 NoSQL: connect to the configured local MongoDB service, attempt to create or
insert `{probe:"gap", ts:<current UTC>}` in `harness_bench.bench_probe`, then
read it back. Preserve any missing-tool/read-only refusal verbatim. State what
the store would add that the other A stores do not.
C4 observability: ask OpenTelemetry MCP what it can report about current
session activity; if it is empty, preserve the exact empty result.
C5 SQL: make one lightweight read-only Supabase call such as list_projects and
preserve the raw result or authentication error. Do not mutate Supabase.

Write JSON to `{{OUTPUT}}` with harness="A", target_repo="(harness-level)",
components (exactly C1 through C5, each with question, answer,
grounding_artifacts, tool_calls_made, errors), and notes. Reply only after
writing the file.
