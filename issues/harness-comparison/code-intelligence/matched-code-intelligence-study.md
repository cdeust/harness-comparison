# HC-HARNESS-007 — Matched code-intelligence study

- Project: `cdeust/harness-comparison`
- Category: `code-intelligence`
- Subject: `matched-code-intelligence-study`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §§2–7; `CORPUS-DESIGN.md` Track R
- Sovereignty dimensions: 3, 4, 6, 7, 9

## Observed condition

The repository declares code graph/navigation as a matched capability and has
entry-point, fan-in and documentation probe templates. It has no publishable
Track R release comparing the selected current implementations on the frozen
independent corpus.

## Falsifiable hypothesis

The AI Architect stack differs materially from selected mature references in
correctness, freshness, provenance, failure transparency or operational cost on
at least one preregistered code-intelligence task stratum.

## Why it matters

Code intelligence grounds autonomous edits. Silent omissions or stale graph
answers can propagate incorrect impact and implementation decisions.

## Non-claims

No fixed product roster or superiority target is assumed. Component candidates
must first pass HC-HARNESS-006, and a subsystem result is not a complete-harness
winner.

## Reproduction protocol

Freeze task semantics and ground truth for entry points, symbol retrieval,
production-only fan-in, imports/calls, impact, documentation evidence and index
freshness across every Track R stratum. Run matched ingestion and fresh query
processes with identical model/resource policy. An independent scorer verifies
answers against the pinned source.

## Acceptance criteria

- Questions define node/edge granularity, exclusions and completeness before
  answers are observed.
- Each implementation receives the same repositories, prompts, model policy,
  resource policy and cache state.
- Reports include correctness class, evidence path/revision, omissions,
  ingestion time/resources, query latency, failures, retries and artifact hashes.
- A source change triggers a measured freshness probe; stale answers are neither
  silently accepted nor scored as current.
- Independent scoring and contamination gates pass for every published answer;
  losses and unavailable capabilities remain visible.

## Regression obligation

Rerun the affected task stratum after a product fix. Changes to corpus, task
semantics, adapters or graph granularity require the full matched study.

## Evidence

- [Experimental-unit rules](../../../RESEARCH-PROCESS.md)
- [Independent corpus rules](../../../CORPUS-DESIGN.md)
- [Declared code-intelligence parity surface](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on HC-HARNESS-001, HC-HARNESS-002, HC-HARNESS-003 and HC-HARNESS-006.
Automated refactoring is included only if the preregistered scope selects it.

## Verdict ledger

- Study requirement: `proven`
- Eligible comparison panel: `pending`
- Matched run and oracle: `pending`
- Regression: `pending`
