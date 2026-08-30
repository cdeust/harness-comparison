# HC-AIASPEC-004 — Correct cross-reference validation

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `cross-reference-validator-correctness`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §6
- Sovereignty dimensions: 4, 5, 6

## Observed condition

The pinned validator treats an identifier at the start of a line, table cell,
or heading as a definition. Its numbering-continuity check sorts numeric
matches without first deduplicating them and does not establish that a sequence
begins at its declared first identifier.

## Falsifiable hypothesis

Traceability references can be misclassified as definitions, duplicates can
create false numbering gaps, or a missing first requirement can pass without
being reported, corrupting benchmark KPI inputs.

## Why it matters

Traceability completeness is a measurement instrument. False positives or false
negatives in the validator invalidate coverage claims even when the PRD itself
is unchanged.

## Non-claims

The dossier does not assert a defect for every Markdown table or heading and
does not define universal requirement syntax. It tests the versioned PRD
grammar declared by this project.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an external Markdown fixture set containing real definitions,
  traceability-table references, duplicates, missing first identifiers,
  internal gaps, reordered sections, and valid complete sequences.
- Independently annotate each occurrence as definition/reference and record the
  expected duplicate/gap diagnostics.
- Run the public document validation path through isolated Claude and Codex
  adapters; compare results with a scorer that does not import validator code.
- Preserve fixtures, grammar version, product results, annotation/scorer
  ledgers, environment manifest, and hashes under
  `results/<protocol-id>/raw/`.
- Freeze the stop rule and any baseline-derived threshold before execution.
  Parser ambiguity is reported separately rather than resolved after output.

## Acceptance criteria

- Definitions and references exactly match the annotation ledger for every
  fixture; traceability-table references never satisfy a missing definition.
- Duplicate identifiers are reported as duplicates without manufacturing
  numbering gaps; a missing declared first identifier and every internal gap
  are detected exactly once.
- Valid complete fixtures produce no false diagnostic.
- The KPI report records validator version/hash and exact TP/FP/FN/missingness,
  reproducible on Claude and Codex by an independent scorer.

## Regression obligation

Run the smallest baseline-reproducing cross-reference fixture after Markdown
parsing, identifier grammar, continuity, or KPI changes. A requirement-ID
grammar change requires reannotation and full validation regression.

## Evidence

- [Cross-reference validator](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/validation/src/cross-ref-validator.ts)
- [Current validator tests](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/validation/src/__tests__/cross-ref-validator.test.ts)
- [Independent evaluation contract](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a versioned PRD grammar and blinded annotation ledger. Natural
language entailment between requirements is excluded.

## Verdict ledger

- Pinned-source validator observation: `proven`
- External fixture reproduction: `pending`
- Independent occurrence oracle: `pending`
- KPI regression: `pending`
