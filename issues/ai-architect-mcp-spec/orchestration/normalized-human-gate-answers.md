# HC-AIASPEC-005 — Normalized human-gate answers

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `orchestration`
- Subject: `normalized-human-gate-answers`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: CAPSTONE-CHARTER.md — Sovereignty scorecard, dimension 10
- Sovereignty dimensions: 4, 10

## Observed condition

The clarification handler selects `freeform ?? selected[0]`, while the budget
handler selects `selected[0] ?? freeform`. Nullish coalescing preserves an empty
or whitespace-only free-form string, so equivalent human input envelopes can
drive different decisions at the two gates.

## Falsifiable hypothesis

For absent, empty, whitespace, free-form, selected, or mixed answers, the two
human gates can resolve equivalent intent differently or accept a non-answer
without an explicit clarification.

## Why it matters

Human escalation is an authority boundary. Input normalization must be
deterministic, observable, and provenance-preserving before the state machine
can safely resume autonomous work.

## Non-claims

This dossier does not prescribe UI wording, choose between free-form and
structured input globally, or claim that all nonempty answers are semantically
valid.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an input matrix covering absent, null, empty, whitespace-only,
  selected-only, free-form-only, matching mixed, conflicting mixed, and
  malformed answers for both gates.
- Independently define the normalized value, ambiguity/error outcome, next
  state, and transcript record for each row.
- Replay the same envelopes through isolated Claude and Codex adapters and both
  handlers; add property-based generation constrained by the versioned schema.
- Store input seed/matrix, requests/responses, state transitions, transcript,
  scorer output, and hashes under `results/<protocol-id>/raw/`.
- Freeze repetitions and stop rule. Ambiguity must stop for human resolution,
  not be assigned a winner after observing behavior.

## Acceptance criteria

- Both gates apply one versioned normalization function and produce the exact
  oracle result for every matrix row and generated invariant.
- Empty and whitespace-only values cannot override a valid structured answer or
  resume the workflow as a substantive answer.
- Conflicting or malformed mixed input returns a stable explicit
  error/clarification action; the raw human envelope and normalized decision
  remain in provenance.
- Results and state transitions are equivalent on Claude and Codex with
  isolated run state.

## Regression obligation

Run the smallest baseline-reproducing input-matrix fixture and its properties
after answer schema, gate handler, normalization, or state-transition changes.
A public envelope change requires the complete cross-host orchestration matrix.

## Evidence

- [Clarification handler](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/handlers/clarification.ts)
- [Budget handler](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/handlers/budget.ts)
- [Human-escalation sovereignty rule](../../../CAPSTONE-CHARTER.md)

## Dependencies and exclusions

Depends on a versioned answer schema and deterministic transition ledger.
Natural-language answer quality and UI presentation are excluded.

## Verdict ledger

- Pinned-source precedence mismatch: `proven`
- External matrix reproduction: `pending`
- Independent transition oracle: `pending`
- Cross-host regression: `pending`
