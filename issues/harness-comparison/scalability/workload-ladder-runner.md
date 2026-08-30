# HC-HARNESS-004 — Executable workload ladder

- Project: `cdeust/harness-comparison`
- Category: `scalability`
- Subject: `workload-ladder-runner`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §5a
- Sovereignty dimensions: 6, 7

## Observed condition

The process specifies workload-ladder measurements, saturation and recovery,
but the audited tree provides no protocol-driven load runner or release schema
for these metrics.

## Falsifiable hypothesis

Neither complete stack can currently be compared reproducibly across increasing
project/session concurrency using this repository alone.

## Why it matters

A successful single session provides no evidence about queueing, saturation,
recovery or cost per completed workflow.

## Non-claims

No product is claimed to be slow or unscalable. No concurrency levels or pass
thresholds are invented by this dossier.

## Reproduction protocol

Preregister a workload fixture and ladder before execution. Run each isolated
stack with identical model, corpus, warm/cold policy and stop rule. Capture raw
system and application telemetry for every level and after load removal.

## Acceptance criteria

- The protocol declares workload size, concurrency levels, call rate, duration,
  repetitions, warm/cold policy and stop rule before the first run.
- Every declared stack emits throughput, p50/p95/p99 latency, queue depth, errors, retries,
  CPU, memory, disk, database connections and model/tool cost per completed
  workflow in the same schema.
- Saturation is reported as an observation, not inferred from a preset winner
  threshold; recovery after load removal is measured.
- A fixture adapter and a second clean run reproduce the execution plan and raw
  metric schema from the same protocol hash.

## Regression obligation

Run a one-level smoke ladder on runner changes. A publishable scalability claim
requires the full preregistered ladder for every declared stack.

## Evidence

- [Workload and scalability contract](../../../RESEARCH-PROCESS.md)
- [Audited repository tree](https://github.com/cdeust/harness-comparison/tree/3ab7c8d17044d8b3572fca2cfa705dcae182d16b)

## Dependencies and exclusions

Depends on HC-HARNESS-001 and HC-HARNESS-002. Selecting numeric thresholds is a
future preregistration decision backed by baseline data or cited research.

## Verdict ledger

- Contract requirement: `proven`
- Executable track absence: `proven`
- Matched workload run: `pending`
- Regression: `pending`
