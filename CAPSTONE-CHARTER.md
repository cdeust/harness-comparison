# Capstone charter — sovereign agent systems

## Research objective

Determine, with reproducible evidence, which architectural capabilities are
necessary for an autonomous agent system to be useful, critical, auditable,
locally controllable, and economically sovereign — then use the result to
advance `ai-architect.tools`.

The benchmark is therefore an instrument for discovering relevance. It must be
able to add or remove comparison projects when evidence changes; the corpus is
not a permanent popularity list.

## Three populations

### Internal product population

Cortex, cortex-viz, ai-architect-mcp-codebase, ai-architect-mcp-spec, and
zetetic-team-subagents. Measures product maturity and sovereignty. Results are
engineering truth for the author, not external generalization evidence.

### Independent capability population

Pinned open-source projects selected for a declared capability (memory,
orchestration, coding execution, durable control, observability, security,
FinOps, or evaluation). Depending on their predeclared class, they run either
as complete matched harness units or as subsystem references under identical
Claude/Codex adapters. The two classes are never pooled into one vendor score.

This population has two predeclared experimental-unit classes:

- **complete harness** — an autonomous agent runtime is run as its own unit
  against the same corpus, model/provider policy, resources and rubric;
- **portable harness layer or subsystem** — a component is installed through
  both Claude and Codex and compared only for the capability boundary it
  actually exposes.

A project may qualify for one class and fail the other. The protocol must not
require an autonomous harness to run *inside* Claude or Codex, and it must not
promote a portable component into a complete-harness claim.

### Frontier watch population

Emerging or trending projects (for example OpenViking or a precisely
identified Claudex repository, ECC, or DeepSeek Harness). They first pass a
reconnaissance card and a small reproducible pilot. Only projects that pass the
class-appropriate inclusion gate enter the independent capability population.

## Inclusion gate

For every candidate, first declare whether the proposed unit is a complete
harness, a portable layer/subsystem, or both. Then record:

- canonical repository, owner, license, release/SHA and activity evidence;
- supported operating systems and local/self-hosted installation;
- for a portable layer/subsystem: Claude integration and Codex integration,
  each reproduced locally;
- for a complete harness: a clean standalone launch and matched task execution
  under the same model/provider, corpus, resource and scoring policies;
- capability under test and explicit non-capabilities;
- data stores, network egress, credentials and telemetry behavior;
- workload limits, concurrency model, recovery behavior and cost surface;
- security posture, sandbox boundary and known failure modes;
- reproducibility command and artifact hash.

README claims are hypotheses. A candidate is `OBSERVED` only after a clean
class-appropriate handshake and `COMPARED` only after matched execution and
independent scoring. A project claiming both classes must pass both gates
separately.

## Sovereignty scorecard

Every internal and external run reports these dimensions separately:

1. state/data ownership and exportability;
2. process and tenant isolation;
3. local-service completeness and offline operation;
4. decision provenance and reversibility;
5. critical reasoning and contradiction handling;
6. failure transparency and recovery;
7. scalability and workload economics;
8. network security and secret boundaries;
9. model/provider replaceability;
10. human escalation and governance.

No dimension may be hidden by a composite average. A single overall maturity
band is allowed only as a labeled summary of the published dimension profile.

## Evolution loop

`reconnaissance → pilot → matched benchmark → independent review → issue →
implementation → regression benchmark → public release`.

The result of each cycle is one of: keep, promote, defer, or remove a
candidate, with reasons and evidence. Public issues are grouped by the
affected stack and capability, while `harness-comparison` publishes the
evidence and the decision history.

## Capstone deliverables

- preregistered corpus decision and candidate cards;
- conflict-free, version-pinned Claude and Codex host drivers for every
  portable-layer unit;
- a version-pinned standalone manifest for every complete-harness unit;
- raw benchmark artifacts and independent scoring;
- sovereignty scorecard for the internal product population;
- capability matrix against the independent population;
- frontier-watch decisions for emerging candidates;
- Public issue dossiers with external acceptance tests;
- public technical release and channel adapters linked to immutable evidence.
