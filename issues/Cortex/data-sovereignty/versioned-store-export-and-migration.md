# HC-CORTEX-008 — Versioned store export and migration

- Project: `cdeust/Cortex`
- Category: `data-sovereignty`
- Subject: `versioned-store-export-and-migration`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 1, 3, 5

## Observed condition

The migration entry point applies PostgreSQL schema changes, and checkpoint
recovery covers working state. The pinned source does not expose a versioned,
backend-neutral export/restore path for the complete durable Cortex store or a
SQLite-to-PostgreSQL data migration.

## Falsifiable hypothesis

A user cannot move all owned durable records from SQLite to PostgreSQL and
back through a documented interface while preserving identities,
relationships, provenance and deletion state.

## Why it matters

Data ownership is incomplete when switching an implementation, restoring a
local backup or leaving the project requires undocumented database surgery.

## Non-claims

This does not claim raw database copies are impossible or that schema
migration is absent. It does not require backend-specific indexes to be
byte-identical.

## Reproduction protocol

Seed the preregistered sovereignty fixture with every public durable record
kind, relationships, Unicode, timestamps, supersession and deleted-state
cases. From the repository root, run
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
to export SQLite, restore
into a clean PostgreSQL store, export again and restore into clean SQLite.
Run each restored store through the public read/query APIs. An independent
canonicalizer compares manifests, logical records, graph edges and hashes while
backend indexes are rebuilt. Preserve exports, manifests, commands and oracle
reports under `artifacts/<release>/issues/HC-CORTEX-008/raw/`. Stop on an
unversioned manifest, fixture drift or the preregistered safety limit.

## Acceptance criteria

- A documented command produces a self-describing, versioned export and a
  machine-readable inventory of every included and explicitly excluded record
  kind.
- SQLite to PostgreSQL to SQLite round-trip preserves all logical IDs,
  content, relationships, provenance, supersession and declared deletion
  state according to the independent canonical oracle.
- Restore into non-empty state follows a preregistered collision policy and
  reports every applied, skipped and rejected record without silent overwrite.
- Derived FTS, vector and graph indexes are rebuilt and public queries match
  the frozen expected-result fixture after each restore.
- Export and restore run locally with network egress denied and do not embed
  credentials, host paths or undeclared external identifiers.

## Regression obligation

The one-record-per-kind round trip is mandatory after durable schema changes.
A format-version, backend or record-kind change requires the complete
bidirectional migration matrix.

## Evidence

- [Current PostgreSQL schema migration entry point](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/migrate.py)
- [Working-state checkpoint scope](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/checkpoint.py)
- [SQLite durable store](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/sqlite_store.py)

## Dependencies and exclusions

Requires clean instances of both supported backends and a frozen record-kind
manifest. Cloud backup scheduling and multi-machine synchronization are
excluded.

## Verdict ledger

- Missing backend-neutral full-store surface in source: `proven`
- Bidirectional migration execution: `pending`
- Independent round-trip oracle: `pending`
- Regression: `pending`
