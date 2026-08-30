# HC-CORTEX-009 — Auditable bulk deletion

- Project: `cdeust/Cortex`
- Category: `data-sovereignty`
- Subject: `auditable-bulk-deletion`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 1, 3, 5

## Observed condition

The public forget handler accepts one integer memory identifier. The pinned
surface has no previewable bulk operation by project, source, tag, age or
record manifest and no aggregate completion receipt for such a request.

## Falsifiable hypothesis

A user cannot prove that a bounded collection of owned memories and their
derived search artifacts were deleted completely without issuing and
reconciling one request per identifier.

## Why it matters

Sovereign data control requires deletion to remain bounded, inspectable and
verifiable as the corpus grows, including when one operation partially fails.

## Non-claims

This does not claim that the existing per-ID deletion leaves derived rows. It
does not define a legal retention policy or authorize cross-tenant deletion.

## Reproduction protocol

Seed disjoint projects with overlapping tags, sources, ages and graph
relations on SQLite and PostgreSQL. From the repository root, run
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
first in preview mode and then with a
frozen selector manifest; inject failure after each deletion phase. The
external oracle enumerates primary records, FTS/vector candidates, graph
relations and unaffected canaries before and after restart. Preserve manifests,
receipts, snapshots and logs under
`artifacts/<release>/issues/HC-CORTEX-009/raw/`. Stop immediately if a canary
outside the selected manifest changes.

## Acceptance criteria

- A bounded selector or explicit manifest can be previewed without mutation,
  and the preview hash is bound to the subsequent confirmation.
- A successful request removes exactly the selected logical records and their
  documented derived artifacts on both backends; every unselected canary
  remains byte-for-byte or logically unchanged as preregistered.
- The completion receipt reports selector, preview hash, affected counts by
  record kind, start/end, backend and outcome without retaining deleted
  content.
- Injected partial failure is explicit and either rolls back atomically or
  yields a resumable ledger that the independent oracle can reconcile.
- Invalid, unbounded and stale-preview requests are denied with auditable
  reasons and no mutation.

## Regression obligation

The smallest baseline-reproducing selector and injected-failure fixtures are
mandatory after deletion or index changes. Selector or storage-contract changes
require the complete backend and derived-artifact matrix.

## Evidence

- [Current single-ID forget surface](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/forget.py)
- [SQLite store deletion implementation](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/sqlite_store.py)
- [PostgreSQL store schema and operations](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/pg_schema.py)

## Dependencies and exclusions

Requires a canonical inventory of derived artifacts and isolated backends.
Authorization policy and archival retention are separate decisions.

## Verdict ledger

- Single-ID-only public handler: `proven`
- Bulk deletion reproduction: `pending`
- Independent deletion oracle: `pending`
- Regression: `pending`
