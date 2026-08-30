# Frontier candidate registry

This directory records projects worth investigating before they enter a scored
panel. A card is a source audit and experiment plan, not an endorsement.

## Status vocabulary

`RECONNAISSANCE → OBSERVED → COMPARED`

- `RECONNAISSANCE`: canonical source and claims are pinned; no local handshake
  has passed.
- `OBSERVED`: the class-appropriate clean handshake passed and raw artifacts
  are published.
- `COMPARED`: matched execution and independent scoring passed.

README statements remain author claims until reproduced. A candidate can be
`OBSERVED` as a portable layer and remain at `RECONNAISSANCE` as a complete
harness.

## Candidate classes

| Class | Required inclusion handshake |
|---|---|
| Complete harness | Clean standalone launch and matched task under the same model/provider, corpus, resources and rubric as the other complete units. |
| Portable harness layer or subsystem | Clean, isolated Claude handshake and clean, isolated Codex handshake for the declared capability. |

## Current cards

| Candidate | Proposed class | Source snapshot | Status | Inclusion dossier |
|---|---|---|---|---|
| [ECC](affaan-m-ecc.md) | portable layer; complete-harness scope to test | `d8e6a51755c6971a65eef73419076d449df0f490` | `RECONNAISSANCE` | [HC-HARNESS-012](../issues/harness-comparison/integration/ecc-inclusion-pilot.md) |
| [DeepSeek Harness](deepseek-ai-deepseek-harness.md) | complete harness; interoperability surface to test separately | `0a53fb55bea101816fa226bb964ae2bed71c343b` | `RECONNAISSANCE` | [HC-HARNESS-013](../issues/harness-comparison/integration/deepseek-harness-inclusion-pilot.md) |

The registry intentionally omits popularity counts: they are mutable and do
not establish validity, maturity, cross-platform behavior or sovereignty.
