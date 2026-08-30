# HC-CORTEX-001 — Prospective memory end-to-end

- Project: `cdeust/Cortex`
- Category: `orchestration`
- Subject: `prospective-memory-end-to-end`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6, 9; `CAPSTONE-CHARTER.md` evolution loop
- Sovereignty dimensions: 3, 6, 10

## Observed condition

The public creation schema accepts `keyword`, `time`, `file` and `domain`,
while the evaluator recognizes `keyword_match`, `time_based`,
`directory_match` and `entity_match`. Time matching is only performed when a
caller happens to invoke the evaluator; no independent scheduler is shipped.

## Falsifiable hypothesis

A trigger created through the public MCP surface either cannot match the
runtime evaluator or cannot be delivered when its due time passes without an
active host session.

## Why it matters

An autonomous control loop cannot rely on future intentions whose creation,
evaluation and delivery contracts are disconnected or opportunistic.

## Non-claims

This does not claim that extracted internal `*_match` triggers never work. It
does not select a scheduler implementation or invent a delivery-latency target.

## Reproduction protocol

In isolated SQLite and PostgreSQL stores, create one matching and one
non-matching trigger for every documented type through the MCP adapter. Freeze
the clock for temporal cases, terminate both hosts, advance through the due
time, restart, and inspect durable delivery receipts. Run the same cell
separately through Claude and Codex. From the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
and the matching `claude-harness` command. An independent clock/database
oracle reconciles trigger eligibility, delivery identity and receipts. Preserve
tool traffic, clock controls and database snapshots
under `artifacts/<release>/issues/HC-CORTEX-001/raw/`. Stop after the
preregistered repetitions or the first fixture-integrity failure.

## Acceptance criteria

- One canonical versioned enum is used by creation, persistence, evaluation,
  documentation and both host adapters.
- Every matching fixture fires exactly once and every non-matching fixture
  remains silent, as verified from durable receipts by an independent scorer.
- A temporal trigger survives host shutdown, fires or performs the declared
  bounded catch-up after restart, and records timezone and DST interpretation.
- Claude and Codex produce the same observable outcome from isolated state.
- Delivery failure is explicit and recoverable; it is never represented as a
  successful trigger.

## Regression obligation

Run the complete prospective-trigger fixture on both backends and both hosts.
Changes to the scheduler or public enum require the full orchestration and
cross-host regression matrix.

## Evidence

- [Public trigger schema and persistence](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/create_trigger.py)
- [Evaluator vocabulary and temporal matcher](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/core/prospective.py)
- [Current scheduled groomer template](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/scripts/com.cortex.scheduled-groomer.plist)

## Dependencies and exclusions

Depends on the protocol-driven runner and immutable manifest. Calendar UX,
remote notification providers and multi-machine synchronization are excluded.

## Verdict ledger

- Source vocabulary mismatch: `proven`
- Independent scheduler absence: `proven`
- Cross-host runtime reproduction: `pending`
- Regression: `pending`
