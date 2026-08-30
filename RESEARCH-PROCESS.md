# Research-grade benchmark process

This repository follows a capstone/research-lab workflow. A benchmark result
is publishable only when every gate below passes. A useful-looking run that
fails a gate is retained as a pilot or negative result, never promoted to a
headline comparison.

## 1. Research question and hypotheses

State the question, the system boundary, the population of tasks, and the
primary metrics before touching result files. Record falsifiable hypotheses
and non-claims in a dated preregistration under `protocols/`.

## 2. Experimental units

The unit is selected per research question. A release may compare complete
solutions, focused subsystem implementations, or an internal product against
an external reference. It must never imply that a component is a competitor
unless the protocol explicitly declares that scope.

When product maturity or sovereignty is the question, the complete AI
Architect solution is evaluated as one unit: Cortex, cortex-viz,
ai-architect-mcp-codebase, ai-architect-mcp-spec, and zetetic-team-subagents.
The Harness A components are a baseline reference configuration for matched
capability tests, not a permanent taxonomy.

Candidate class is fixed before execution. A complete autonomous harness runs
as its own experimental unit; a portable harness layer or subsystem must pass
separate Claude and Codex handshakes and is scored only within its declared
capability boundary. Requiring a standalone harness to execute inside another
harness, or treating a host adapter as a complete stack, is a category error.

For every matched comparison, the declared units share the same corpus, task
prompts, resource policy, model, and scoring rubric. Internal components are
not counted as independent competitors.

## 3. Environment lock and isolation

Record repository SHAs, dirty state, model/provider, CLI versions, MCP/plugin
versions, OS/runtime versions, credentials scope, cache state, database state,
and process/port assignments. Claude and Codex must have separate config
roots, plugin caches, indexes, mutable stores, vaults, and telemetry service
identities. Run the static configuration gate before any networked cell.

## 4. Pilot and power check

Run one pilot per stack to validate that every tool is reachable and that the
measurement can be collected. Pilots are not scored. Define repetitions and
stopping rules before the main run; if the corpus is too small for statistical
inference, label the result directional and do not imply significance.

## 5. Main run

Execute cells in a pre-registered order. Capture raw tool responses, UTC
start/end, CPU/load/memory/disk brackets, peer processes, errors, retries, and
artifact hashes. Never use a fixed timeout as a success criterion for an
unbounded operation; record a timeout as a failure mode.

## 5a. Workload and scalability track

Define workload size, concurrent projects/sessions, tool-call rate, duration,
and a declared stop rule before running. Execute a load ladder from one
project/session to increasing concurrency. Measure throughput, p50/p95/p99
latency, queue depth, error/retry rate, CPU, memory, disk, database
connections, and cost per completed workflow. Record saturation and recovery
after load removal; never infer scalability from one successful session.

## 5b. Network and security track

Inventory every process, listener, outbound domain, credential, file and
database scope. Verify MCP transport boundaries, TLS, localhost binding, port
collisions, tenant isolation, data egress, secret redaction, path containment,
and behavior when a server/network is unavailable. Include adversarial tests
for repository prompt injection, malicious tool arguments, symlink escape,
cross-project memory reads, and unauthorized writes. Security claims require
observed allow/deny results and auditable logs.

## 6. Independent evaluation

Freeze source snapshots and the rubric before reading answers. A scorer that
did not operate the probe verifies every claim against source or an external
ground-truth ledger. Use `correct`, `partial`, `wrong`, and `no-answer`; retain
honest refusals as evidence. Run a contamination scan before publication.

## 7. Analysis and maturity

Report per-metric distributions, missingness, failures, confidence limits when
powered, and all deviations. A maturity score is a published rubric over
capabilities, not a hidden weighted average. Do not claim a winner when scope,
resources, or timing are not matched.

## 8. Artifact review and release

A release requires: preregistration, environment manifest, raw immutable data,
analysis scripts, independent scoring, negative log, reproducibility command,
review notes, and a change log. Tag the result as `PILOT`, `VERIFIED`, or
`PUBLISHED`; only `PUBLISHED` may enter the public issue registry as a
compared finding.

## 9. Issue and community loop

Every confirmed gap becomes a source-backed issue dossier with an
external acceptance test. After the fix, rerun the smallest affected slice,
then the full regression matrix when the protocol or stack boundary changed.
Public communication links to the exact evidence and states uncertainty.
