# HC-ZETETIC-004 — Mechanical delegation preconditions

- Project: `cdeust/zetetic-team-subagents`
- Category: `orchestration`
- Subject: `mechanical-delegation-preconditions`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `cfc8ef791d695866b9578a616cbf7f256b649d5a`
- Research rule: `RESEARCH-PROCESS.md` §§5–6, 9; `CAPSTONE-CHARTER.md` sovereignty scorecard and evolution loop
- Sovereignty dimensions: 4, 6, 10

## Observed condition

The standalone spawn interface accepts an agent name and free-form task, then
creates a worktree and launches the agent. It has no machine-readable fields or
pre-launch checks for file ownership, overlapping scope, push authority,
required handback artifacts, or acceptance oracle. Those requirements exist in
agent prose rather than in the spawn boundary.

## Falsifiable hypothesis

A malformed or conflicting delegation will launch and mutate state before the
system surfaces its missing authority, ownership conflict, or unverifiable
completion contract.

## Why it matters

Delegation is an autonomy control boundary. Mechanical preconditions make
authority and human escalation auditable, prevent cross-agent interference,
and turn orchestration failure into observable benchmark data.

## Non-claims

No overlapping-write incident was reproduced in this audit. The absence of a
gate does not prove that every orchestrator delegates badly. This dossier does
not require one scheduling algorithm or prohibit free-form task context after
the required contract is valid.

## Reproduction protocol

Preregister a labeled delegation corpus with valid controls and invalid cases:
missing ownership, overlapping ownership, missing acceptance oracle, missing
handback, undeclared push authority, path outside the target worktree, and an
unknown agent. Use a recorder executable and disposable repository so the
oracle can determine whether a worktree, process, branch, file, or remote
mutation occurred before validation.

Run every fixture through isolated Claude and Codex adapters with matched model
and approval policy. Capture the delegation record, validation decision,
timestamps, process tree, filesystem and Git state, logs, retries, latency, and
resource brackets. Report a confusion matrix and p50, p95, and p99 validation
latency without setting a performance target after seeing the results. Freeze
repetitions and stop rules in the protocol.

## Acceptance criteria

- A versioned delegation schema requires target repository, owned paths,
  excluded paths, worktree policy, push authority, handback artifacts, and an
  external acceptance oracle before launch.
- Every invalid fixture is denied with a stable reason before worktree,
  process, file, branch, or remote mutation; every valid control proceeds.
- Concurrent delegations with intersecting ownership are denied or serialized
  according to a preregistered policy, while disjoint controls proceed.
- Validator unavailability is explicit and fails closed for mutating work; it
  never degrades silently to the current free-form launch path.
- Claude and Codex results publish separate confusion matrices, latency
  distributions, errors, resource use, and auditable allow and deny records.

## Regression obligation

Rerun the valid and invalid corpus after a gate change. Schema, ownership,
concurrency, host-adapter, or launch-order changes require the full delegation
matrix and workload recovery slice.

## Evidence

- [Standalone spawn interface and launch sequence](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/scripts/spawn-agent.sh#L1-L83)
- [Existing recorder-based spawn test](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/scripts/test-spawn-agent.sh#L49-L96)
- [Worktree protocol's delegation-controlled push authority](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/rules/agent-reference/worktree-protocol.md#L42-L48)
- [Network and security track](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on HC-ZETETIC-002 for the authoritative handoff contract. This dossier
does not prescribe centralized orchestration, a particular lock
implementation, or a numeric latency threshold.

## Verdict ledger

- Missing spawn-boundary fields at source: `proven`
- Labeled delegation corpus: `pending`
- External pre-mutation oracle: `pending`
- Concurrent cross-host regression: `pending`
