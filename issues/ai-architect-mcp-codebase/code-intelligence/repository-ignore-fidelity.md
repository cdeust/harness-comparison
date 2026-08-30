# HC-AIACB-007 — Repository-ignore fidelity

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `repository-ignore-fidelity`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: CORPUS-DESIGN.md — Acceptance gate
- Sovereignty dimensions: 1, 2, 6, 8

## Observed condition

The pinned walker applies a built-in dependency-directory list and skips dot
directories. It exposes manual directory exclusions but does not implement
repository `.gitignore` semantics such as nested rules, negation, or escaped
patterns. Conventional names including `build`, `bin`, and `dist` are skipped
regardless of repository intent.

## Falsifiable hypothesis

For a valid repository with nested ignore rules or legitimate source under a
conventional generated-directory name, the indexed file set differs from the
repository's declared inclusion boundary without a complete diagnostic.

## Why it matters

Unexpected omission weakens retrieval and impact recall; unexpected inclusion
can ingest generated, secret, or out-of-scope data. Both affect corpus validity,
data isolation, failure transparency, and security.

## Non-claims

Git semantics are not assumed to be the only policy layer, and generated files
are not always undesirable. This dossier does not require indexing `.git`
metadata or ignored secrets.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Create a content-addressed external Git fixture with root and nested ignore
  files, negation, escaped characters, ignored generated data, legitimate
  source directories named `build`/`bin`/`dist`, dot directories, and symlinks
  that remain inside or escape the root.
- Freeze an expected set using the pinned Git executable and a reviewed policy
  ledger that distinguishes Git rules from explicit product exclusions.
- Run `index_codebase` through isolated Claude and Codex adapters with default
  policy and with every documented override. Export indexed, skipped, and
  refused paths.
- Preserve fixture bundle, Git output, policy/config, graph export,
  requests/responses, filesystem audit log, and hashes under
  `results/<protocol-id>/raw/`.
- Stop by the preregistered rule; unreadable, unsupported, and security-refused
  paths remain separate outcome classes.

## Acceptance criteria

- The indexed and excluded sets exactly match the independent policy ledger for
  nested rules, negation, escapes, legitimate conventional-name source, and
  explicit overrides.
- Every omission has a machine-readable reason and policy source; a missing file
  cannot be mistaken for proof that the file or symbol does not exist.
- Escaping symlinks are denied with an auditable reason, while permitted
  in-root behavior matches the preregistered policy.
- Claude and Codex produce equivalent path sets from isolated state, with no
  read or write outside the declared root.

## Regression obligation

Run the smallest baseline-reproducing path-policy fixture after walker, ignore,
symlink, exclusion, or manifest changes. A changed default corpus boundary
requires the full ingestion and security regression matrix.

## Evidence

- [Repository walker](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/indexer/walk.rs)
- [Indexer manifest](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/indexer/manifest.rs)
- [Corpus acceptance gate](../../../CORPUS-DESIGN.md)
- [Network and path security rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a pinned Git version and an independent policy ledger. Arbitrary
non-Git ignore languages and scanning ignored secrets for content are excluded.

## Verdict ledger

- Pinned-source policy observation: `proven`
- External path-fixture reproduction: `pending`
- Independent Git/policy oracle: `pending`
- Corpus-boundary regression: `pending`
