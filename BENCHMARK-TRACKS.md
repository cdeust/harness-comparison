# Benchmark tracks

The benchmark has two separate scientific populations. Mixing them would
confuse product maturity with generalization.

## Track R — independent open-source corpus

This is the primary comparison used for claims about general capability. The
corpus is selected and frozen before runs from public, cross-platform,
permissively licensed projects. Candidates are evaluated by capability, not as
complete harness replacements:

| Capability | Candidate references |
|---|---|
| Agent runtime/orchestration | [LangGraph](https://github.com/langchain-ai/langgraph), [CrewAI](https://github.com/crewAIInc/crewAI), [AutoGen](https://github.com/microsoft/autogen) |
| Coding agent/sandbox | [OpenHands](https://github.com/OpenHands/OpenHands) |
| Persistent memory | [Mem0](https://github.com/mem0ai/mem0), [Letta](https://github.com/letta-ai/letta), [Graphiti](https://github.com/getzep/graphiti) |
| Durable control plane | [Temporal](https://github.com/temporalio/temporal) |
| Observability/evaluation | [Langfuse](https://github.com/langfuse/langfuse), [Opik](https://github.com/comet-ml/opik), [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) |
| Gateway/FinOps | [LiteLLM](https://github.com/BerriAI/litellm) |
| Security/evaluation | [Promptfoo](https://github.com/promptfoo/promptfoo), [Guardrails AI](https://github.com/guardrails-ai/guardrails) |

The initial capstone panel should remain small and balanced: OpenHands,
LangGraph, Mem0 or Graphiti, Langfuse or Opik, LiteLLM, and Promptfoo.
AutoGen/CrewAI/Letta/Temporal/Guardrails are sensitivity or subsystem tracks.
Every integration must be reproduced on both Claude and Codex; documentation
alone does not establish compatibility.

## Track I — AI Architect internal corpus

This is mandatory for product maturity and sovereignty, but excluded from the
primary external generalization claim. It includes Cortex, cortex-viz,
ai-architect-mcp-codebase, ai-architect-mcp-spec, and
zetetic-team-subagents. Results are labelled `INTERNAL` and feed product
issues, regression tests, and roadmap decisions.

## Required metrics for both tracks

Functional validity, decision provenance, data sovereignty, isolation,
local-service coverage, workload scalability, network security, cost control,
failure transparency, replaceability, and human-escalation correctness.
