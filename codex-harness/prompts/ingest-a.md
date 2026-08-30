You are executing one Harness A ingestion cell of a Codex revision-3 benchmark.

Target repository: `{{REPO}}`. Use only Harness A MCP servers plus the installed
Harness A plugins. Do not call Cortex or AI Architect, do not inspect the target
repository directly using shell/filesystem tools, and do not score yourself.
Record UTC timestamps before and after each MCP operation.

Use real A-side tools to index or activate the target repository, query its
prebuilt Graphify graph, and write one short isolated Obsidian note. Preserve
the exact tool results, counts, and errors; do not estimate values. Do not
rebuild Graphify: its fresh artifact was built by the outer benchmark driver.

Write the raw structured report to `{{OUTPUT}}` with keys: harness="A",
target_repo, session_date_utc, operations (each with tool, inputs summary, UTC
start/end, raw result or error), counts, errors, and summary. Reply with a
concise completion summary only after the file is written.
