# HC-HARNESS-012 — ECC class and inclusion pilot

- Project: `cdeust/harness-comparison`
- Category: `integration`
- Subject: `ecc-inclusion-pilot`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `CAPSTONE-CHARTER.md` inclusion gate; `RESEARCH-PROCESS.md` §2
- Sovereignty dimensions: 1, 2, 3, 6, 7, 8, 9

## Observed condition

ECC's pinned source documents separate Claude and Codex plugin paths and warns
against stacking installation methods. No clean capstone handshake has yet
established either host surface, and the declared experimental-unit class has
not been resolved beyond source claims.

## Falsifiable hypothesis

At least one isolated, version-pinned ECC installation can complete the same
declared capability handshake on Claude and Codex without duplicate files,
shared mutable state, unresolved assets or undeclared network/service behavior.

## Why it matters

ECC is a plausible cross-host market reference for harness procedures, hooks,
agents, memory and security. Excluding it without a pilot risks a stale panel;
promoting it from repository breadth would replace evidence with popularity.

## Non-claims

This dossier does not claim ECC is mature, feature-equivalent across hosts, a
complete harness, or better than AI Architect. It does not treat hosted product
features as open-source local capabilities.

## Reproduction protocol

1. Clone `affaan-m/ECC` at
   `d8e6a51755c6971a65eef73419076d449df0f490` in a disposable environment.
2. Preregister one supported install path per host; never layer native, guided,
   manual or legacy-sync paths in the same config root.
3. Capture pre/post file manifests, process/listener inventory, dependencies,
   credentials, egress and telemetry for each isolated host.
4. Execute the same no-model discovery probe and one model-backed capability
   task on Claude and Codex; use the frozen expected artifact as oracle.
5. Exercise uninstall/recovery, unavailable-network and malformed-config cells.
6. Run the preregistered workload and adversarial slices only after both clean
   handshakes pass. Store commands, stdout/stderr, timestamps, resource samples
   and hashes under the candidate pilot release.

Stop and record `blocked` if the selected path requires an undeclared paid
service, host-global destructive overwrite, unpinned dependency or unsafe
credential exposure.

## Acceptance criteria

- A reviewed candidate card declares ECC's tested class and exact capability
  boundary before model-backed execution.
- Clean, isolated Claude and Codex installs pass independently and leave no
  unowned or duplicate files; uninstall returns each disposable root to its
  recorded pre-install state except for declared logs.
- Both hosts complete the same probe with the same model/provider policy,
  prompt, fixture, resource policy and external oracle; unsupported behavior is
  recorded as `UNAVAILABLE`, not substituted.
- The artifact manifest records source/package hashes, config roots, processes,
  listeners, stores, egress, credentials, telemetry, failures and recovery.
- Workload, latency distribution, errors/retries, resources and model/tool cost
  are reported at the preregistered levels; security cells include observed
  allow and deny outcomes.
- An independent reviewer assigns `keep`, `promote`, `defer` or `remove` and
  states separately whether ECC qualifies as a portable layer and as a complete
  harness.

## Regression obligation

Repeat both host handshakes when the ECC source, package, host CLI or install
path changes. A promoted candidate joins the smallest matched capability slice;
class or protocol changes require the full comparison matrix.

## Evidence

- [ECC reconnaissance card](../../../candidates/affaan-m-ecc.md)
- [Pinned ECC source](https://github.com/affaan-m/ECC/tree/d8e6a51755c6971a65eef73419076d449df0f490)
- [Candidate class and inclusion gate](../../../CAPSTONE-CHARTER.md)
- [Experimental-unit rule](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on HC-HARNESS-001, HC-HARNESS-002 and HC-HARNESS-003. Hosted services,
unmatched model policies and layered install methods are excluded.

## Verdict ledger

- Canonical source and license: `proven`
- Claude handshake: `pending`
- Codex handshake: `pending`
- Matched comparison and independent review: `pending`
- Regression: `pending`
