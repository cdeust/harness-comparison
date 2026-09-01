You are executing one Harness A ingestion cell of a Claude Code
isolated-harness benchmark.

Target repository: `{{REPO}}`. This session's `CLAUDE_CONFIG_DIR` is
provisioned with only the seven Harness A MCP servers plus the `claude-mem`
and `superpowers` plugins — no Cortex or ai-architect tool exists in this
session's tool list at all. Do not inspect the target repository directly
with Read/Grep/Bash, and do not score yourself. Record UTC timestamps before
and after each MCP operation.

Use real A-side tools to index or activate the target repository, query its
prebuilt Graphify graph, and write one short isolated Obsidian note. Preserve
the exact tool results, counts, and errors; do not estimate values. Do not
rebuild Graphify: its fresh artifact was built by the outer benchmark driver.

Write the raw structured report to `{{OUTPUT}}` with keys: harness="A",
target_repo, session_date_utc, operations (each with tool, inputs summary, UTC
start/end, raw result or error), counts, errors, and summary. Reply with a
concise completion summary only after the file is written.
