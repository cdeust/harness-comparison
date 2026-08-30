# ECC reconnaissance card

- Status: `RECONNAISSANCE`
- Canonical repository: [`affaan-m/ECC`](https://github.com/affaan-m/ECC)
- Inspected source: [`d8e6a51755c6971a65eef73419076d449df0f490`](https://github.com/affaan-m/ECC/commit/d8e6a51755c6971a65eef73419076d449df0f490)
- Release anchor: [`v2.2.0` at `5eddf1a3ffd311423be2d4ba7d26f7209c91b033`](https://github.com/affaan-m/ECC/releases/tag/v2.2.0)
- License: [`MIT`](https://github.com/affaan-m/ECC/blob/d8e6a51755c6971a65eef73419076d449df0f490/LICENSE)
- Inspected: `2026-08-30`

## Question and scope

Does ECC qualify as a reproducible portable harness layer for Claude and Codex,
and does its observed capability boundary justify a later complete-harness
comparison? The second question must not be assumed from the project's name.

## Source ledger

| Source | Source observation | Limitation |
|---|---|---|
| [Pinned README](https://github.com/affaan-m/ECC/blob/d8e6a51755c6971a65eef73419076d449df0f490/README.md) | Documents a native Claude plugin path, a native Codex marketplace path, a legacy Codex sync path, and warns not to stack install methods. | Project-authored documentation; no local handshake was run for this card. |
| [Claude plugin manifest](https://github.com/affaan-m/ECC/blob/d8e6a51755c6971a65eef73419076d449df0f490/.claude-plugin/plugin.json) | A Claude-specific distribution surface exists in the inspected tree. | Manifest presence does not prove installation or behavioral parity. |
| [Codex plugin manifest](https://github.com/affaan-m/ECC/blob/d8e6a51755c6971a65eef73419076d449df0f490/.codex-plugin/plugin.json) | A Codex-specific distribution surface exists in the inspected tree. | Manifest presence does not prove cache completeness or runtime skill loading. |
| [Release 2.2.0](https://github.com/affaan-m/ECC/releases/tag/v2.2.0) | The maintainer reports one guided installer and packaged lifecycle checks across Linux, macOS and Windows. | Release notes are author claims; the capstone has not reproduced the matrix. |

## Evidence matrix

| Item | Observation | Interpretation | Current verdict |
|---|---|---|---|
| Canonical source and license | Public repository, immutable source SHA and MIT license were verified through GitHub. | Source can be pinned for a pilot. | `proven` |
| Claude surface | Source and documentation expose a Claude plugin path. | ECC is a plausible Claude portable-layer candidate. | `pending` runtime |
| Codex surface | Source and documentation expose native and legacy Codex paths with an explicit no-stacking rule. | ECC is a plausible Codex portable-layer candidate, but install-path choice is an experimental factor. | `pending` runtime |
| Complete-harness scope | The project describes an engineering system spanning skills, agents, hooks, memory and security. | Breadth may justify a complete-unit study only after a capability-boundary inventory. | `unsourced` as a complete-unit claim |

## Claim map

- **Claim:** ECC is worth a high-priority inclusion pilot as a portable harness
  layer.
- **Evidence:** the inspected tree contains separate Claude and Codex plugin
  surfaces and the pinned README specifies distinct installation paths.
- **Warrant:** a candidate with explicit host-specific adapters can be tested
  through the capstone's cross-host handshake without inventing an adapter.
- **Qualifier:** source-supported, runtime-unobserved.
- **Rebuttal:** installation may fail, duplicate state, omit referenced assets,
  or expose materially different behavior across hosts; any of those blocks
  promotion.

## Strongest counter-evidence

The same README documents unequal support levels and warns that install methods
must not be combined. It also records upstream Codex cache/runtime limitations.
Therefore repository breadth and install documentation cannot establish parity,
maturity or complete-harness status.

## Uncertainty and blind spots

- No clean Claude or Codex installation was executed for this card.
- Data stores, egress, telemetry, credential scope and uninstall recovery have
  not been observed.
- No matched workload, load ladder, failure injection or adversarial security
  cell has run.
- The pilot must separate open-source local behavior from any hosted service.

## Decision implication

Keep ECC in frontier watch and execute [HC-HARNESS-012](../issues/harness-comparison/integration/ecc-inclusion-pilot.md).
Promote it only in the class or classes whose gates pass; publish failures as
negative evidence.
