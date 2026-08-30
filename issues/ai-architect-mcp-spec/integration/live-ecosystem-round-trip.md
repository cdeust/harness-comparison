# HC-AIASPEC-009 — Pinned live ecosystem round trip

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `integration`
- Subject: `live-ecosystem-round-trip`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §3, §4 and §5
- Sovereignty dimensions: 2, 3, 6, 9

## Observed condition

The integration-testing document states that CI does not exercise a live Cortex
service or real ai-architect-mcp-codebase binary. The workflow therefore checks
repository-local contracts but not a pinned, complete ecosystem round trip,
protocol drift, model drift, or performance.

## Falsifiable hypothesis

Released components can pass their hermetic suites while a version-pinned live
composition fails during codebase indexing, Cortex write/recall, or host-driven
PRD execution.

## Why it matters

The product claim is a stack capability. Without a live round trip, local
service completeness, cross-project isolation, recovery, and provider
replaceability remain assumptions at release time.

## Non-claims

Hermetic pull-request CI is not considered deficient merely because it avoids
networked dependencies. This dossier calls for a separate scheduled/release
track and does not require external SaaS.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Pin released SHAs, executable hashes, MCP contracts, model/provider policy,
  corpus snapshot, credentials scope, ports, mutable roots, and service
  identities in an isolated manifest.
- On Claude and Codex separately, handshake every declared tool, index the
  external fixture with ai-architect-mcp-codebase, write and recall a unique
  Cortex canary, then complete the host-driven PRD pipeline through every
  `NextAction`.
- Inject service unavailability, restart, protocol mismatch, and cross-project
  canaries according to a frozen fault matrix.
- Capture raw MCP frames, state transitions, network/process/filesystem logs,
  timings, errors/retries, resources, cost, recovery, and artifact hashes under
  `results/<protocol-id>/raw/`.
- Apply preregistered repetitions and stop rules. Do not use a fixed timeout as
  a success criterion for an unbounded ingestion; record host limitations
  separately.

## Acceptance criteria

- The scheduled/release workflow installs only pinned artifacts and records a
  successful `tools/list` plus one schema-valid call for each declared service
  before the run.
- Both hosts complete index, isolated Cortex write/recall, and the full
  host-driven PRD state machine with equivalent machine-readable outcomes and
  no shared mutable state.
- Injected protocol drift and service faults fail visibly with stable reason,
  bounded recovery behavior, and complete negative artifacts; cross-project
  canaries never leak.
- Hermetic pull-request CI remains separately runnable. Live artifacts are
  privacy-scrubbed, content-addressed, and independently replayable.

## Regression obligation

Run the smallest baseline-reproducing pinned handshake/round-trip fixture after
adapter or contract changes. Release, dependency, protocol, state-machine, or
service-boundary changes require the full live fault and cross-host matrix.

## Evidence

- [Current integration-test boundary](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/docs/INTEGRATION-TESTING.md)
- [Current CI workflow](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/.github/workflows/ci.yml)
- [Environment and execution contract](../../../RESEARCH-PROCESS.md)
- [Whole-stack parity contract](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on reproducible local releases of the declared ecosystem services,
isolated credentials/state, and a privacy-scrubbed artifact publisher. SaaS-only
features and nondeterministic nightly dependency resolution are excluded.

## Verdict ledger

- Pinned-source CI boundary: `proven`
- Live cross-host round trip: `pending`
- Fault/isolation oracle: `pending`
- Release regression: `pending`
