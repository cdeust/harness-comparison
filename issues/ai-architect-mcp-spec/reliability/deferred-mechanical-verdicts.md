# HC-AIASPEC-008 — Honest deferred mechanical verdicts

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `deferred-mechanical-verdicts`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §6 and §7
- Sovereignty dimensions: 4, 5, 6

## Observed condition

The pinned mechanical-verdict path emits a `SPEC-COMPLETE` verdict at
confidence `1` while its rationale states that the actual checks are deferred.
The self-check synthesizes that verdict without executing the deferred rule.
Current tests assert this representation.

## Falsifiable hypothesis

A PRD with a deliberately failing mechanical condition can receive a
complete/high-confidence mechanical verdict and be counted as non-failing
because deferred work is not represented as unverified.

## Why it matters

Deferred is an epistemic state, not a pass. Treating it as verified inflates
quality and maturity measurements and allows the deterministic control loop to
advance without evidence.

## Non-claims

The dossier does not claim every mechanical rule must execute in-process or
that all deferred work must block the pipeline. The required decision policy
must be versioned and tested rather than inferred.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze external PRD fixtures with mechanically passing, failing, unavailable,
  and intentionally deferred checks; independently record expected execution
  status, verdict, and denominator membership.
- Execute the full self-check path through isolated Claude and Codex adapters,
  not the mechanical function alone.
- Audit which rule actually ran, its inputs/output, the aggregate decision, and
  report denominators. Score against the ledger independently.
- Preserve fixture seals, rule registry/version, action trace, verdicts,
  reports, scorer output, and hashes under `results/<protocol-id>/raw/`.
- Freeze repetitions and stop rule. A missing executor remains deferred or
  unavailable and cannot be relabeled after aggregate results are observed.

## Acceptance criteria

- Every mechanical claim names an executed versioned rule with evidence, or has
  an explicit `DEFERRED`/`UNAVAILABLE` state; neither state is counted as
  verified or non-failing.
- Deliberately failing fixtures produce the exact fail/block behavior in the
  preregistered policy, and passing fixtures become verified only after their
  rule executes.
- Reports publish separate verified, failed, deferred, unavailable, and
  missing denominators with claim-level provenance.
- The full self-check results and independent scorer agree on Claude and Codex
  from isolated state.

## Regression obligation

Run the smallest baseline-reproducing pass/fail/deferred/unavailable fixture
after mechanical rule, self-check, aggregation, or reporting changes. A verdict
vocabulary or policy change requires the full verification matrix.

## Evidence

- [Mechanical verdict implementation](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/verification/src/mechanical-verdict.ts)
- [Self-check verdict synthesis](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/handlers/self-check-verdicts.ts)
- [Independent evaluation and maturity rules](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a versioned mechanical-rule registry and independently labeled
fixtures. Implementing every possible build, security, or deployment check is
excluded.

## Verdict ledger

- Pinned-source deferred/pass observation: `proven`
- External full-pipeline reproduction: `pending`
- Independent mechanical oracle: `pending`
- Verdict-policy regression: `pending`
