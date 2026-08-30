# HC-AIASPEC-002 — Unified oracle and judge truth semantics

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `oracle-judge-truth-semantics`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §6
- Sovereignty dimensions: 4, 5, 6

## Observed condition

The calibration type contract defines
`oracle_resolved_truth=true` as the claim holding. The pinned reliability
comparison counts the judge as correct when its verdict differs from the
effective truth. A repository test asserts that inverted interpretation.

## Falsifiable hypothesis

For oracle-resolved claims, reliability summaries can invert correct and
incorrect judgments, producing calibration deltas that are internally
consistent but semantically wrong.

## Why it matters

Calibration controls which verifier receives trust. An inverted truth mapping
corrupts maturity measurement, critical reasoning, and the provenance of every
downstream reliability claim.

## Non-claims

This source contradiction does not quantify how many historical observations
were affected. The intended boolean convention must be confirmed from a frozen
external ledger; this dossier does not select a migration policy.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Create a content-addressed calibration corpus containing every
  judge-verdict/oracle-truth combination plus explicitly unresolved oracle
  cases. Freeze expected correctness, inclusion, and reason codes.
- Execute the published calibration comparison through isolated Claude and
  Codex adapters with the same model/provider policy and sealed observation
  input.
- Have an independent scorer compute confusion counts and deltas directly from
  the ledger without importing product comparison code.
- Preserve input seals, schema versions, product output, scorer output,
  environment manifest, and hashes under `results/<protocol-id>/raw/`.
- Freeze repetitions and stop rule. Schema ambiguity or incompatible
  historical data must fail explicitly and cannot be coerced after results are
  observed.

## Acceptance criteria

- Every truth-table row receives the exact preregistered correctness and
  inclusion outcome, including unresolved-oracle cases.
- One versioned truth convention is used consistently in schema,
  serialization, comparison, logs, and documentation.
- Existing observations with incompatible semantics are migrated with
  provenance or rejected with a stable error; they are never silently mixed.
- Independent scorer counts and deltas match product output exactly on Claude
  and Codex, with raw per-observation results retained.

## Regression obligation

Run the smallest baseline-reproducing sealed truth-table fixture after
calibration schema, observation mapping, comparison, or migration changes. A
convention/schema change requires requalification of the complete calibration
corpus.

## Evidence

- [Oracle truth contract](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/benchmark/calibration/oracle-types.ts)
- [Reliability comparison](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/benchmark/calibration/ablation-comparison.ts)
- [Current encoded expectation](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/benchmark/calibration/__tests__/ablation-comparison.test.ts)
- [Independent evaluation rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a sealed external truth ledger and versioned observation schema.
Choosing judge prompts/models and estimating production prevalence are
excluded.

## Verdict ledger

- Pinned-source semantic contradiction: `proven`
- External truth-table reproduction: `pending`
- Independent calibration oracle: `pending`
- Historical-data regression: `pending`
