You are executing the P1–P3 retrieval probes for Harness C under Claude Code.

Target repository: `{{REPO}}`. This session's `CLAUDE_CONFIG_DIR` is
provisioned with no MCP server and no plugin, and auto-memory is disabled by
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Answer by exploring the target
repository file by file with the built-in Read, Grep and Glob tools; cite the
exact file paths (and line ranges) that ground each answer. Do not modify the
target repository, do not start background services, do not modify
configuration, do not score your answers.

Answer these probes, citing the exact MCP result that grounds each answer:
P1: What are the main entry points of this repo and what process does each start?
P2: Which module/file has the highest fan-in (most callers/importers), and who calls it?
P3: What does this repo's documentation say the project is for, and what are its top-level components?

Write JSON to `{{OUTPUT}}` with harness="C", target_repo, probes (id, question,
answer, grounding_artifacts, tool_calls_made, errors), and notes. Preserve
limitations and refusals verbatim. Reply only after writing the file.
