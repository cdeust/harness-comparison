# HC-AIASPEC-003 — Lossless claim verification coverage

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `lossless-claim-verification-coverage`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §6 and §7
- Sovereignty dimensions: 4, 5, 6

## Observed condition

Some generated claim identifiers restart within each document section, while
document extraction deduplicates by identifier and orchestration groups
verdicts by that same identifier. The extractor map omits planned sections
including overview, goals, and deployment. Evidence lookup requires exact
full-line equality even when extractors return a matched fragment, permitting a
fallback to adjacent context rather than the claim's source line.

## Falsifiable hypothesis

A complete PRD can lose one of two distinct claims that share a local
identifier, omit claims from unmapped sections, or attach evidence from the
wrong line while still producing a complete-looking verification summary.

## Why it matters

Verification coverage and evidence identity are the basis for critical
reasoning and decision provenance. First-wins loss or adjacent evidence can
inflate apparent coverage without a visible error.

## Non-claims

No generated PRD is declared incorrect without replay. This dossier does not
require that every sentence become a claim or prescribe a natural-language
claim ontology.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an external PRD corpus containing repeated local counters across
  sections, multiple claims on nearby lines, and claims in every planned
  document section. Independently annotate claim identity, section, source
  span, evidence, and whether extraction is expected.
- Run document claim extraction and verification through isolated Claude and
  Codex adapters under the same model, prompts, resources, and rubric.
- Compare output against the annotation ledger with an independent scorer,
  reporting extraction precision/recall, identity collisions, evidence-span
  accuracy, per-section counts, missingness, and verdict coverage.
- Preserve corpus seals, request/response envelopes, prompts, observations,
  scorer output, and hashes under `results/<protocol-id>/raw/`.
- Preregister repetitions and stop rule. A section with no extractor must be
  labeled unsupported/unverified rather than omitted from the denominator.

## Acceptance criteria

- Every extracted claim has a document-wide stable identity that includes
  source section/provenance; distinct claims survive identical local counters.
- Each planned section reports extracted and expected counts, including zero,
  and has a preregistered extractor or explicit `UNVERIFIED` status.
- Evidence contains the exact bounded source span for the annotated claim and
  never substitutes an adjacent claim line.
- Per-section and overall precision, recall, collision, evidence, missingness,
  and verdict metrics reproduce from the independent ledger on Claude and
  Codex; thresholds are preregistered from cited or published baselines.

## Regression obligation

Run the smallest baseline-reproducing collision, section-coverage, or
adjacent-line fixture after extractor, identifier, evidence, or orchestration
changes. A document schema or claim ontology change requires the full annotated
corpus.

## Evidence

- [Claim extraction and section registry](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/verification/src/claim-extractor.ts)
- [Claim grouping and verification orchestration](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/verification/src/orchestrator.ts)
- [Independent scoring rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a blinded annotated PRD corpus and versioned section schema.
Generative PRD quality and the choice of judge model are excluded from the
first extraction-integrity slice.

## Verdict ledger

- Pinned-source coverage observation: `proven`
- External annotated-corpus reproduction: `pending`
- Independent claim/evidence oracle: `pending`
- Cross-host regression: `pending`
