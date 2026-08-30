# HC-AIASPEC-006 — Provenance-preserving PRD revision

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `provenance`
- Subject: `provenance-preserving-prd-revision`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P2`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: CAPSTONE-CHARTER.md — Evolution loop
- Sovereignty dimensions: 1, 4, 6

## Observed condition

The pinned `start_pipeline` contract accepts a feature description, codebase
path, and preflight option. It exposes no versioned input for an existing PRD,
scoped revision request, dependency-aware partial regeneration, artifact diff,
or rollback.

## Falsifiable hypothesis

Revising one requirement in an existing PRD requires a new generation run that
cannot prove which unaffected artifacts remained stable or reconstruct the
decision lineage and rollback state.

## Why it matters

Autonomous engineering is iterative. Without revision provenance, a small human
decision can cause opaque document drift and make review, reversibility, and
cost attribution unreliable.

## Non-claims

This dossier does not require in-place editing, prescribe a storage backend, or
assume partial regeneration is always cheaper or better. Full regeneration
remains a valid explicit strategy if its diff and provenance are complete.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an externally reviewed complete PRD artifact set, a scoped change
  request, expected dependency closure, stable identifiers, and allowed output
  deltas.
- Through isolated Claude and Codex adapters, submit the existing artifact set
  and revision request, then validate, diff, roll back, and replay the revision.
- Use content hashes plus the reviewed dependency/delta ledger as the oracle;
  score unchanged artifacts, expected changes, unexpected changes, identifier
  stability, provenance completeness, and rollback equality.
- Execute concurrent revisions from the same base to test isolation. Preserve
  inputs, prompts, actions, diffs, hashes, validations, and lineage under
  `results/<protocol-id>/raw/`.
- Freeze model/provider, resources, repetitions, and stop rule before running.
  An unavailable revision surface is recorded as a measured capability gap.

## Acceptance criteria

- A scoped revision accepts a pinned base artifact set and records base
  revision, human request, generated actions, model/tool revisions, and output
  hashes.
- Only artifacts in the independently reviewed dependency closure change;
  every artifact outside it remains byte-identical, or a declared full
  regeneration reports and justifies every delta.
- Stable identifiers are preserved where semantics are unchanged. Diff and
  rollback reconstruct the exact pre-revision artifact set.
- Concurrent revisions remain isolated and the same revision protocol passes
  on Claude and Codex; validation and benchmark artifacts remain reproducible.

## Regression obligation

Run the smallest baseline-reproducing scoped-change/diff/rollback fixture after
artifact schema, generation, dependency, identifier, or storage changes. A
revision-protocol change requires the full artifact, concurrency, and
cross-host matrix.

## Evidence

- [Pipeline MCP surface](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/mcp-server/src/pipeline-tools.ts)
- [Pipeline state actions](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/types/actions.ts)
- [Capstone evolution and provenance contract](../../../CAPSTONE-CHARTER.md)

## Dependencies and exclusions

Depends on versioned artifact/dependency schemas and an independent expected
delta ledger. Collaborative text editing and branch-merge conflict resolution
are excluded from the first revision slice.

## Verdict ledger

- Pinned-source surface observation: `proven`
- External revision reproduction: `pending`
- Independent hash/delta oracle: `pending`
- Rollback and cross-host regression: `pending`
