# HC-AIACB-001 — Semantically correct security gates

- Project: `cdeust/ai-architect-mcp-codebase`
- Category: `network-security`
- Subject: `security-gate-semantics`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `f6286875ac5fb37a3be52d5778fb2ce19655ff03`
- Research rule: RESEARCH-PROCESS.md §5b
- Sovereignty dimensions: 2, 6, 8

## Observed condition

At the pinned revision, S4 derives an unresolved-import count from every
`Import` node selected by qualified-name prefix. The resolver keeps resolved
imports in the graph and marks them with `is_resolved`. S1 uses name
substrings, S2 reports a skipped check because unsafe metadata is unavailable,
and S3 recognizes a Rust-specific public marker.

## Falsifiable hypothesis

On a graph containing resolved imports or non-Rust security-relevant symbols,
`check_security_gates` can report a false unresolved-import warning or omit a
material auth, unsafe, or public-surface change.

## Why it matters

A security gate that silently omits a supported language or raises critical
false positives cannot be used as an auditable allow/deny boundary. That
weakens isolation, failure transparency, and network/security sovereignty.

## Non-claims

This dossier does not claim that the current implementation permits an exploit,
that all five gates are incorrect, or that a passing internal unit test proves
cross-language security behavior. No target detection rate is asserted.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an independent multilingual repository fixture with resolved and
  unresolved imports plus auth, unsafe, public-API, and test-coverage changes.
- Build the pinned release in an isolated environment. Through separately
  configured Claude and Codex adapters, run `analyze_codebase` and then
  `check_security_gates` for each preregistered change set.
- Use a human-reviewed ledger of the expected gate, severity, and reason code
  as the oracle. The scorer must not inspect product output while creating it.
- Store request/response envelopes, graph export, allow/deny observations,
  process/network logs, environment manifest, and hashes under the run's
  `results/<protocol-id>/raw/` directory.
- Freeze repetitions and a stop rule before execution. Missing language
  coverage, missing logs, or an unavailable adapter leaves the verdict pending;
  an unbounded operation is not failed by an invented wall-clock threshold.

## Acceptance criteria

- Resolved-import fixtures produce an unresolved count of zero, while each
  unresolved fixture produces the exact ledger count and stable evidence.
- The Rust, TypeScript, Java, Kotlin, and Go fixtures each exercise the
  preregistered auth, unsafe, and public-surface cases; reported true positives,
  false positives, false negatives, skips, and unsupported cases match the
  independent ledger.
- Allowed cases succeed and denied cases fail closed on Claude and Codex with
  auditable, redacted logs and no write outside the disposable graph/output
  roots.
- The benchmark publishes per-gate outcomes and missingness. It does not hide a
  failed gate in a composite score or select a threshold after observing output.

## Regression obligation

Rerun the smallest baseline-reproducing language/gate fixture on every
security-gate or resolver change. A change to gate semantics, language
coverage, or the Claude/Codex surface requires the full preregistered security
matrix.

## Evidence

- [Security-gate implementation](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/security_gates/gates.rs)
- [Import-resolution state](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/resolver/imports.rs)
- [Published tool contract](https://github.com/cdeust/ai-architect-mcp-codebase/blob/f6286875ac5fb37a3be52d5778fb2ce19655ff03/src/tool_schemas.rs)
- [Capstone security protocol](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a frozen multilingual corpus, isolated host adapters, and an
independent expected-outcome ledger. Parser redesign, vulnerability discovery,
and write-capable remediation are excluded.

## Verdict ledger

- Pinned-source observation: `proven`
- External multilingual reproduction: `pending`
- Independent security oracle: `pending`
- Cross-host regression: `pending`
