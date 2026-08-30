# HC-CORTEX-012 — Provenance-preserving freshness remediation

- Project: `cdeust/Cortex`
- Category: `provenance`
- Subject: `provenance-preserving-freshness-remediation`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6, 9; `CAPSTONE-CHARTER.md` evolution loop
- Sovereignty dimensions: 3, 4, 6, 10

## Observed condition

The post-commit hook refreshes the code graph, but the contradiction
remediation pass has no production caller. Project seeding can purge and
recreate seed-generated memories, yet those records do not expose a complete
file/hash/commit provenance and supersession chain for later reconciliation.

## Falsifiable hypothesis

After a commit contradicts an indexed fact, recall can continue to present the
old assertion as current because code freshness and memory remediation are not
one observable transaction.

## Why it matters

Critical reasoning depends on knowing not only what was remembered, but which
revision justified it, what contradicted it and whether remediation completed.

## Non-claims

This does not claim age metadata or code-graph reindexing is absent. It does
not require deleting authored historical memories or treating every source edit
as a contradiction.

## Reproduction protocol

At repository revision A, seed code-derived and authored assertions plus
unaffected canaries with recorded source spans. Commit revision B that directly
contradicts the code fact, then invoke the installed post-commit path on fresh
SQLite and PostgreSQL stores. From the repository root, run
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
Before and after the next recall, an independent Git/source oracle
compares content, provenance, status, graph freshness and remediation receipts.
Preserve repositories, SHAs, tool traffic and ledgers under
`artifacts/<release>/issues/HC-CORTEX-012/raw/`. Stop on source-fixture drift or
if an unaffected canary changes.

## Acceptance criteria

- Every code-derived assertion exposes repository identity, commit SHA, file,
  source span or symbol, content hash and ingestion method in a versioned
  provenance record.
- After revision B, the assertion from A is marked stale, superseded or
  conflicted before it can be returned as unqualified current evidence.
- The replacement fact points to B and retains a traversable history to A;
  affected authored facts are flagged for review rather than silently deleted.
- The post-commit receipt correlates code reindexing and memory remediation,
  reports partial failure, and permits idempotent retry after injected faults.
- SQLite and PostgreSQL produce the same oracle classification, while
  unaffected canaries and their provenance remain unchanged.

## Regression obligation

The A-to-B contradiction fixture is mandatory after seeding, recall,
provenance or hook changes. Contract changes require the complete backend,
fault and authored-versus-derived matrix.

## Evidence

- [Post-commit code reindex hook](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/post_commit_reindex.py)
- [Unwired change remediation pass](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/consolidation/change_remediation_pass.py)
- [Current project seeding lifecycle](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/seed_project.py)
- [Seed-project stages](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/seed_project_stages.py)

## Dependencies and exclusions

Requires a real Git worktree, installed hooks and frozen contradictory source
fixtures. General semantic truth adjudication and UI visualization are
excluded.

## Verdict ledger

- Disconnected remediation path in source: `proven`
- Revision-contradiction reproduction: `pending`
- Independent Git/provenance oracle: `pending`
- Regression: `pending`
