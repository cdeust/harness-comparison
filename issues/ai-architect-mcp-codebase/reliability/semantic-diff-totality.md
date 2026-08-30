# HC-AIACB-002 — Total and non-silent semantic diff

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `reliability`
- Subject: `semantic-diff-totality`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: RESEARCH-PROCESS.md §6 and §9
- Sovereignty dimensions: 4, 6

## Observed condition

The pinned `semantic_diff` implementation omits `Variant` from
`DIFFABLE_LABELS`. It iterates relation tables while assuming both endpoints
have a qualified name, and empty endpoints or query failures are skipped.
Dangling-edge analysis is therefore limited to the selected label set, while
the unresolved-import count does not filter on `is_resolved`.

## Falsifiable hypothesis

For graphs containing enum variants or relations whose endpoint is a file or
import, `verify_semantic_diff` can report a false dangling edge, omit a real
delta, or return a clean-looking result after silently skipping unsupported
data.

## Why it matters

Semantic verification is a decision-provenance boundary. Silent loss converts
an exact-looking verdict into an unknown lower bound without exposing that
uncertainty to the caller.

## Non-claims

No existing semantic-diff result is declared wrong without replay. The source
audit does not measure frequency, user impact, or performance, and internal
tests alone cannot establish totality over external graph shapes.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Create a pinned external fixture whose ground-truth graph includes enum
  variants, file/import endpoints, and every relation family advertised by the
  release contract.
- Produce an identical graph pair and preregister isolated single-node and
  single-edge mutations. Run `verify_semantic_diff` through Claude and Codex
  against clean graph copies.
- Generate the expected node, edge, dangling, and unresolved sets independently
  from the fixture source plus a frozen extractor; blind the scorer to product
  output.
- Preserve graph exports, exact requests/responses, stderr, environment
  manifest, oracle ledger, and hashes under `results/<protocol-id>/raw/`.
- Stop only according to the preregistered rule. A skipped table, unsupported
  endpoint, or missing artifact is recorded as missingness, never as equality.

## Acceptance criteria

- Identical graph pairs return no node/edge delta and no false dangling or
  unresolved-import finding for every preregistered label and relation.
- Each isolated mutation returns exactly the ledger delta, including enum
  variants and file/import endpoint relations.
- Unsupported schemas or query failures return an explicit typed
  unsupported/error result naming the affected relation; they are never
  omitted from the denominator.
- Claude and Codex produce equivalent semantic results from isolated state, and
  an independent scorer reproduces the counts from the immutable artifacts.

## Regression obligation

Run the smallest baseline-reproducing label/relation fixture after changes to
graph schema, persistence, resolution, or semantic diff. A schema or protocol
change requires the complete semantic-diff matrix and whole-stack regression.

## Evidence

- [Semantic-diff implementation](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/semantic_diff.rs)
- [Graph schema](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/graph_store/schema.rs)
- [Tool surface](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/tool_schemas.rs)
- [Independent evaluation rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a versioned graph-schema manifest and an independently generated
ground-truth ledger. Redefining semantic equivalence across refactors is
excluded; the first slice tests exact graph equality and declared mutations.

## Verdict ledger

- Pinned-source observation: `proven`
- External graph-pair reproduction: `pending`
- Independent delta oracle: `pending`
- Regression benchmark: `pending`
