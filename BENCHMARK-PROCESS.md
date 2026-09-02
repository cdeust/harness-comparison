# Revision benchmark contract

This contract is governed by `RESEARCH-PROCESS.md`, with scope defined in
`CAPSTONE-CHARTER.md`. Historical run artifacts are not normative.

Shared by every harness driver in this repository (`codex-harness/`,
`claude-harness/`, and any future one) — the process below does not depend on
which CLI drives a given harness. Copied here from `codex-harness/benchmark-revision.md`
on 2026-08-26 as the single source of truth; that file's own copy is left in
place pending a later dedup pass (it was under active use at copy time).

1. Run Step 0 in a fresh process for each harness. A failed or stale component
   is an environment fault, not benchmark data.
2. Rebuild Harness A's Graphify artifact for every corpus repository. Record
   the build as A-side ingestion cost. Where a per-harness precompute-receipt
   runner exists (Claude's `claude-harness/run-precompute.mjs`), drive the
   rebuild through it so the receipt — raw CPU seconds, max RSS, and its three
   printed semantic caveats — becomes the recorded cost, not an unmeasured
   wall-clock note.
3. Run B ingestion cells first, then A ingestion cells, one cell at a time.
   Capture UTC start/end timestamps, `uptime`, free disk, and any peer process
   that overlaps a cell. A contaminated timing is marked `re-qualify`. Where
   the precompute-receipt runner is available, capture each ingestion cell's
   receipt the same way as step 2's rebuild.
4. Start separate fresh processes for the P1 entry-point, P2 fan-in, P3
   documentation, and C1–C5 component probes. Probe answers may use only their
   selected harness stores; they must cite the grounding artifact.
5. Independently score every answer against the live repository as `correct`,
   `partial`, `wrong`, or `no-answer`. Do not let the probed process score
   itself. Preserve every failure in a negative-result log.
6. Run the contamination sweep over B content probes before publishing their
   scores. Persistent-store evidence about previous benchmark runs is excluded.
7. Once every replicate root is complete, build the measured-frugality ledger
   from the accepted cells only (`claude-harness/build-frugality-ledger.mjs`,
   one `--result-root` per replicate; every row hash-bound to its envelope,
   bracket, report and precompute receipt) and aggregate it with the
   parameters file the protocol declares
   (`claude-harness/aggregate-frugality-ledger.mjs --ledger --parameters
   --out`). The parameters file carries every statistical choice — control
   harness, confidence level, bootstrap replicates, seed, stage, declared `n`
   per cell, metrics; the aggregator refuses a missing field and a
   `(replicates, confidence level)` pair whose percentile rank is not an
   integer, and publishes `n` per cell, marking an interval degenerate at
   `n < 2` rather than hiding it. Both outputs are create-exclusive; the
   summary records the sha256 of the ledger and parameters files it read.

The reports must preserve raw tool responses, environment verification, timing
brackets, pre-registered rubric, independent scores, negative results, and —
for a frugality claim — the ledger, the parameters file and the summary.
No aggregate winner is claimed from the four-repository corpus.
