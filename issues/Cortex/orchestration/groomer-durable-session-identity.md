# HC-CORTEX-006 — Durable groomer session identity

- Project: `cdeust/Cortex`
- Category: `orchestration`
- Subject: `groomer-durable-session-identity`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§5, 5a, 6; `CAPSTONE-CHARTER.md` evolution loop
- Sovereignty dimensions: 3, 6, 7

## Observed condition

SessionStart registers its short-lived hook PID, while SessionEnd asks the
coordinator to remove the different PID of its own hook process. Liveness
sweeping treats the SessionStart registration as dead after that hook exits.

## Falsifiable hypothesis

With multiple live host sessions, the coordinator can lose every session
registration, clear the groomer marker prematurely or fail to implement its
last-session shutdown contract.

## Why it matters

The deterministic control loop cannot govern one shared maintenance worker if
its durable state represents hook processes rather than host sessions.

## Non-claims

This does not prove duplicate production groomer runs or select the durable
session identifier. Coordinator primitives tested with live PIDs may still be
correct in isolation.

## Reproduction protocol

Launch concurrent real isolated host sessions and execute their actual
SessionStart and SessionEnd hook subprocesses around a long-running fake
groomer. Repeat with preregistered host- and hook-crash cases. From the
repository root, run
`node claude-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
An independent process-tree oracle reconciles live host sessions, worker runs
and registrations. Preserve process trees, registration files, marker state and
run logs under `artifacts/<release>/issues/HC-CORTEX-006/raw/`. Stop after the
last host exit or the preregistered timeout, recording timeout as failure.

## Acceptance criteria

- Each live host session has one stable registration independent of hook PIDs.
- Ending a non-final session preserves the worker and remaining
  registration; ending the last session clears them exactly once.
- One cycle maximum starts per declared period across concurrent sessions.
- Crash recovery removes only dead sessions and permits a later valid cycle.
- An independent process-tree and run-log oracle reproduces every transition.

## Regression obligation

The smallest baseline-reproducing concurrent lifecycle and crash fixtures are
mandatory after coordinator or hook changes. Scheduling-policy changes require
the full orchestration load matrix.

## Evidence

- [SessionStart coordinator registration](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/session_start.py)
- [SessionEnd coordinator deregistration](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/session_lifecycle.py)
- [Coordinator liveness and stop policy](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/groomer_coordinator.py)

## Dependencies and exclusions

Requires real subprocess ancestry rather than mocked PID primitives. Grooming
content quality and temporal prospective-memory delivery are excluded.

## Verdict ledger

- Hook-PID identity mismatch: `proven`
- Real two-session reproduction: `pending`
- Crash-recovery oracle: `pending`
- Regression: `pending`
