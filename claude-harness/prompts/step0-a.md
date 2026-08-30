You are executing Step 0 of the Claude Code isolated-harness benchmark for
Harness A. This session's `CLAUDE_CONFIG_DIR` is provisioned with only the
seven Harness A MCP servers and the `claude-mem`/`superpowers` plugins — no
Cortex or ai-architect tool exists in this session's tool list at all. Do not
inspect target repository source files directly with Read/Grep/Bash, do not
start background services, and do not modify configuration.

Target corpus repository for every component check below:
`~/Developments/anthropic-partnership/zetetic-team-subagents` — a real
corpus repo (Shell+Markdown-majority, with some Python files), never this
benchmark's own workspace and never a leftover artifact from any other run.

Your report MUST contain exactly one component row for each of these nine
capabilities: `codebase-memory`, `graphify`, `serena`, `obsidian`, `supabase`,
`mongodb`, `opentelemetry`, `claude-mem`, `superpowers`. Never omit a
component because startup or authorization failed — record the failure
instead. A component is `functional` only when its own real capability
succeeds against real evidence; a bare connectivity ping is not sufficient
for any of the three components below, which failed exactly this way in the
prior (non-isolated) rev.3 run and must not repeat that mistake:

- **`codebase-memory`**: call `index_repository` and then `get_architecture`
  against the target corpus repository above (its real path, never
  `harness-comparison` or any path from a different run). Record the actual
  node/edge counts and entry points returned. If any `entry_points` or file
  path in the response does not point inside the target repository, the
  component is `failed`, not `functional` — that is contamination, not
  success.
- **`serena`**: run `serena project create --language python --language bash
  --index <target repo path>` (not the default auto-inferred language list —
  this repo's earlier auto-inference activated only a Bash language server
  and silently skipped Python, which then broke `get_symbols_overview` on
  the repo's Python files; declaring both explicitly is the fix). Then run
  `serena project health-check <target repo path>` and report its **raw**
  output verbatim. The component is `functional` only if health-check itself
  reports the Python language server active and healthy — not merely that
  the MCP server responded to a request.
- **`graphify`**: build the graph for the target repo (`--no-viz`) and query
  it for something naming a real file in the repo; report the raw query
  result. Fabricated-looking output without a citable real file name is
  `failed`.

For the remaining components: `obsidian` — create one real note and read it
back; `supabase` — call a real read-only tool after OAuth; `mongodb` —
`connect` then a real read-only list/query using the returned connection
identifier; `opentelemetry` — call a real read-only tool; for `claude-mem`
and `superpowers`, demonstrate the plugin's capability is actually visible
in this session (a listed skill, a memory write/read round-trip) — if a
hook or skill is unavailable, record that exact limitation, never bypass
hook trust to work around it.

Write a JSON report to
`claude-harness/runtime/a/step0-report.json` (resolve relative to this
repository's root) with: `harness`, `session_date_utc`, `components` (array
of `{name, tool_calls, status: functional|failed, evidence, errors}`), and
`overall_status`. Do not estimate any value. Reply with only a concise
completion summary after the file is written.
