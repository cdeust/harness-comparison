# Record-level disposition ledger

This ledger makes the 118-record source audit traceable without linking to or
naming a non-public system. Legacy IDs are opaque audit keys. Subjects are
retained when safe and normalized when they contain non-public automation
identifiers. Pull request `L-011` is deliberately absent because it is a change
record, not one of the 118 issues.

The disposition rules and audited product revisions are defined in
[AUDIT.md](AUDIT.md). `current` rows map to an active dossier; `superseded` rows
map to their replacement when one exists. `resolved`, `insufficient`, and
`outside` rows do not create active dossiers.

## Benchmark and candidate governance

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-001 | Capability-review automation placeholder | `superseded` | [Capstone evolution loop](../CAPSTONE-CHARTER.md#evolution-loop) |
| L-002 | Derived dependency updates for external candidates | `resolved` | — |
| L-003 | Realign seven derived local AI Architect installations | `resolved` | — |
| L-004 | Ten Semantica capabilities claimed absent from AI Architect | `insufficient` | — |
| L-006 | Measure code-graph intelligence parity | `superseded` | [HC-HARNESS-007](harness-comparison/code-intelligence/matched-code-intelligence-study.md) |
| L-007 | Measure persistent-memory parity | `superseded` | [HC-HARNESS-008](harness-comparison/memory/matched-memory-study.md) |
| L-008 | Measure skill/workflow-library parity | `superseded` | [HC-HARNESS-009](harness-comparison/orchestration/matched-orchestration-study.md) |
| L-010 | Unregistered capability-watch workflow | `resolved` | — |
| L-012 | Graphify portability and determinism watch | `superseded` | [HC-HARNESS-006](harness-comparison/benchmark-validity/freeze-independent-corpus.md), [HC-HARNESS-007](harness-comparison/code-intelligence/matched-code-intelligence-study.md) |
| L-013 | Semantica ingestion and graph-guard watch | `superseded` | [HC-HARNESS-006](harness-comparison/benchmark-validity/freeze-independent-corpus.md), [HC-HARNESS-010](harness-comparison/provenance/provenance-and-conflict-study.md) |
| L-014 | codebase-memory-mcp contract and head-only distribution watch | `superseded` | [HC-HARNESS-006](harness-comparison/benchmark-validity/freeze-independent-corpus.md), [HC-HARNESS-007](harness-comparison/code-intelligence/matched-code-intelligence-study.md) |
| L-104 | AI Architect maturity-completion matrix | `superseded` | [HC-HARNESS-011](harness-comparison/benchmark-validity/ai-architect-sovereignty-scorecard.md) and product dossiers |
| L-108 | Duplicate capability-review automation placeholder | `superseded` | L-001 and the [candidate registry](../candidates/README.md) |
| L-109 | Unreachable bridge repository left candidate scout blind | `resolved` | — |
| L-114 | Revision-three session health, standing evaluation, and resume-fidelity work | `superseded` | [HC-HARNESS-001](harness-comparison/benchmark-validity/portable-protocol-driven-runner.md), [HC-HARNESS-002](harness-comparison/benchmark-validity/preregistration-and-artifact-manifest.md), [HC-HARNESS-003](harness-comparison/benchmark-validity/independent-scoring-and-contamination.md) |
| L-115 | Adopt three external patterns as already proven | `insufficient` | — |
| L-116 | Rebalance the external candidate roster | `superseded` | [HC-HARNESS-006](harness-comparison/benchmark-validity/freeze-independent-corpus.md) |
| L-117 | Archive agentic-ai and turn reduction into a roadmap feature | `outside` | — |
| L-118 | Produce explainer videos for AI Architect repositories | `outside` | — |

## ai-architect-mcp-codebase

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-005 | Serena refactoring suggestions and symbol-navigation gap | `superseded` | [HC-AIACB-005](ai-architect-mcp-codebase/code-intelligence/position-navigation-safe-rename.md) |
| L-015 | Read-only graph query bypass through write/denial-of-service forms | `resolved` | — |
| L-016 | Second-order Cypher injection through a filename | `resolved` | — |
| L-017 | Security gates fail on real repositories | `current` | [HC-AIACB-001](ai-architect-mcp-codebase/network-security/security-gate-semantics.md) |
| L-018 | LSP resolver structurally produces no edge | `resolved` | — |
| L-019 | Impact query returns an empty radius labelled exact | `resolved` | — |
| L-020 | Semantic-diff verifier saturates the regression verdict | `current` | [HC-AIACB-002](ai-architect-mcp-codebase/reliability/semantic-diff-totality.md) |
| L-021 | Diff parser loses files and contaminates line ranges | `current` | [HC-AIACB-003](ai-architect-mcp-codebase/code-intelligence/complete-git-diff-parsing.md) |
| L-022 | Incremental re-index omits re-resolution and search refresh | `current` | [HC-AIACB-004](ai-architect-mcp-codebase/code-intelligence/incremental-derived-state-freshness.md) |
| L-023 | No position-based symbolic navigation | `current` | [HC-AIACB-005](ai-architect-mcp-codebase/code-intelligence/position-navigation-safe-rename.md) |
| L-024 | Untyped resolution and partial language-server coverage | `current` | [HC-AIACB-006](ai-architect-mcp-codebase/code-intelligence/cross-language-resolution-quality.md) |
| L-025 | Incomplete incrementality outside the recommended profile | `superseded` | [HC-AIACB-004](ai-architect-mcp-codebase/code-intelligence/incremental-derived-state-freshness.md) |
| L-026 | Hard-coded exclusions do not honor repository ignore policy | `current` | [HC-AIACB-007](ai-architect-mcp-codebase/code-intelligence/repository-ignore-fidelity.md) |
| L-027 | Impact analysis is limited to one hop | `current` | [HC-AIACB-008](ai-architect-mcp-codebase/code-intelligence/bounded-transitive-impact.md) |
| L-028 | Security gates are weak and language-dependent | `current` | [HC-AIACB-001](ai-architect-mcp-codebase/network-security/security-gate-semantics.md) |
| L-029 | No refactoring or rename surface | `superseded` | [HC-AIACB-005](ai-architect-mcp-codebase/code-intelligence/position-navigation-safe-rename.md) |
| L-112 | Query-time staleness guard and full-text file-content search | `resolved` | — |

## ai-architect-mcp-spec

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-030 | Run slots can be exhausted permanently | `current` | [HC-AIASPEC-001](ai-architect-mcp-spec/reliability/durable-cancellable-run-lifecycle.md) |
| L-031 | Calibration ablation inverts oracle truth | `current` | [HC-AIASPEC-002](ai-architect-mcp-spec/reliability/oracle-judge-truth-semantics.md) |
| L-032 | Claim identifiers collide across sections | `current` | [HC-AIASPEC-003](ai-architect-mcp-spec/reliability/lossless-claim-verification-coverage.md) |
| L-033 | Concurrent-run capacity accepts invalid values | `current` | [HC-AIASPEC-001](ai-architect-mcp-spec/reliability/durable-cancellable-run-lifecycle.md) |
| L-034 | Cross-reference validator produces false positives | `current` | [HC-AIASPEC-004](ai-architect-mcp-spec/reliability/cross-reference-validator-correctness.md) |
| L-035 | Claim evidence is reduced to the matched fragment | `current` | [HC-AIASPEC-003](ai-architect-mcp-spec/reliability/lossless-claim-verification-coverage.md) |
| L-036 | User-answer parsing differs between human gates | `current` | [HC-AIASPEC-005](ai-architect-mcp-spec/orchestration/normalized-human-gate-answers.md) |
| L-037 | Runs have no durable persistence | `current` | [HC-AIASPEC-001](ai-architect-mcp-spec/reliability/durable-cancellable-run-lifecycle.md) |
| L-038 | Runs have no cancellation or purge surface | `current` | [HC-AIASPEC-001](ai-architect-mcp-spec/reliability/durable-cancellable-run-lifecycle.md) |
| L-039 | Claim extraction leaves sections unverified | `current` | [HC-AIASPEC-003](ai-architect-mcp-spec/reliability/lossless-claim-verification-coverage.md) |
| L-040 | Existing PRDs have no revision workflow | `current` | [HC-AIASPEC-006](ai-architect-mcp-spec/provenance/provenance-preserving-prd-revision.md) |
| L-041 | Reliability calibration is disconnected from the main path | `current` | [HC-AIASPEC-007](ai-architect-mcp-spec/reliability/production-self-check-calibration.md) |
| L-042 | Mechanical completion verdicts do not execute the declared rule | `current` | [HC-AIASPEC-008](ai-architect-mcp-spec/reliability/deferred-mechanical-verdicts.md) |
| L-102 | No real CI round trip with codebase and Cortex | `current` | [HC-AIASPEC-009](ai-architect-mcp-spec/integration/live-ecosystem-round-trip.md) |
| L-113 | Cross-repository tool-name contract is not versioned | `current` | [HC-AIASPEC-010](ai-architect-mcp-spec/integration/versioned-codebase-contract.md) |

## Cortex

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-009 | Product releases lagged their default branches | `resolved` | — |
| L-043 | Prospective triggers use divergent vocabularies and never fire | `current` | [HC-CORTEX-001](Cortex/orchestration/prospective-memory-end-to-end.md) |
| L-044 | SQLite uses one unlocked connection across threads | `current` | [HC-CORTEX-002](Cortex/scalability/sqlite-transaction-isolation.md) |
| L-045 | SQLite recall omits metadata and neutralizes mechanisms | `current` | [HC-CORTEX-003](Cortex/memory/sqlite-postgresql-recall-parity.md) |
| L-046 | Session-end consolidation is inert on the installed plugin path | `current` | [HC-CORTEX-004](Cortex/orchestration/session-end-consolidation-receipts.md) |
| L-047 | Hook cooldown state uses predictable paths and follows symlinks | `current` | [HC-CORTEX-005](Cortex/network-security/secure-hook-state-files.md) |
| L-048 | Groomer coordination identifies ephemeral hook processes | `current` | [HC-CORTEX-006](Cortex/orchestration/groomer-durable-session-identity.md) |
| L-049 | JSON corruption is silently collapsed into empty state | `current` | [HC-CORTEX-007](Cortex/reliability/corrupt-json-state-is-not-empty-state.md) |
| L-050 | SQLite and PostgreSQL recall rankings diverge silently | `current` | [HC-CORTEX-003](Cortex/memory/sqlite-postgresql-recall-parity.md) |
| L-051 | No SQLite-to-PostgreSQL data migration | `current` | [HC-CORTEX-008](Cortex/data-sovereignty/versioned-store-export-and-migration.md) |
| L-052 | No full store export, backup, or restore | `current` | [HC-CORTEX-008](Cortex/data-sovereignty/versioned-store-export-and-migration.md) |
| L-053 | Forget supports only one identifier per request | `current` | [HC-CORTEX-009](Cortex/data-sovereignty/auditable-bulk-deletion.md) |
| L-054 | Shared-team storage has no explicit identity or access boundary | `current` | [HC-CORTEX-010](Cortex/network-security/explicit-tenant-boundary.md) |
| L-055 | Multi-machine synchronization is absent | `outside` | — |
| L-056 | Cognitive profiling depends on Claude JSONL | `current` | [HC-CORTEX-011](Cortex/integration/host-neutral-cognitive-profiling.md) |
| L-057 | Prospective memory has no temporal scheduler | `current` | [HC-CORTEX-001](Cortex/orchestration/prospective-memory-end-to-end.md) |
| L-110 | Freshness remediation and provenance are not one observable transaction | `current` | [HC-CORTEX-012](Cortex/provenance/provenance-preserving-freshness-remediation.md) |

## zetetic-team-subagents

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-058 | Plugin manifest omits the deletion gate | `current` | [HC-ZETETIC-001](zetetic-team-subagents/integration/installed-enforcement-parity.md) |
| L-059 | Agent handoff rules contradict each other | `current` | [HC-ZETETIC-002](zetetic-team-subagents/orchestration/executable-agent-handoff-contract.md) |
| L-060 | Deletion gate is inert on a fresh installation | `current` | [HC-ZETETIC-001](zetetic-team-subagents/integration/installed-enforcement-parity.md) |
| L-061 | An agent toolset forbids its own obligations | `current` | [HC-ZETETIC-002](zetetic-team-subagents/orchestration/executable-agent-handoff-contract.md) |
| L-062 | Hook installation snippet is not executable as documented | `current` | [HC-ZETETIC-001](zetetic-team-subagents/integration/installed-enforcement-parity.md) |
| L-063 | Command index describes a removed catalog | `current` | [HC-ZETETIC-001](zetetic-team-subagents/integration/installed-enforcement-parity.md) |
| L-064 | Seven skills contain invalid YAML frontmatter | `current` | [HC-ZETETIC-003](zetetic-team-subagents/integration/strict-frontmatter-portability.md) |
| L-065 | Orchestrator, declared model, and enforced budget conflict | `current` | [HC-ZETETIC-002](zetetic-team-subagents/orchestration/executable-agent-handoff-contract.md) |
| L-066 | Delegation preconditions have no mechanical gate | `current` | [HC-ZETETIC-004](zetetic-team-subagents/orchestration/mechanical-delegation-preconditions.md) |
| L-067 | Deletion safety is blind outside four language families | `current` | [HC-ZETETIC-005](zetetic-team-subagents/reliability/cross-language-deletion-safety.md) |
| L-068 | Generated artifacts and indexes have asymmetric drift controls | `current` | [HC-ZETETIC-001](zetetic-team-subagents/integration/installed-enforcement-parity.md) |
| L-069 | Installed surface drift was not detected across host paths | `resolved` | — |
| L-070 | Skill metadata has no consumer | `resolved` | — |
| L-071 | Procedures exempt themselves from their own standard | `insufficient` | — |
| L-111 | Agent spawning bypasses permissions and sandboxing by default | `current` | [HC-ZETETIC-006](zetetic-team-subagents/network-security/sandboxed-agent-spawn-default.md) |
| L-119 | Build a writing-style cleanup skill | `outside` | — |

## session-optimizer

This project is outside the current Track I population. These records remain in
the negative log and do not become AI Architect capstone findings.

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-072 | Model pricing uses an obsolete multiplier | `outside` | — |
| L-073 | Hard context pressure overwrites the warning checkpoint | `outside` | — |
| L-074 | A single telemetry cache starves concurrent sessions | `outside` | — |
| L-075 | Two pricing engines produce incompatible costs | `outside` | — |
| L-076 | Absolute-path prompts bypass the refine gate | `outside` | — |
| L-077 | Shared-threshold keys disagree | `outside` | — |
| L-078 | Git-context fallback ignores worktrees and submodules | `outside` | — |
| L-079 | Predictable temporary state can be purged or replaced | `outside` | — |
| L-080 | Stop guard has no test | `outside` | — |
| L-081 | Context guard does not re-arm after compaction | `outside` | — |
| L-082 | Checkpoint stubs have no retention policy | `outside` | — |
| L-083 | Shared thresholds are delivered only by the statusline package | `outside` | — |
| L-084 | Memory writer references an unavailable tool name | `outside` | — |
| L-085 | Refine-gate detection is English-only | `outside` | — |
| L-086 | Refine gate has no anti-repetition memory | `outside` | — |
| L-087 | Refine gate has no production telemetry | `outside` | — |
| L-088 | Pricing has no current model entry or update procedure | `outside` | — |
| L-089 | Statusline telemetry is not designed for concurrent sessions | `outside` | — |
| L-090 | Statusline refresh launches many helper processes | `outside` | — |
| L-091 | Session-start asset updates are advisory | `outside` | — |
| L-092 | Windows support status is undocumented | `outside` | — |

## cortex-viz

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-093 | Activity stream stops after the bounded deque rolls over | `current` | [HC-CORTEX-VIZ-001](cortex-viz/scalability/rollover-safe-multi-instance-activity-stream.md) |
| L-094 | Database ingest failure returns a success-like HTTP response | `current` | [HC-CORTEX-VIZ-002](cortex-viz/reliability/honest-activity-ingest-failures.md) |
| L-095 | Frontend export route has no server endpoint | `current` | [HC-CORTEX-VIZ-003](cortex-viz/data-sovereignty/working-per-page-export.md) |
| L-096 | Inactive graph view accumulates an unbounded client buffer | `current` | [HC-CORTEX-VIZ-004](cortex-viz/scalability/bounded-inactive-view-buffer.md) |
| L-097 | Fresh-code bootstrap uses a stale package-layout marker | `current` | [HC-CORTEX-VIZ-005](cortex-viz/integration/fresh-code-bootstrap-real-layouts.md) |
| L-098 | Activity writes bypass same-origin enforcement | `current` | [HC-CORTEX-VIZ-006](cortex-viz/network-security/authenticated-origin-protected-activity-writes.md) |
| L-099 | Live activity relies on in-process POST notifications | `current` | [HC-CORTEX-VIZ-001](cortex-viz/scalability/rollover-safe-multi-instance-activity-stream.md) |
| L-100 | No semantic projection or similarity endpoint | `outside` | — |
| L-101 | Local activity-write channel has no authentication | `current` | [HC-CORTEX-VIZ-006](cortex-viz/network-security/authenticated-origin-protected-activity-writes.md) |

## Retired bridge

The retired bridge is outside the current internal product population.

| Legacy ID | Subject | Disposition | Public outcome |
|---|---|---|---|
| L-103 | Distribution lacks a source tag and package attestation | `outside` | — |
| L-105 | Live Codex terminal has no automatic bootstrap or rendezvous | `outside` | — |
| L-106 | No automated bidirectional gate between real terminals | `outside` | — |
| L-107 | Preview remote/channel compatibility is unmeasured | `outside` | — |

## Ledger totals

| Disposition | Records |
|---|---:|
| `current` | 59 |
| `resolved` | 12 |
| `superseded` | 14 |
| `insufficient` | 3 |
| `outside` | 30 |
| **Total** | **118** |
