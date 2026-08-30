# HC-AIACB-006 — Measured cross-language resolution quality

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `cross-language-resolution-quality`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: CORPUS-DESIGN.md — Track R, independent research corpus
- Sovereignty dimensions: 3, 6, 9

## Observed condition

The parser registry covers more languages than the pinned LSP command layer.
The latter declares rust-analyzer, Pyright, and
typescript-language-server, so other parsed languages rely on the graph
resolver's non-LSP paths. No external, stratified edge-quality benchmark is
published at this revision.

## Falsifiable hypothesis

Resolution precision, recall, ambiguity, or latency differs materially by
language and resolver path, while a pooled success count hides unsupported or
lower-bound results.

## Why it matters

Resolved edges drive search, impact, security, and PRD grounding. Unmeasured
language asymmetry can turn broad parser support into an overstated local
code-intelligence capability.

## Non-claims

The non-LSP resolver is not assumed inaccurate, and no language is declared
unsupported solely from command registration. This dossier sets no post-hoc
quality threshold.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Select independent pinned projects stratified by language, repository shape,
  and size according to `CORPUS-DESIGN.md`. Freeze a ground-truth ledger for
  Calls, Imports, Implements, Extends, and Uses edges.
- Run the pinned binary in clean LSP-enabled and LSP-unavailable arms. Record
  resolver provenance, ambiguity, confidence, and missingness for every edge.
- Score precision, recall, F1, unresolved rate, ambiguity rate, and latency per
  language and resolver arm; report pooled values only beside strata.
- Execute through isolated Claude and Codex adapters with identical model,
  resources, corpus, prompts, and rubric. Preserve graphs, server logs,
  requests/responses, ledger, telemetry, and hashes under
  `results/<protocol-id>/raw/`.
- Preregister repetitions, any baseline-derived acceptance threshold, and the
  stop rule before inspecting results.

## Acceptance criteria

- Every advertised language receives an explicit LSP, fallback, unsupported, or
  unavailable classification in the output; missing strata cannot disappear
  from the denominator.
- Per-language precision, recall, F1, unresolved/ambiguity rates, and latency
  distributions reproduce from the independent ledger and immutable artifacts.
- LSP-unavailable behavior is deterministic and does not upgrade heuristic or
  lower-bound edges to exact.
- Claude and Codex results are equivalent under the same resolver arm; any
  statistically justified threshold is preregistered from cited research or a
  published baseline.

## Regression obligation

Run the smallest baseline-reproducing language/edge fixture after parser,
resolver, LSP, or graph schema changes. Changes to resolver selection or
advertised language support require the full stratified matrix.

## Evidence

- [LSP command registry](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/lsp_client/commands.rs)
- [Language parser registry](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/parser/spec/registry.rs)
- [Resolver phases](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/resolver/phases.rs)
- [Corpus design](../../../CORPUS-DESIGN.md)

## Dependencies and exclusions

Depends on independently reviewed edge ledgers and pinned language-server
versions. Adding a new language or choosing a resolution algorithm is excluded
until measurement identifies a scoped deficit.

## Verdict ledger

- Pinned-source coverage asymmetry: `proven`
- External stratified run: `pending`
- Independent edge oracle: `pending`
- Cross-host regression: `pending`
