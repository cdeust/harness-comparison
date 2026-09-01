# Public artifacts

This directory contains only artifacts referenced by public upstream work.

- [`claude-mem-3693.md`](claude-mem-3693.md) — citation and provenance for the
  published harness-comparison benchmark referenced by claude-mem PR #3693.
- [`hc-cortex-002-release-20260901-r2/`](hc-cortex-002-release-20260901-r2/) —
  sealed `VERIFIED` release of the preregistered HC-CORTEX-002
  transaction-isolation protocol (`2026-08-30-hc-cortex-002-v1`, 18 cells,
  study verdict `PASS`); dossier
  `issues/Cortex/scalability/sqlite-transaction-isolation.md`, runbook
  `protocols/HC-CORTEX-002-RUNBOOK.md`.

New experiments belong in a dated, pre-registered release directory only after
the research gates in `RESEARCH-PROCESS.md` pass.

Every new release is self-contained and content-addressed. It contains the
exact registered protocol, environment and process receipts, raw ledgers,
independent analysis and scoring, negative results, review notes, reproduction
instructions, a change log, and `execution-manifest.json`. `VERIFIED` and
`PUBLISHED` releases must cover every planned cell; partial or interrupted work
remains explicitly `PILOT`.

The manifest's `immutable` flag means tamper-evident bytes bound to their
SHA-256 digests. For a `PUBLISHED` release, the validator additionally compares
the release with its tracked Git blobs; the flag does not pretend that a
writable local filesystem is physically immutable.

Validate the protocol before execution and the complete release before review:

```sh
node scripts/validate-benchmark-release.mjs \
  --phase protocol protocols/<protocol>.json

node scripts/validate-benchmark-release.mjs artifacts/<release>
```
