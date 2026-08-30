# HC-HARNESS-013 — DeepSeek Harness class and inclusion pilot

- Project: `cdeust/harness-comparison`
- Category: `integration`
- Subject: `deepseek-harness-inclusion-pilot`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `CAPSTONE-CHARTER.md` inclusion gate; `RESEARCH-PROCESS.md` §2
- Sovereignty dimensions: 1, 2, 3, 4, 6, 7, 8, 9, 10

## Observed condition

DeepSeek Harness's pinned source documents a standalone local runtime plus
partial Claude/Codex hook bridges and product-subagent providers. It also labels
the software developer preview and not security-audited. No capstone runtime
artifact currently establishes eligibility or safe matched execution.

## Falsifiable hypothesis

The pinned source can launch as an isolated complete harness, execute a matched
task under the capstone's model/provider and resource policies, and expose
auditable failure/security behavior; its Claude and Codex interoperability
surfaces can be evaluated separately without conflating them with the complete
harness result.

## Why it matters

The project is structurally relevant to sovereign orchestration: local runtime,
plugin architecture, provider routing, hooks and real-product subagents. Its
preview status and broad host authority also make security, isolation and
replaceability first-order inclusion questions.

## Non-claims

This dossier does not claim production readiness, security, cross-platform
support, adapter parity, market maturity or superiority. Source-level package
presence is not a successful runtime handshake.

## Reproduction protocol

1. Clone `deepseek-ai/deepseek-harness` at
   `0a53fb55bea101816fa226bb964ae2bed71c343b` in a disposable least-privilege
   environment; pin the resolved Node, pnpm and package graph.
2. Build and launch the standalone harness using the pinned source instructions.
   Record processes, listeners, stores, files, egress, credentials and telemetry.
3. Execute one no-model health/discovery cell and one matched model-backed task
   against the frozen oracle using the same model/provider policy and resources
   as the other complete units.
4. In separate profiles, execute the documented Claude and Codex hook bridges
   and subagent providers; record supported and unsupported semantics rather
   than pooling them with the standalone result.
5. Run malformed-plugin/config, denied-command, unavailable-network,
   cancellation/recovery, cross-project isolation and prompt-injection cells.
6. Only after safe pilot passage, execute the preregistered workload ladder and
   independent scoring. Preserve raw commands, outputs, timestamps, resource
   samples and hashes.

Stop and record `blocked` if containment is unavailable for the disclosed host
access, the model/provider policy cannot be matched, or credentials cannot be
scoped safely.

## Acceptance criteria

- The source build and standalone launch reproduce from a clean checkout with
  a fully hashed dependency and environment manifest.
- The same frozen task, model/provider policy, resource policy and oracle run
  across complete units; unavailable features remain explicit.
- Standalone, Claude-bridge and Codex-bridge artifacts are separate strata and
  identify semantic gaps, stores, egress, credentials and failure behavior.
- Adversarial cells record auditable allowed and denied outcomes for plugins,
  commands, paths, projects, network and secrets; the report repeats the
  project's disclosed non-audited preview status.
- The workload report includes throughput, p50/p95/p99, queueing, retries, CPU,
  memory, disk, connections, recovery and cost at preregistered levels.
- An independent reviewer assigns `keep`, `promote`, `defer` or `remove`
  separately for complete-harness comparison and Claude/Codex interoperability.

## Regression obligation

Repeat the standalone handshake and the affected interoperability handshake
when the source, dependency lock, host CLI or provider protocol changes. A
promoted complete harness joins the full matched-unit matrix; a promoted bridge
joins only its declared capability slice.

## Evidence

- [DeepSeek Harness reconnaissance card](../../../candidates/deepseek-ai-deepseek-harness.md)
- [Pinned DeepSeek Harness source](https://github.com/deepseek-ai/deepseek-harness/tree/0a53fb55bea101816fa226bb964ae2bed71c343b)
- [Project safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/SAFETY.md)
- [Candidate class and inclusion gate](../../../CAPSTONE-CHARTER.md)
- [Experimental-unit rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on HC-HARNESS-001, HC-HARNESS-002, HC-HARNESS-003 and HC-HARNESS-005.
No unsafe host-global run is authorized. Hosted-only features, unmatched model
policies and source claims without runtime artifacts are excluded.

## Verdict ledger

- Canonical source, license and preview disclosure: `proven`
- Standalone complete-harness handshake: `pending`
- Claude/Codex interoperability handshakes: `pending`
- Matched comparison and independent review: `pending`
- Regression: `pending`
