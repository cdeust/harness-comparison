# HC-HARNESS-010 — Provenance, contradiction and temporal reasoning study

- Project: `cdeust/harness-comparison`
- Category: `provenance`
- Subject: `provenance-and-conflict-study`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `CAPSTONE-CHARTER.md` dimensions 4–5; `RESEARCH-PROCESS.md` §§2, 6
- Sovereignty dimensions: 4, 5, 6, 10

## Observed condition

The charter requires decision provenance and contradiction handling, and the
parity document identifies an external provenance/ontology candidate. No
inclusion card or matched current release establishes which capabilities are
present, absent or relevant to the sovereign-stack objective.

## Falsifiable hypothesis

Given conflicting, superseding and time-bounded evidence, at least one system
will return a conclusion without a complete source chain, fail to preserve the
conflict, or make reversal impossible.

## Why it matters

Critical reasoning requires more than retrieval: the system must expose why a
decision was made, what contradicted it and how human authority can reverse it.

## Non-claims

An external project's advertised features are hypotheses until its inclusion
gate and local pilot pass. Absence of a named tool is not proof that the AI
Architect complete stack lacks the capability.

## Reproduction protocol

First run the inclusion gate for current provenance/knowledge-graph candidates.
Then preregister fixtures containing source replacement, explicit contradiction,
entity ambiguity, temporal validity, deterministic rules and human reversal.
Use a source ledger as the external oracle.

## Acceptance criteria

- Candidate cards prove local installation and Claude/Codex integration at
  pinned SHAs before matched execution.
- Every conclusion can be traced to immutable source inputs and intermediate
  decisions; unresolved contradictions remain visible.
- Supersession preserves history, temporal queries respect fixture validity and
  a human reversal creates an auditable new decision rather than rewriting the
  old one.
- Unsupported capability is reported `UNAVAILABLE`; conceptual similarity is
  not counted as parity.
- Independent scoring publishes failures and uncertainty per fixture rather
  than collapsing them into an undocumented composite.

## Regression obligation

Rerun the affected fixture after a provenance or reasoning fix. Schema,
ontology, conflict policy or decision-state changes require the full study.

## Evidence

- [Sovereignty scorecard](../../../CAPSTONE-CHARTER.md)
- [Independent evaluation rule](../../../RESEARCH-PROCESS.md)
- [Current provenance parity declaration](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on HC-HARNESS-003, HC-HARNESS-005 and HC-HARNESS-006. This issue does
not require adopting any candidate implementation.

## Verdict ledger

- Study requirement: `proven`
- Candidate inclusion: `pending`
- Matched run and oracle: `pending`
- Regression: `pending`
