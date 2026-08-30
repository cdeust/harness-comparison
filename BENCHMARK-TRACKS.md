# Benchmark tracks

The benchmark has two separate scientific populations. Mixing them would
confuse product maturity with generalization.

## Track R — independent open-source comparison

This is the primary comparison used for claims about general capability. The
task corpus is selected and frozen before runs from public, cross-platform,
permissively licensed projects. Experimental units are stratified before any
results are observed.

### R-H — complete harness candidates

An autonomous harness is compared as its own unit under a matched model/provider
policy, corpus, resource envelope and scoring rubric. It is not required to run
inside Claude or Codex. Candidate references include
[OpenHands](https://github.com/OpenHands/OpenHands),
[ECC](https://github.com/affaan-m/ECC) and
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness); none enters
the scored panel until its candidate card and inclusion pilot pass. ECC's class
remains a pilot question because it may be better scoped as a portable harness
layer than as a complete harness.

### R-C — portable layers and capability references

These candidates are evaluated only for a declared capability and must pass
separate Claude and Codex adapter handshakes:

| Capability | Candidate references |
|---|---|
| Agent runtime/orchestration | [LangGraph](https://github.com/langchain-ai/langgraph), [CrewAI](https://github.com/crewAIInc/crewAI), [AutoGen](https://github.com/microsoft/autogen) |
| Persistent memory | [Mem0](https://github.com/mem0ai/mem0), [Letta](https://github.com/letta-ai/letta), [Graphiti](https://github.com/getzep/graphiti) |
| Durable control plane | [Temporal](https://github.com/temporalio/temporal) |
| Observability/evaluation | [Langfuse](https://github.com/langfuse/langfuse), [Opik](https://github.com/comet-ml/opik), [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) |
| Gateway/FinOps | [LiteLLM](https://github.com/BerriAI/litellm) |
| Security/evaluation | [Promptfoo](https://github.com/promptfoo/promptfoo), [Guardrails AI](https://github.com/guardrails-ai/guardrails) |

The initial R-C panel should remain small and balanced: LangGraph, Mem0 or
Graphiti, Langfuse or Opik, LiteLLM, and Promptfoo. AutoGen and CrewAI require a
class decision before use because a protocol may treat them as a runtime unit
or as an orchestration subsystem. Letta/Temporal/Guardrails are sensitivity or
subsystem tracks. Every R-C integration must be reproduced on both Claude and
Codex; documentation alone does not establish compatibility.

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
