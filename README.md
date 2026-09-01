# Harness Comparison

Public research workspace for building and measuring sovereign agent systems.

This repository compares complete harness stacks with reproducible evidence,
published losses, silent-failure hunts, and explicit limits. The objective is
to measure how much of an autonomous, critical, auditable operating system
remains to be built.

## Comparison scope

There is no fixed two-stack taxonomy in the public summary. Each release
selects the most appropriate and mature cross-platform open-source solutions
for the capability under test, then compares them under the same corpus,
model, resources, and metrics.

The AI Architect corpus (Cortex, cortex-viz, ai-architect-mcp-codebase,
ai-architect-mcp-spec, and zetetic-team-subagents) is evaluated as one complete
solution when product maturity and sovereignty are the subject. Its internal
components are never counted as separate competing products. External
solutions are selected through the inclusion gate in [CAPSTONE-CHARTER.md](CAPSTONE-CHARTER.md)
and may change as the ecosystem evolves.

## What is being measured

This is a capstone research project, not a static product shootout. It runs
three complementary populations:

1. **Internal product maturity** — the complete AI Architect corpus, used to
   expose gaps and drive engineering issues.
2. **Independent capability comparison** — pinned public open-source projects,
   stratified as complete harnesses or portable capability references and
   evaluated through the class-appropriate gate.
3. **Frontier watch** — emerging projects such as OpenViking, ECC, DeepSeek
   Harness, or a precisely identified Claudex repository; candidates enter the
   primary panel only after a clean pilot and reproducibility review.

The benchmark is valid only when it records the full environment, uses the
same workload and model policy, isolates mutable state, scores independently,
and publishes failures as well as successes.

## Research contract

- [RESEARCH-PROCESS.md](RESEARCH-PROCESS.md) — capstone/research-lab gates.
- [BENCHMARK-PROCESS.md](BENCHMARK-PROCESS.md) — operational benchmark steps.
- [WHOLE-STACK-PARITY.md](WHOLE-STACK-PARITY.md) — parity and conflict-free setup.
- [CORPUS-DESIGN.md](CORPUS-DESIGN.md) — independent open-source corpus versus internal dogfooding track.
- [BENCHMARK-TRACKS.md](BENCHMARK-TRACKS.md) — external comparison panel and AI Architect internal maturity track.
- [issues/](issues/) — canonical public issue registry organized by stack, category, and subject.
- [COMMUNICATION-FRAMEWORK.md](COMMUNICATION-FRAMEWORK.md) — one evidence-backed release adapted across channels.
- [CAPSTONE-CHARTER.md](CAPSTONE-CHARTER.md) — research objective, three populations, inclusion gate, and sovereignty scorecard.
- [candidates/](candidates/) — pinned reconnaissance cards and promotion decisions for frontier projects.
- [protocols/](protocols/) — dated preregistrations validated against the
  machine-checked contracts in [schemas/](schemas/).
- [scripts/](scripts/) — fail-closed protocol, execution and release gates.
- [claude-harness/](claude-harness/) and [codex-harness/](codex-harness/) — isolated configurations and runners.

## Public artifact

The only retained historical artifact is the benchmark cited by
[claude-mem PR #3693](https://github.com/thedotmack/claude-mem/pull/3693),
with provenance in [artifacts/](artifacts/). New runs are published only after
the research gates pass and receive a dated release identifier.

## Sovereignty dimensions

Every release scores ten dimensions separately: state/data ownership,
process isolation, local-service completeness, decision provenance, critical
reasoning, failure recovery, scalability/economics, network security,
provider replaceability, and human escalation. No hidden composite score may
mask a zero or an unavailable capability.

## Evolution loop

`reconnaissance → pilot → matched benchmark → independent review → issue →
implementation → regression benchmark → public release`

Each issue is linked to its evidence and acceptance test. The canonical public
issue workflow is this repository's `issues/` registry.

## License

MIT — see [LICENSE](LICENSE).
