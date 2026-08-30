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
   the build as A-side ingestion cost.
3. Run B ingestion cells first, then A ingestion cells, one cell at a time.
   Capture UTC start/end timestamps, `uptime`, free disk, and any peer process
   that overlaps a cell. A contaminated timing is marked `re-qualify`.
4. Start separate fresh processes for the P1 entry-point, P2 fan-in, P3
   documentation, and C1–C5 component probes. Probe answers may use only their
   selected harness stores; they must cite the grounding artifact.
5. Independently score every answer against the live repository as `correct`,
   `partial`, `wrong`, or `no-answer`. Do not let the probed process score
   itself. Preserve every failure in a negative-result log.
6. Run the contamination sweep over B content probes before publishing their
   scores. Persistent-store evidence about previous benchmark runs is excluded.

The reports must preserve raw tool responses, environment verification, timing
brackets, pre-registered rubric, independent scores, and negative results.
No aggregate winner is claimed from the four-repository corpus.
