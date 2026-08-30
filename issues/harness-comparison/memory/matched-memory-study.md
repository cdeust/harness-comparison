# HC-HARNESS-008 — Matched persistent-memory study

- Project: `cdeust/harness-comparison`
- Category: `memory`
- Subject: `matched-memory-study`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §§2–7; `CAPSTONE-CHARTER.md` dimensions 1–6
- Sovereignty dimensions: 1, 2, 3, 4, 5, 6, 9

## Observed condition

Persistent memory is a required comparison capability, but no current Track R
release measures the complete AI Architect solution against eligible mature
references under matched writes, updates, retrieval and isolation tests.

## Falsifiable hypothesis

At least one system will lose required context, return superseded context, leak
between projects, conceal retrieval failure or require undeclared remote state
under the preregistered workload.

## Why it matters

Autonomy depends on durable state that remains correct, attributable,
exportable and isolated as repositories and decisions change.

## Non-claims

Database presence, tool availability and successful self-recall are not memory
quality. No historical retrieval score is reused.

## Reproduction protocol

Create a source-grounded memory fixture with initial facts, corrections,
contradictions, delayed recall, irrelevant distractors, project boundaries and
export/delete operations. Use isolated clean stores and matched model/resource
policy. Score against the fixture ledger from a fresh independent process.

## Acceptance criteria

- The protocol freezes write/update/retrieval tasks, delay schedule, distractor
  distribution, repetitions, stop rule and scoring rubric.
- Every response carries source revision and age sufficient for the scorer to
  distinguish current, superseded and unsupported claims.
- Cross-project reads, unauthorized writes and deleted-record recall are tested
  as explicit denied cases with auditable logs.
- Reports preserve correctness classes, missingness, latency distribution,
  storage/resources, retries, failure recovery and model/tool cost.
- Export and restore are tested into a fresh isolated store without relying on
  an undeclared hosted service.

## Regression obligation

Rerun the smallest affected memory scenario after a fix. Schema, store,
retrieval policy or isolation changes require the full memory matrix.

## Evidence

- [Required memory metrics](../../../BENCHMARK-TRACKS.md)
- [Sovereignty scorecard](../../../CAPSTONE-CHARTER.md)
- [Security and isolation requirements](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on HC-HARNESS-002, HC-HARNESS-003, HC-HARNESS-005 and HC-HARNESS-006.
The study does not prescribe one memory architecture.

## Verdict ledger

- Study requirement: `proven`
- Eligible comparison panel: `pending`
- Matched run and oracle: `pending`
- Regression: `pending`
