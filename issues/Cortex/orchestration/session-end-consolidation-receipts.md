# HC-CORTEX-004 — Observable SessionEnd consolidation

- Project: `cdeust/Cortex`
- Category: `orchestration`
- Subject: `session-end-consolidation-receipts`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 3, 6, 10

## Observed condition

The SessionEnd hook selects consolidation depth from
`event.get("turn_count", 0)`. The current Claude hook contract supplies a
transcript path and reason, not `turn_count`; the plugin path therefore has no
documented input capable of selecting standard or full mode.

## Falsifiable hypothesis

Real medium and long sessions follow the light branch, or the consolidation
work is terminated before completion without a durable failure receipt.

## Why it matters

Lifecycle automation is only autonomous when its decision input and completion
state survive outside the conversational process and are independently
auditable.

## Non-claims

This does not claim that direct calls supplying `turn_count` fail. It does not
assume a particular transcript-to-activity formula or daemon architecture.

## Reproduction protocol

Create short, medium and long synthetic transcripts using the documented
Claude JSONL shape, then invoke the installed SessionEnd hook with the official
payload schema. Repeat with normal exit, clear and forced timeout. From the
repository root, run
`node claude-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`;
use the matching `codex-harness` command for the declared Codex lifecycle cell.
An independent process/database oracle determines selected mode, completion
and durable effects. Preserve payloads,
process lifecycle, consolidation arguments, database effects and receipts under
`artifacts/<release>/issues/HC-CORTEX-004/raw/`. Stop on invalid transcript
fixtures or after the preregistered repetitions.

## Acceptance criteria

- Consolidation depth is derived from observable payload or transcript data,
  and the derivation is versioned and independently reproducible.
- Short, medium and long fixtures reach their declared modes and produce the
  corresponding database effects.
- Work that exceeds the host hook budget is transferred to a durable worker or
  fails with an explicit receipt; termination is never recorded as success.
- Receipts identify session, input hash, selected mode, start/end, outcome and
  affected-row counts without storing transcript secrets.
- The same fixture can be exercised from the Codex lifecycle adapter or is
  explicitly marked unavailable in the cross-host scorecard.

## Regression obligation

Run the preregistered transcript-size strata plus timeout injection after hook or
consolidation changes. Lifecycle-contract changes require the full host parity
matrix.

## Evidence

- [SessionEnd mode gate](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/session_lifecycle.py)
- [Installed plugin hook](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/.claude-plugin/plugin.json)
- [Claude SessionEnd input contract](https://code.claude.com/docs/en/hooks#sessionend-input)

## Dependencies and exclusions

The official host version must be pinned in the environment manifest. This
issue excludes tuning the scientific consolidation policy itself.

## Verdict ledger

- Payload/code contract mismatch: `proven`
- Real installed-hook reproduction: `pending`
- Durable completion oracle: `pending`
- Regression: `pending`
