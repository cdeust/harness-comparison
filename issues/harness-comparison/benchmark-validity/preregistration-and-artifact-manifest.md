# HC-HARNESS-002 — Preregistration and artifact manifest

- Project: `cdeust/harness-comparison`
- Category: `benchmark-validity`
- Subject: `preregistration-and-artifact-manifest`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §§1, 3, 4, 8
- Sovereignty dimensions: 4, 6

## Observed condition

The research contract requires dated preregistration under `protocols/` and a
release containing an environment manifest, immutable raw data, analysis,
review and reproduction commands. The audited tree contains neither a protocol
schema nor an executable artifact-integrity gate for a new release.

## Falsifiable hypothesis

The repository cannot mechanically reject a result whose hypothesis was added
after execution, whose environment is incomplete, or whose raw artifact was
modified after scoring.

## Why it matters

Without a preregistration hash and a content-addressed manifest, the audit trail
cannot distinguish planned measurements from post-hoc choices.

## Non-claims

This does not invalidate the separately retained historical artifact. It does
not assert misconduct or modification of any prior data.

## Reproduction protocol

Construct three fixture releases: complete, missing environment fields and
raw-data hash mismatch. Run the proposed validator in a clean clone. Preserve
the fixture manifests, validator output and exit codes.

## Acceptance criteria

- A versioned schema covers research question, hypotheses, non-claims,
  populations, corpus SHAs, model/resource policy, metrics, repetitions, stop
  rule, scoring rubric and declared deviations.
- The execution manifest records repository dirty states, host/tool versions,
  credentials scope, stores, processes/ports and all artifact digests.
- Validation fails closed for a missing required field, changed protocol after
  first cell, unknown artifact, hash mismatch or mutable raw file.
- The complete fixture validates on a second clean clone with one documented
  command; both negative fixtures fail with stable machine-readable codes.

## Regression obligation

The validator's fixture suite is the smallest slice. Every future release must
pass it before Step 0 and again before publication.

## Evidence

- [`RESEARCH-PROCESS.md` preregistration requirement](../../../RESEARCH-PROCESS.md)
- [Audited repository tree](https://github.com/cdeust/harness-comparison/tree/3ab7c8d17044d8b3572fca2cfa705dcae182d16b)

## Dependencies and exclusions

No score aggregation or statistical threshold is defined here; those belong to
the preregistered study that consumes the schema.

## Verdict ledger

- Contract requirement: `proven`
- Executable gate absence: `proven`
- Negative-fixture reproduction: `pending`
- Regression: `pending`
