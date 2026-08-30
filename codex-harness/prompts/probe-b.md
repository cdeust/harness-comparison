You are executing the P1–P3 retrieval probes for Harness B.

Target repository: `{{REPO}}`.
Qualified AI Architect graph directory: `{{GRAPH_DIR}}`.

Use only the Harness B `ai-architect` and `cortex` MCP servers plus installed
Harness B plugins. Do not read the target repository with shell/filesystem
tools. Do not call Harness A tools and do not score your answers. Every AI
Architect graph call must explicitly use `{{GRAPH_DIR}}/graph`.

Answer these probes, citing the exact MCP result that grounds each answer:
P1: What are the main entry points of this repo and what process does each start?
P2: Which module/file has the highest fan-in (most callers/importers), and who calls it?
P3: What does this repo's documentation say the project is for, and what are its top-level components?

For Cortex results, preserve the memory/page source, domain, and date when
available. Explicitly reject prior benchmark answers, scores, or memories as
grounding for P1–P3; log any such contamination verbatim. Prefer the qualified
AI Architect graph for source structure and use Cortex only when the returned
artifact is demonstrably about the target repository.

Write JSON to `{{OUTPUT}}` with harness="B", target_repo, probes (id, question,
answer, grounding_artifacts, tool_calls_made, errors), and notes. Preserve
limitations and refusals verbatim. Reply only after writing the file.
