# HC-HARNESS-009 — Matched orchestration and procedure study

- Project: `cdeust/harness-comparison`
- Category: `orchestration`
- Subject: `matched-orchestration-study`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §§2–7; `BENCHMARK-TRACKS.md` required metrics
- Sovereignty dimensions: 4, 5, 6, 7, 9, 10

## Observed condition

The capstone requires orchestration, procedure discovery, failure recovery and
human escalation measurements. No current release executes these tasks across
eligible references and the complete AI Architect solution under one matched
protocol.

## Falsifiable hypothesis

One or more systems will silently skip a required gate, lose task state across
resume, choose an inapplicable procedure, fail to recover, or escalate at the
wrong authority boundary.

## Why it matters

An autonomous system must preserve deterministic control state while using the
model only for reasoning that the protocol assigns to it.

## Non-claims

The number of agents or procedures is not treated as quality. A catalogue
listing does not prove correct routing or execution.

## Reproduction protocol

Preregister long-horizon tasks with deterministic checkpoints, procedure
selection cases, delegation, injected tool/model/network failures, resume after
context reset and explicit human-only decisions. Run matched adapters with
isolated state and preserve every transition and tool verdict.

## Acceptance criteria

- Stable procedure IDs can be enumerated and a versioned procedure retrieved on
  Claude and Codex.
- The state-transition oracle detects skipped, repeated and out-of-order gates;
  a conversational claim of completion cannot satisfy it.
- Failure injection records retry, degradation, rollback or escalation without
  losing prior evidence.
- Resume fidelity is scored against the preregistered task state after a fresh
  process/context boundary.
- Reports include completion correctness, human interventions, latency,
  resources, retries, cost and every silent-failure observation.

## Regression obligation

Rerun the affected transition scenario for local fixes. Changes to state model,
procedure identity, delegation or escalation require the full orchestration
matrix.

## Evidence

- [Required orchestration metrics](../../../BENCHMARK-TRACKS.md)
- [Failure and workload requirements](../../../RESEARCH-PROCESS.md)
- [Declared procedure parity surface](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on HC-HARNESS-002, HC-HARNESS-003, HC-HARNESS-004, HC-HARNESS-005 and
HC-HARNESS-006. Social-content automation is outside this study.

## Verdict ledger

- Study requirement: `proven`
- Eligible comparison panel: `pending`
- Matched run and oracle: `pending`
- Regression: `pending`
