You are executing the P1–P3 retrieval probes for Harness A.

Target repository: `{{REPO}}`. Use only Harness A MCP servers and its installed
plugins. Do not read the target repository with shell/filesystem tools. Do not
call Cortex or AI Architect and do not score your answers.

Answer these probes, citing the exact MCP result that grounds each answer:
P1: What are the main entry points of this repo and what process does each start?
P2: Which module/file has the highest fan-in (most callers/importers), and who calls it?
P3: What does this repo's documentation say the project is for, and what are its top-level components?

Write JSON to `{{OUTPUT}}` with harness="A", target_repo, probes (id, question,
answer, grounding_artifacts, tool_calls_made, errors), and notes. Preserve
limitations and refusals verbatim. Reply only after writing the file.
