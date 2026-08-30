# HC-HARNESS-003 — Independent scoring and contamination control

- Project: `cdeust/harness-comparison`
- Category: `benchmark-validity`
- Subject: `independent-scoring-and-contamination`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §6; `BENCHMARK-PROCESS.md` steps 5–6
- Sovereignty dimensions: 4, 5, 6

## Observed condition

The operational contract requires an independent scorer, frozen ground truth,
four explicit outcome classes and a contamination sweep. The audited tree has
probe production code but no versioned ground-truth schema, scorer or
contamination command for a new release.

## Falsifiable hypothesis

A probe answer can currently reach a publishable directory without an external
oracle proving its score and without a machine-readable contamination verdict.

## Why it matters

Self-scoring and prior-memory leakage would turn retrieval confidence into the
measurement instead of correctness against the pinned source.

## Non-claims

This does not assign a score to either harness and does not reuse any historical
score as ground truth.

## Reproduction protocol

Use a frozen public fixture with answers covering `correct`, `partial`, `wrong`
and `no-answer`, plus one deliberately contaminated response. Run scoring in a
fresh process that receives only the frozen source, rubric and candidate
answer. Hash all inputs and outputs.

## Acceptance criteria

- Ground truth pins repository SHA, question semantics, exclusions and oracle
  evidence before probe execution.
- The scorer has no access to the probed session or its mutable stores and emits
  one of the four preregistered classes plus cited evidence.
- A second independent scorer can reproduce every deterministic classification;
  disagreements remain explicit and are never averaged away.
- The contamination fixture is rejected, with the matched prior material and
  decision recorded without exposing private data.
- Publication validation fails if a probe lacks a score, oracle reference,
  scorer identity or contamination verdict.

## Regression obligation

Run the four-class and contamination fixtures on every scorer change. Run the
full scoring matrix whenever questions, exclusions or rubric change.

## Evidence

- [Independent evaluation rule](../../../RESEARCH-PROCESS.md)
- [Operational scoring and contamination rules](../../../BENCHMARK-PROCESS.md)
- [Probe runner at the audited revision](https://github.com/cdeust/harness-comparison/blob/3ab7c8d17044d8b3572fca2cfa705dcae182d16b/codex-harness/run-probes-sequential.mjs)

## Dependencies and exclusions

Depends on HC-HARNESS-002 for immutable manifests. Statistical inference and
product scoring remain study-specific.

## Verdict ledger

- Contract requirement: `proven`
- Executable scorer absence: `proven`
- External-oracle fixture: `pending`
- Regression: `pending`
