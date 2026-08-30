# Corpus design for a research-grade harness comparison

## Decision

The primary benchmark corpus should not be composed of Cortex, cortex-viz,
`ai-architect-mcp-codebase`, `ai-architect-mcp-spec`, or
`zetetic-team-subagents`. Those repositories are the system author's own
products and are valuable dogfooding targets, but using them as the only corpus
creates construct and provenance risks: the tools may contain prior indexed
knowledge, repository-specific assumptions, and self-referential artifacts.

They remain a separate **internal validation track**.

## Two evaluation tracks

### Track R — independent research corpus (primary)

Use public, pinned, cross-platform open-source projects that neither harness
owns or has pre-indexed. Select a balanced panel before running:

- at least three languages with different resolvers (for example Python,
  TypeScript/JavaScript, and Rust/Go);
- at least one monorepo and one conventional single-package repository;
- at least one documentation-heavy project and one code-heavy project;
- at least one project with CLI/server entry points and one library;
- repositories with permissive licenses and reproducible builds;
- fixed size bands (small, medium, large) measured by file and LOC counts;
- no project whose maintainers are directly involved in the benchmark.

Freeze commit SHAs, license, language mix, file counts, LOC, test counts,
documentation volume, and build commands before any ingestion.

### Track I — internal dogfooding corpus (secondary)

Run the complete stack on the author's repositories to expose real product
failures and regressions. Label every result `INTERNAL`, keep it separate from
the primary statistical summary, and never use it to claim market superiority.

## Harness definition

The experimental unit is the full configured stack, not one MCP server.
Harness A and the AI Architect stack must each have:

- a version-pinned manifest;
- isolated config/cache/database/vault roots;
- equivalent model/provider and approval policy;
- explicit network and credential scopes;
- local-service inventory and health checks;
- reproducible install and teardown commands;
- workload, security, and failure-injection profiles.

If a capability has no counterpart, record `UNAVAILABLE` and measure the
consequence. Do not silently substitute a different tool and call it parity.

## Sampling and analysis

Choose the corpus and repetitions before observing answers. Stratify results by
language, project size, and repository shape. Report per-project values and
confidence intervals when the sample supports them. An internal track may
produce engineering findings but cannot increase the primary sample size.

## Acceptance gate

The corpus is publishable only when an independent reviewer can clone every
public repository at the recorded SHA, run both setup commands, reproduce the
health checks, and locate every raw result from the manifest. Any deviation
creates a new preregistered revision rather than an undocumented adjustment.

## Candidate open-source comparison panel

These are candidate benchmark applications/components, not replacements for
the two harnesses. Final inclusion requires the acceptance gate above and a
clean, pinned checkout.

| Project | Dimension exercised | Role |
|---|---|---|
| OpenHands | autonomous coding, long-horizon execution, sandboxing | primary coding-agent workload |
| LangGraph | durable state machines, checkpoints, multi-agent workflows | deterministic control-loop workload |
| AutoGen | multi-agent delegation and tool protocols | sensitivity comparison |
| Mem0 | long-term memory and retrieval | memory workload |
| Langfuse | traces, evaluation, cost and prompt observability | self-hosted observability workload |
| LiteLLM | provider gateway, routing, budgets and cost controls | portability/FinOps workload |
| Promptfoo | evaluation, red-team and prompt-injection testing | security/evaluation workload |

The first primary panel should select a balanced subset (OpenHands, LangGraph,
Mem0, Langfuse, LiteLLM, and Promptfoo) and keep AutoGen as a sensitivity
comparison. Run locally or self-hosted; SaaS-only features are excluded.

AI Architect repositories and internal product candidates remain internal and
ecosystem tracks, not substitutes for the independent corpus.
