# HC-AIACB-005 — Position navigation and safe rename

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `code-intelligence`
- Subject: `position-navigation-safe-rename`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: WHOLE-STACK-PARITY.md — Operational parity gates
- Sovereignty dimensions: 3, 6, 9

## Observed condition

The public MCP schemas identify symbols by qualified name. The pinned release
contains internal LSP definition-by-position support, but no public
file/line/column definition-or-reference request and no safe rename surface.

## Falsifiable hypothesis

On a pinned multilingual navigation corpus, the AI Architect stack cannot
complete the same position-based definition, reference, and safe-rename tasks
on both Claude and Codex without untracked host-side substitution.

## Why it matters

Position navigation and refactoring are core code-agent capabilities. An
implicit external editor dependency weakens local-service completeness,
provider portability, parity measurement, and the audit trail for writes.

## Non-claims

This dossier does not require the graph-intelligence server itself to become
write-capable. A versioned, local host adapter may satisfy the stack-level
surface. It does not claim that qualified-name lookup is incorrect.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an independent multilingual corpus with a human-reviewed ledger of
  definition targets, references, ambiguous positions, and rename edit sets.
- Install only the version-pinned AI Architect stack and declared language
  servers in isolated Claude and Codex environments. Record which component
  owns each request and every executable SHA.
- Invoke the declared file/line/column navigation calls. For rename, request a
  dry-run, compare edits to the ledger, then apply them only in a disposable
  worktree and execute the corpus's pinned build/test commands.
- Audit filesystem writes, symlink/path containment, process/network activity,
  and tool envelopes. Store all artifacts under
  `results/<protocol-id>/raw/`.
- Preregister repetitions and stop conditions. An absent surface is recorded as
  `UNAVAILABLE` and its task consequence is measured, not replaced silently.

## Acceptance criteria

- Definition and reference results exactly match the independent ledger for
  every declared language, including ambiguous and unresolved positions.
- Rename dry-run returns the exact bounded edit set and provenance. Applying it
  in the disposable worktree changes no path outside the declared root, follows
  no escaping symlink, and leaves the pinned build/tests passing.
- The identical user-visible surface passes independently on Claude and Codex;
  the manifest states whether the MCP server or a local adapter owns it.
- Missing language-server support, partial results, refusals, and all writes are
  explicit in raw evidence and scoring.

## Regression obligation

Run the smallest baseline-reproducing navigation/rename fixture for the
affected language after tool-schema, resolver, adapter, or LSP changes. A
changed write boundary or host surface requires the complete cross-host
security and navigation matrix.

## Evidence

- [Public tool schemas](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/tool_schemas.rs)
- [Internal LSP client](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/lsp_client.rs)
- [Whole-stack parity rule](../../../WHOLE-STACK-PARITY.md)
- [Independent corpus rule](../../../CORPUS-DESIGN.md)

## Dependencies and exclusions

Depends on pinned local language servers and a disposable worktree. Formatting,
semantic code transformation beyond symbol rename, and editor-specific UX are
excluded.

## Verdict ledger

- Public-surface source audit: `proven`
- Cross-host task reproduction: `pending`
- Independent navigation/edit oracle: `pending`
- Safe-write regression: `pending`
