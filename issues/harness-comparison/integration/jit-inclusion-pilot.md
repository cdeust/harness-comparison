# HC-HARNESS-014 — JIT kernel class and custom-harness inclusion pilot

- Project: `cdeust/harness-comparison`
- Category: `integration`
- Subject: `jit-inclusion-pilot`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `CAPSTONE-CHARTER.md` inclusion gate; `RESEARCH-PROCESS.md` §2 and §4; `tasks/lessons.md` rules 2, 3 and 5
- Sovereignty dimensions: 1, 2, 3, 4, 6, 7, 9

## Observed condition

JIT-Agent's pinned source (`ababa06c2f54d799fd9fbc356e5368f61a452260`) fixes
four kernel protocols, ships eleven seed harnesses that launch standalone
against an OpenAI-compatible endpoint, and persists one report and one harness
snapshot per (case, rollout) unit with an idempotent resume. Its selection and
review steps are model judgements by its own description, its token ledger is
a tiktoken estimate with a silent character-count fallback, and it carries no
test suite. No clean launch has been executed under this repository's contract,
and no harness written against those protocols under this contract exists yet.

## Falsifiable hypothesis

One seed harness from the factory and one custom harness written against the
same kernel protocols under this repository's gates can both complete a clean
standalone launch and the same matched task under one declared model/provider
policy, with per-unit artifacts scored by an independent oracle rather than by
JIT's selector, and with every token figure either read from provider usage or
labelled as an estimate.

## Why it matters

The capstone needs at least one complete-harness unit that is not a host
plugin, so that the whole-stack comparison is not a category error. A fixed
kernel with a documented module contract is the cheapest way to obtain two
matched complete units that differ in exactly the design choices under test.
It also puts demand reduction, the largest efficiency term of an LLM-assisted
workflow, on the same measured footing for both units, provided the ledger is
rebuilt from observable usage rather than estimates.

## Non-claims

This dossier does not claim that JIT-Agent is mature, secure, or better than
any AI Architect component. It does not use the README leaderboard as
evidence. It does not claim that the custom harness exists, that Cortex is a
valid implementation of the kernel's memory protocol, or that any JIT-estimated
token count is a measurement. It does not treat the meta agent's generation
surface as part of the seed unit's class.

## Reproduction protocol

1. Clone `bingreeky/JIT` at `ababa06c2f54d799fd9fbc356e5368f61a452260` in a
   disposable environment and create the declared Python 3.11 environment
   from `environment.yml`. Record the resolved package graph.
2. Read and record the licence of every bundled benchmark named in the
   repository's data provenance table before any dataset is fetched. Stop and
   record `blocked` if a licence forbids the intended use.
3. Preregister one OpenAI-compatible model/provider policy for the execution,
   judge and, if used, selector roles, and apply the identical policy to both
   units. No hosted meta model is used for the seed unit.
4. Unit A: install one factory seed harness verbatim with the seed runner and
   execute the matched task slice. Unit B: install the custom harness written
   against the same four protocols, having first passed this repository's
   static gates, and execute the same slice with the same runner, model policy
   and resource policy.
5. Capture per unit: the runner's report, harness snapshot, scores and summary
   files; UTC start and end; CPU, load, memory and disk brackets; peer
   processes; and every model call's provider usage fields where the endpoint
   returns them. Mark any token count that comes from the kernel's tiktoken
   path as `estimated` in the ledger row.
6. Score every unit with the benchmark's evaluator in a separate process. JIT's
   log-probability and judge selectors are not used for scoring. Preserve every
   failure in a negative-result log.
7. Run the contamination sweep over both units before their scores are
   published.

Stop and record `blocked` if the endpoint requires an undeclared paid service,
if the seed runner and the custom unit cannot be driven by the same command
surface, if a `budget exceeded` or `timed out` unit is silently re-run by the
resume path instead of being preserved as a failure, or if any credential or
dataset licence exposure is unsafe.

## Acceptance criteria

- A reviewed candidate card declares the seed unit's class and the generation
  surface's separate class before any model-backed execution.
- The custom harness passes the repository's static gates on its own pull
  request before it is executed: schema-validated protocol reference, no
  unpinned dependency, sourced constants, and an executable regression test
  for each kernel protocol it implements.
- Both units complete a clean standalone launch with exit code zero and produce
  the runner's report, scores and summary files under a fresh output root.
- Both units share one recorded model/provider policy hash, one corpus hash,
  one resource policy and one rubric; unsupported behaviour is recorded as
  `UNAVAILABLE`, not substituted.
- Every ledger row carries a `source` of `provider-usage` or `estimated`, and no
  frugality statement is derived from a row marked `estimated`.
- Slice size, step cap, repetitions and any timeout are preregistered from the
  pilot's own measurements or cited research before the scored run; none is
  chosen after observing results.
- An independent reviewer assigns `keep`, `promote`, `defer` or `remove` and
  states separately whether the seed harness qualifies as a complete unit,
  whether the custom harness does, and whether the meta agent's generation
  surface warrants its own study.

## Regression obligation

Repeat the clean launch for both units when the JIT source, the kernel
protocols, the custom harness, the model policy or the runner changes. A
promoted unit joins the smallest matched capability slice; a protocol or
class change requires the full comparison matrix.

## Evidence

- [JIT-Agent reconnaissance card](../../../candidates/bingreeky-jit.md)
- [Pinned JIT source](https://github.com/bingreeky/JIT/tree/ababa06c2f54d799fd9fbc356e5368f61a452260)
- [Kernel protocols at the pin](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/kernel/protocols.py)
- [Shared runner and resume at the pin](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/eval/runner.py)
- [Candidate class and inclusion gate](../../../CAPSTONE-CHARTER.md)
- [Experimental-unit and pilot rules](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on HC-HARNESS-001, HC-HARNESS-002, HC-HARNESS-003 and HC-HARNESS-006.
The custom harness must exist and pass its own gates before step 4 of the
protocol can run. Excluded: the hosted JIT meta-model checkpoints, the README
leaderboard, execution of either unit inside Claude Code or Codex, and any
scoring that uses JIT's selector or its estimated token ledger.

## Verdict ledger

- Canonical source and license: `proven`
- Seed harness clean launch: `pending`
- Custom harness gates and clean launch: `pending`
- Matched execution and independent scoring: `pending`
- Regression: `pending`
