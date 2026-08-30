# HC-AIACB-003 — Complete Git-diff parsing

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `complete-git-diff-parsing`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: RESEARCH-PROCESS.md §5, §6 and §9
- Sovereignty dimensions: 4, 6

## Observed condition

The pinned unified-diff parser recognizes conventional `--- a/` and `+++ b/`
headers. Its tests cover ordinary modification, creation, deletion, and
multi-file input, but not Git-quoted paths, Unicode names, custom/no prefixes,
rename-only records, or binary changes. File state is reset only along the
recognized header path.

## Falsifiable hypothesis

A valid Git diff outside the conventional header subset can be attributed to
the wrong file, lose a changed path, or leak line ranges from one file into the
next in `detect_changes`.

## Why it matters

Incorrect change attribution corrupts impact analysis and decision provenance.
The failure is especially dangerous when output remains syntactically valid
and downstream review treats it as complete.

## Non-claims

The conventional diff path is not claimed broken. This dossier does not require
support for non-Git patch dialects and does not prescribe a parsing library.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Build a disposable external Git repository containing ordinary, Unicode, and
  whitespace-bearing paths. Generate, rather than hand-author, fixtures for
  add/delete, multi-file edits, rename-only, rename-with-edit, binary changes,
  quoted paths, and configured/no-prefix output.
- Run `detect_changes` once with raw diff input and once with pinned
  `base_ref`/`head_ref` through each host adapter.
- Use `git diff --name-status -z` plus parsed hunk headers from the same pinned
  Git executable as the independent path/range oracle.
- Store repository bundle, Git version/config, commands, raw patches, product
  envelopes, oracle output, and hashes under `results/<protocol-id>/raw/`.
- Freeze repetitions and stop rule before execution; unsupported syntax must
  be explicit and cannot be scored as an empty successful result.

## Acceptance criteria

- Every fixture returns exactly the oracle path set and change kind, with no
  line range assigned across a file boundary.
- Raw-input and ref-input modes agree for the same commit pair, including
  rename-only, binary, quoted Unicode, and configured-prefix cases.
- Unsupported patch records return a typed partial/unsupported status naming
  the record and preserving all supported results; they do not silently
  disappear.
- The separately isolated Claude and Codex runs produce equivalent
  machine-readable output and retain complete raw evidence for independent
  rescoring.

## Regression obligation

Run the smallest baseline-reproducing generated diff fixture after changes to
Git invocation, parsing, path normalization, or impact mapping. Any accepted
syntax or output-schema change requires the full change-analysis matrix.

## Evidence

- [Pinned Git-diff parser](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/git_diff.rs)
- [detect_changes handler](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/analyze_handlers.rs)
- [Tool contract](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/tool_schemas.rs)
- [Research execution contract](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a pinned Git executable and a content-addressed repository bundle.
Semantic rename detection beyond Git's reported result and arbitrary patch
formats are excluded.

## Verdict ledger

- Pinned-source observation: `proven`
- Generated-fixture reproduction: `pending`
- Independent Git oracle: `pending`
- Cross-host regression: `pending`
