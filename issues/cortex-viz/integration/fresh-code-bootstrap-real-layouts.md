# HC-CORTEX-VIZ-005 — Fresh-code bootstrap on real layouts

- Project: `cdeust/cortex-viz`
- Category: `integration`
- Subject: `fresh-code-bootstrap-real-layouts`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `WHOLE-STACK-PARITY.md` cross-host controls
- Sovereignty dimensions: 3, 6, 10

## Observed condition

Freshness detection and bootstrap search for a repository containing sibling
`mcp_server` and `ui` directories and spawn an `mcp_server` server path. The
actual cortex-viz source layout contains `cortex_viz` and `ui`, while Cortex has
`mcp_server` without that sibling UI. Current bootstrap tests fabricate the
older combined layout.

## Falsifiable hypothesis

A source checkout or installed package can launch stale or unavailable
visualization code because bootstrap cannot identify the real project layout or
prove which revision the running server serves.

## Why it matters

Cross-host parity and benchmark provenance fail if an apparently successful UI
run is detached from the source revision under evaluation.

## Non-claims

This does not claim every packaged installation fails or prescribe a monorepo.
It does not require editable installs when another deterministic freshness
contract is documented.

## Reproduction protocol

Using the pinned revision, build pristine fixtures for a cortex-viz source
checkout, a wheel installation, each host's declared cache/install layout and a
separate Cortex checkout. Run each through Claude and Codex with isolated
state. From the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
and the matching `claude-harness` command. Modify a visible source
canary, relaunch through the public tool and query the server identity endpoint.
An external process/package oracle compares executable, assets, source hash and
reported revision. Preserve manifests, commands, process trees and responses
under `artifacts/<release>/issues/HC-CORTEX-VIZ-005/raw/`. Stop on host-version
drift or any load from outside the fixture roots.

## Acceptance criteria

- Every supported real layout either launches the intended server or returns a
  stable explicit unavailable result; no fabricated sibling layout is needed.
- The running service exposes immutable build/source identity that the external
  oracle matches to executable and UI assets.
- After the source-canary edit, relaunch serves the changed artifact or fails
  with a freshness reason; it never reports success while serving stale code.
- Claude and Codex pass separately with isolated mutable state and recorded
  commands, environment manifests and host versions.
- Bootstrap tests use real repository/package shapes and retain the negative
  wrong-project and stale-cache fixtures.

## Regression obligation

The smallest source-checkout and package-layout fixtures are mandatory after
bootstrap or packaging changes. Host integration or layout changes require the
complete Claude/Codex installation matrix.

## Evidence

- [Freshness subtree assumptions](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/viz_instance.py)
- [Bootstrap root and server-path detection](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/visualize_bootstrap.py)
- [Public visualization launcher](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/handlers/open_visualization.py)
- [Current fabricated-layout coverage](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/tests/test_visualize_bootstrap_coverage_contracts.py)

## Dependencies and exclusions

Requires pinned Claude, Codex and packaging toolchains plus fresh install roots.
UI feature correctness after a verified launch is outside this dossier.

## Verdict ledger

- Bootstrap/real-layout mismatch in source: `proven`
- Installed-layout reproduction: `pending`
- Independent process/package oracle: `pending`
- Regression: `pending`
