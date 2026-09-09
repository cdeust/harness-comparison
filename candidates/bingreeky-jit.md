# JIT-Agent reconnaissance card

- Status: `RECONNAISSANCE`
- Canonical repository: [`bingreeky/JIT`](https://github.com/bingreeky/JIT)
- Inspected source: [`ababa06c2f54d799fd9fbc356e5368f61a452260`](https://github.com/bingreeky/JIT/commit/ababa06c2f54d799fd9fbc356e5368f61a452260)
- Package version at source: none declared; the repository is a research codebase without a release object
- License: [`MIT`, code only](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/LICENSE)
- Inspected: `2026-09-09`

## Question and scope

Does JIT-Agent's kernel and seed bank provide a standalone complete-harness unit
that can be placed under the capstone's matched-unit protocol, and can a custom
harness written against its four kernel protocols under this repository's
research contract be compared with a JIT seed harness as two complete units?

Two surfaces are in scope and must be decided separately:

1. A **seed harness** from the factory, executed verbatim on the shared kernel
   with no meta model, as a complete-harness candidate.
2. The **meta agent** that generates a harness per task, as a generation
   capability with its own model, prompt and selection surface.

Cortex as an implementation of the kernel's memory protocol is a portable-layer
question and is out of scope for this card.

## Source ledger

| Source | Source observation | Limitation |
|---|---|---|
| [Pinned README](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/README.md) | Describes a meta agent that emits a task-specific harness as five tagged code blocks over four modules (memory, planning, action, capability orchestration), revises it from traces at test time while the generator stays frozen, and reports a leaderboard across four benchmarks. | Author claims. No launch, task or score has been reproduced here. |
| [Factory README](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/harness_factory/README.md) | Eleven hand-written seed harnesses, five files each, installed verbatim and executed with no meta model; scoring, aggregation and resume are stated to be the same code the JIT pipeline uses. The design write-ups double as the meta model's generation prompt. | Comparability of seed and generated runs is a project statement, not yet observed. |
| [Kernel protocols](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/kernel/protocols.py) | Abstract base classes fix the module interface; `BaseMemory` (initialize, build context, update, update plan, update summary) and `BasePlanning` (initial plan, replan decision, plan update, directive) were inspected. | The action and tool-policy contracts were not read line by line. |
| [Evaluation runner](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/eval/runner.py) and [metrics](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/eval/metrics.py) | One `report.json` and a harness snapshot per (case, rollout) unit; resume keeps units with a report and re-runs only those whose error matches an infrastructure marker list; `--no-resume` disables it. The marker list includes `timed out` and `budget exceeded`. | A harness that exhausts its own model-call budget is re-run as an infrastructure failure, which conflates a harness defect with an environment fault. |
| [Selector](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/jit/selector.py) | Best-of-N choice is by summed log-probability under the meta model or by an LLM judge; the module states it is a pure model judgement with no benchmark score. | Selection is not an external signal under this repository's contract. |
| [Meta-agent loop](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/jit/meta_agent.py) | Generate, validate, repair. Validation executes the generated harness on one benchmark item through the runtime with a model-call budget of three times the step cap; a review panel of model experts votes pass or fail; repair regenerates from a token-budgeted trajectory. | Validation depth is one item; the review is a model vote. |
| [Token counter](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/kernel/token_counter.py) and [step record](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/scripts/kernel/types.py) | Token counts are tiktoken `cl100k_base` estimates regardless of the executing model, with a silent fallback to characters divided by four when tiktoken is absent; a step record carries input, output and total token estimates plus duration. | No energy, carbon or cost accounting exists; the estimate is not labelled as an estimate in artifacts. |
| [Environment](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/environment.yml) | Python 3.11. Serving a local meta model is excluded; the pipeline talks HTTP to an OpenAI-compatible endpoint for the meta, execution, judge and selector roles. | Model policy is caller-supplied; provider matching is the pilot's responsibility. |
| [License](https://github.com/bingreeky/JIT/blob/ababa06c2f54d799fd9fbc356e5368f61a452260/LICENSE) | MIT for the code; the note states benchmark data is redistributed under its own upstream licences. | Dataset licences must be checked per benchmark before any scored run. |
| Test suite | A search for `test_*.py` at the pinned source found no test file; dataset directories named `testbed` are fixtures. | The repository's own correctness evidence is execution, not tests. |

## Evidence matrix

| Item | Observation | Interpretation | Current verdict |
|---|---|---|---|
| Canonical source and license | Public repository, immutable source SHA and code-only MIT verified through GitHub. | Source can be pinned for a pilot; data licences are a separate check. | `proven` |
| Complete harness (seed) | The factory documents a standalone launch of a seed harness against an OpenAI-compatible endpoint with no meta model. | Plausible complete-harness unit. | `pending` runtime |
| Generation surface (meta agent) | Generate, execution-based validate, model-vote review, model-judgement selection. | A separate capability with its own model and prompt surface; it does not inherit the seed unit's class. | `pending` runtime |
| Resumability | Per-unit artifacts and an idempotent re-run policy are implemented in the shared runner. | Matches the capstone's step-level state requirement; the marker list needs scrutiny. | `pending` runtime |
| Efficiency accounting | Tokens and durations only, estimated rather than read from provider usage, with a silent unlabelled fallback. | No frugality claim can be derived from the project's own artifacts. | `proven` non-claim |
| Production and security maturity | No release object, no test suite, a research codebase. | No maturity or security claim is supportable. | `proven` non-claim |

## Claim map

- **Claim:** JIT-Agent warrants a complete-harness inclusion pilot for one seed
  harness, and provides a fixed kernel against which a custom harness written
  under this repository's research contract can be compared as a second
  complete unit.
- **Evidence:** the pinned source exposes a standalone seed launch, four fixed
  kernel protocols, per-unit artifacts with resume, and a shared scoring path
  declared identical for seed and generated runs.
- **Warrant:** two harnesses implemented against the same kernel protocols and
  executed by the same runner under one model policy are matched units in the
  sense of `RESEARCH-PROCESS.md` section 2.
- **Qualifier:** source-supported, runtime-unobserved, no release, no tests.
- **Rebuttal:** the clean launch may fail, the benchmark data licence may
  forbid use, provider matching may be impossible, or the estimated token ledger
  may prove unusable for a frugality comparison; any of those blocks or narrows
  promotion.

## Strongest counter-evidence

The project's selection and review steps are model judgements by its own
description, and its token accounting is an estimate with a silent fallback.
Under this repository's contract neither can serve as an evidence gate, so a
JIT run cannot be scored with JIT's own selector or ledger. The absence of a
test suite means every correctness statement about the kernel rests on
execution observed during the pilot.

## Uncertainty and blind spots

- No source build, environment creation or seed launch was executed for this
  card.
- The action and tool-policy protocol bodies were not inspected.
- Dataset licences for the four bundled benchmarks were not read.
- No independent inventory of listeners, egress, credentials or persistence
  has been captured.
- The custom harness this card anticipates does not exist yet; its class and
  gates are defined in the inclusion dossier, not here.

## Decision implication

Keep JIT-Agent in frontier watch and execute
[HC-HARNESS-014](../issues/harness-comparison/integration/jit-inclusion-pilot.md).
Promotion of a seed harness as a complete unit, promotion of the meta agent
as a generation capability, and the class of a Cortex-backed memory module
are three separate decisions.
