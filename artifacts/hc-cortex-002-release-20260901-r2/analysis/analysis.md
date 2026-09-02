# HC-CORTEX-002 independent analysis

Generated: 2026-09-01T20:48:26.016Z

Study verdict: **PASS**. Causal contrast: **PASS**. This issue-specific analysis deliberately computes no aggregate maturity score.

| Cell | Expected | Observed | Correctness | Evidence |
| --- | --- | --- | --- | --- |
| regression-baseline-sqlite-c2 | blocked | blocked | FAIL | complete |
| regression-candidate-sqlite-c2 | proven | proven | PASS | complete |
| main-r1-sqlite-c1 | proven | proven | PASS | complete |
| main-r1-sqlite-c2 | proven | proven | PASS | complete |
| main-r1-sqlite-c4 | proven | proven | PASS | complete |
| main-r1-sqlite-c5 | proven | proven | PASS | complete |
| main-r1-postgresql-c1 | proven | proven | PASS | complete |
| main-r1-postgresql-c2 | proven | proven | PASS | complete |
| main-r1-postgresql-c4 | proven | proven | PASS | complete |
| main-r1-postgresql-c5 | proven | proven | PASS | complete |
| main-r2-postgresql-c1 | proven | proven | PASS | complete |
| main-r2-postgresql-c2 | proven | proven | PASS | complete |
| main-r2-postgresql-c4 | proven | proven | PASS | complete |
| main-r2-postgresql-c5 | proven | proven | PASS | complete |
| main-r2-sqlite-c1 | proven | proven | PASS | complete |
| main-r2-sqlite-c2 | proven | proven | PASS | complete |
| main-r2-sqlite-c4 | proven | proven | PASS | complete |
| main-r2-sqlite-c5 | proven | proven | PASS | complete |

## Descriptive saturation

- sqlite: OBSERVED at concurrency 5
- postgresql: NOT_OBSERVED

Declared deviations and non-claims are preserved verbatim in `analysis/analysis.json` and `analysis/negative-evidence.json`.
