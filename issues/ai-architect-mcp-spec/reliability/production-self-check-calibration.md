# HC-AIASPEC-007 — Production self-check calibration

- Project: `cdeust/ai-architect-mcp-spec`
- Category: `reliability`
- Subject: `production-self-check-calibration`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `e5c163b74e73e09c52ae26524905a0fa4c8efd13`
- Research rule: RESEARCH-PROCESS.md §4, §6 and §7
- Sovereignty dimensions: 4, 5, 6

## Observed condition

The internal self-check path concludes verification without the reliability
options constructed for the external conclusion endpoint. Observation mapping
also records a constant judge confidence rather than a measured value. The
calibration machinery is therefore not demonstrated in the production
self-check loop at the pinned revision.

## Falsifiable hypothesis

The complete pipeline can finish with uncalibrated judge aggregation and
synthetic confidence observations even though a separately invoked endpoint
supports reliability inputs.

## Why it matters

Unwired calibration creates a maturity illusion: components exist, but the
autonomous decision path does not consume their evidence. This directly affects
critical reasoning, provenance, and failure transparency.

## Non-claims

Calibration is not assumed to improve quality before a powered held-out study.
No judge model, confidence estimator, or decision threshold is prescribed.

## Reproduction protocol

- Before the pilot, preregister the pinned fixture, exact executable command or
  MCP request sequence, model/provider policy (including no model for a
  deterministic cell), resource policy, repetitions, scoring rubric, and stop
  rule. Any change creates a new protocol revision.
- Freeze an external held-out claim corpus with independent truth labels and a
  preregistered split that is sealed before pipeline execution.
- Run controlled self-check arms with the pinned production path and the
  versioned calibrated path under identical model, prompts, resources, and
  host configuration.
- Record actual judge confidence, reliability-provider inputs, aggregation,
  decisions, observations, errors, and fallback behavior. Recompute
  calibration/error metrics with an independent scorer.
- Restart, export, and replay the observation store; also execute a deliberately
  unavailable-store arm.
- Preserve seals, manifests, raw verdicts, provider data, scorer output,
  distributions, confidence intervals when powered, and hashes under
  `results/<protocol-id>/raw/`. Apply preregistered repetitions and stop rules.

## Acceptance criteria

- The production self-check path consumes the versioned reliability provider
  or returns an explicit degraded/unavailable status; wiring is visible in raw
  action and observation artifacts.
- Stored judge confidence is the measured input used by aggregation, with
  provenance to judge call and model revision; constants are not substituted.
- Export/restart/replay reproduces decisions and observations exactly, while an
  unavailable store degrades explicitly without fabricating calibration.
- Before/after/calibration arms publish per-metric distributions, missingness,
  failures, and powered confidence limits. No reliability gain is claimed when
  the preregistered power or threshold gate is unmet.

## Regression obligation

Run the smallest baseline-reproducing sealed self-check calibration fixture
after provider, orchestration, observation, judge, or storage changes. Any
decision-policy or schema change requires the complete held-out and cross-host
matrix.

## Evidence

- [Production self-check handler](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/orchestration/src/handlers/self-check.ts)
- [Reliability option builder](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/mcp-server/src/build-conclude-opts.ts)
- [Verification observations](https://github.com/cdeust/ai-architect-mcp-spec/blob/e5c163b74e73e09c52ae26524905a0fa4c8efd13/packages/verification/src/orchestrator.ts)
- [Pilot and evaluation rules](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a sealed external truth corpus, independent scorer, and versioned
reliability/observation schemas. Selecting or fine-tuning judge models is
excluded.

## Verdict ledger

- Pinned-source wiring observation: `proven`
- External controlled reproduction: `pending`
- Independent calibration scorer: `pending`
- Production-loop regression: `pending`
