You are executing the P1–P3 retrieval probes for Harness A under Claude Code.

Target repository: `{{REPO}}`. This session's `CLAUDE_CONFIG_DIR` exposes only
the Harness A MCP servers and the `claude-mem`/`superpowers` plugins. Do not
read the target repository with Read/Grep/Bash. No Cortex or ai-architect
tool exists in this session; do not score your answers.

Answer these probes, citing the exact MCP result that grounds each answer:
P1: What are the main entry points of this repo and what process does each start?
P2: Which module/file has the highest fan-in (most callers/importers), and who calls it?
P3: What does this repo's documentation say the project is for, and what are its top-level components?

Write JSON to `{{OUTPUT}}` with harness="A", target_repo, probes (id, question,
answer, grounding_artifacts, tool_calls_made, errors), and notes. Preserve
limitations and refusals verbatim. Reply only after writing the file.
