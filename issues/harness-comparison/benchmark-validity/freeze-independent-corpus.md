# HC-HARNESS-006 — Freeze the independent corpus and candidate panel

- Project: `cdeust/harness-comparison`
- Category: `benchmark-validity`
- Subject: `freeze-independent-corpus`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `CORPUS-DESIGN.md` Track R and acceptance gate; `CAPSTONE-CHARTER.md` inclusion gate
- Sovereignty dimensions: 3, 7, 8, 9

## Observed condition

The research contract defines selection constraints and a candidate panel, but
no dated Track R preregistration freezes the final repositories, component
candidates, revisions or measured corpus characteristics.

## Falsifiable hypothesis

The current candidate list cannot yet be reproduced as an eligible, balanced
cross-platform corpus with working Claude and Codex adapters.

## Why it matters

Selecting projects after seeing answers would bias the comparison, while using
only the author's repositories would not support an external generalization.

## Non-claims

Candidate mention is not endorsement, maturity proof or inclusion. Popularity
and README claims do not pass the inclusion gate.

## Reproduction protocol

For every candidate, verify the canonical public repository and license, pin a
full SHA, clone on the declared platforms, execute the documented local setup,
and handshake the selected capability separately through Claude and Codex.
Measure the corpus characteristics before any harness ingestion.

## Acceptance criteria

- The corpus includes the language, repository-shape, documentation/code,
  entry-point/library and size strata required by `CORPUS-DESIGN.md`.
- Every repository card records SHA, license, language mix, tracked file and LOC
  counts, tests, documentation volume and reproducible build command.
- Every component candidate card records local/self-hosted setup, data stores,
  egress, credentials, workload limits, recovery, cost and security boundaries.
- Claude and Codex each complete a clean capability handshake; failures remain
  explicit and exclude the candidate from `COMPARED` status.
- The final selection, exclusions and hashes are committed before ingestion.

## Regression obligation

Re-run inclusion handshakes when a candidate revision changes. Any corpus
membership change creates a new preregistered revision and invalidates pooled
comparison with the prior panel.

## Evidence

- [Corpus design and acceptance gate](../../../CORPUS-DESIGN.md)
- [Candidate inclusion gate](../../../CAPSTONE-CHARTER.md)
- [Current candidate tracks](../../../BENCHMARK-TRACKS.md)

## Dependencies and exclusions

Depends on HC-HARNESS-002. The internal AI Architect repositories remain Track
I and cannot satisfy Track R sample requirements.

## Verdict ledger

- Selection rules: `proven`
- Frozen corpus: `pending`
- Cross-host handshakes: `pending`
- Regression: `pending`
