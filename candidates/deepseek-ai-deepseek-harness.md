# DeepSeek Harness reconnaissance card

- Status: `RECONNAISSANCE`
- Canonical repository: [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)
- Inspected source: [`0a53fb55bea101816fa226bb964ae2bed71c343b`](https://github.com/deepseek-ai/deepseek-harness/commit/0a53fb55bea101816fa226bb964ae2bed71c343b)
- Package version at source: `0.1.2-alpha.2`
- License: [`MIT`](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/LICENSE)
- Inspected: `2026-08-30`

## Question and scope

Does DeepSeek Harness qualify as a complete open-source harness comparison, and
what separately reproducible interoperability does it provide for Claude and
Codex hooks or subagents?

## Source ledger

| Source | Source observation | Limitation |
|---|---|---|
| [Pinned README](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/README.md) | Describes a standalone plugin-oriented harness, source and npm launch paths, and developer-preview status. | No capstone launch or task execution has run. |
| [Safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/SAFETY.md) | States that the preview has not undergone a security audit and may execute code, load plugins, and access exposed network, process, credential and file resources. | This is a disclosed risk, not an observed exploit or measured isolation result. |
| [Claude hooks bridge](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/packages/hooks/hooks-claude-code/README.md) | Documents a compatibility bridge for a subset of Claude Code hooks and enumerates unsupported behavior. | Project-authored contract; the bridge was not executed here. |
| [Codex hooks bridge](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/packages/hooks/hooks-codex/README.md) | Documents a compatibility bridge for a subset of Codex hooks and its limitations. | Project-authored contract; the bridge was not executed here. |
| [Claude subagent provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/packages/subagent/subagent-claude-code/README.md) and [Codex subagent provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a53fb55bea101816fa226bb964ae2bed71c343b/packages/subagent/subagent-codex/README.md) | Separate packages describe fresh-process delegation into real Claude Code and Codex children. | Source contracts do not prove local credentials, parity, reliability, cost or safe cancellation. |

## Evidence matrix

| Item | Observation | Interpretation | Current verdict |
|---|---|---|---|
| Canonical source and license | Public repository, immutable source SHA and MIT license were verified through GitHub. | Source can be pinned for a pilot. | `proven` |
| Complete harness | The source documents a standalone local launch and a plugin-oriented runtime. | It is a plausible complete-harness candidate. | `pending` runtime |
| Claude/Codex interoperability | Source includes distinct hook bridges and subagent-provider packages for both hosts. | Interoperability warrants a separate capability study, not automatic complete-harness parity. | `pending` runtime |
| Production/security maturity | The project labels itself developer preview and not security-audited. | No production-ready or secure claim is supportable. | `proven` non-claim |

## Claim map

- **Claim:** DeepSeek Harness is worth a high-priority complete-harness pilot
  plus a separately scoped Claude/Codex interoperability pilot.
- **Evidence:** the pinned source exposes a standalone launch, plugin runtime,
  two hook bridges and two product subagent providers.
- **Warrant:** a standalone, locally launchable harness with explicit adapter
  seams can be placed under the capstone's matched-unit protocol.
- **Qualifier:** source-supported, runtime-unobserved, developer preview.
- **Rebuttal:** the clean build or task may fail, provider/model matching may be
  impossible, or security and isolation failures may make comparison unsafe;
  any of those blocks or narrows promotion.

## Strongest counter-evidence

The project's own safety notice says it is experimental, not security-audited,
and capable of acting on files, credentials, processes and the network exposed
to it. The adapter documentation also lists partial compatibility. Those facts
preclude a maturity inference from architecture breadth alone.

## Uncertainty and blind spots

- No source build, npm launch or cross-platform run was executed for this card.
- No independent inventory of listeners, egress, credentials, telemetry,
  persistence or plugin trust has been captured.
- No matched model task, load ladder, recovery or adversarial cell has run.
- There is no GitHub release object at the inspection date; the pilot must pin
  the full source SHA and resolved package graph.

## Decision implication

Keep DeepSeek Harness in frontier watch and execute
[HC-HARNESS-013](../issues/harness-comparison/integration/deepseek-harness-inclusion-pilot.md).
Promotion as a complete harness and promotion of its interoperability surfaces
are separate decisions.
