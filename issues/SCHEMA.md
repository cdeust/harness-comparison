# Issue dossier contract

## Exhibit head

Every dossier starts with these fields:

```text
- ID: HC-<PROJECT>-<NUMBER>
- Project: <canonical repository>
- Category: <registry category>
- Subject: <one defect or measurement gap>
- Population: INTERNAL | INDEPENDENT | BENCHMARK
- Evidence verdict: proven | pending | blocked | unsourced
- Priority: P0 | P1 | P2 | P3
- Source revision: <full commit SHA>
- Research rule: <repository Markdown path and section>
- Sovereignty dimensions: <numbered dimensions from CAPSTONE-CHARTER.md>
```

The ID is stable. Priority expresses execution order, not proof strength.

## Required specimen

Each dossier contains, in order:

1. **Observed condition** — the smallest factual statement supported at the
   pinned revision;
2. **Falsifiable hypothesis** — the failure the capstone will try to reproduce;
3. **Why it matters** — the metric, capability and sovereignty boundary at
   risk;
4. **Non-claims** — conclusions the current evidence does not permit;
5. **Reproduction protocol** — fixture/corpus, environment, command, oracle,
   raw output location and stop rule;
6. **Acceptance criteria** — externally observable pass conditions;
7. **Regression obligation** — the smallest benchmark slice and whether a full
   matrix rerun is required;
8. **Evidence** — immutable source links, artifacts and related public issues;
9. **Dependencies and exclusions** — prerequisites and explicit non-goals;
10. **Verdict ledger** — one line for source, reproduction, oracle and
    regression, each using `proven`, `pending`, `blocked` or `unsourced`.

## Acceptance criteria rules

Acceptance criteria must be executable or independently observable. They must
not be satisfied by the implementation describing itself as fixed.

- Functional criteria name the input fixture, expected output and independent
  oracle.
- Benchmark criteria pin corpus, model/provider policy, resource policy,
  repetitions and scoring rubric before execution.
- Scalability criteria state the workload ladder and report throughput,
  p50/p95/p99, queueing, retries, CPU, memory, disk, connections and recovery.
- Security criteria record both allowed and denied behavior with auditable
  logs, including the relevant adversarial case.
- Cross-host integration criteria pass separately on Claude and Codex with
  isolated mutable state.
- Numeric thresholds come from preregistration, cited research, or a published
  baseline. An issue must not invent a target after observing results.

## Lifecycle

`unsourced → pending → proven → fixed → regression-proven`

Only the four evidence verdicts are used in the ledger. `fixed` and
`regression-proven` describe engineering lifecycle events: the evidence
verdict remains `proven` and gains the fixing revision and regression artifact.
If current evidence disproves the hypothesis, the candidate is omitted from
the active registry and recorded in the audit summary as retired.
