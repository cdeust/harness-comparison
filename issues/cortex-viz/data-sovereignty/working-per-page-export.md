# HC-CORTEX-VIZ-003 — Working per-page export

- Project: `cdeust/cortex-viz`
- Category: `data-sovereignty`
- Subject: `working-per-page-export`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P2`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 1, 3, 5

## Observed condition

The wiki interface presents per-page PDF, TeX, DOCX and HTML export controls
that call `/api/wiki/export`. The standalone wiki server at the pinned revision
does not route that endpoint. A separate whole-wiki static export command does
not implement the advertised page actions.

## Falsifiable hypothesis

Activating any advertised page export control fails to produce the requested
document from a real wiki page, or reports an unavailable route without a
useful failure reason.

## Why it matters

User-owned knowledge is not practically portable when visible export controls
do not correspond to an executable, testable server contract.

## Non-claims

This does not claim the whole-wiki static exporter is broken or require all
formats to share one conversion engine. Output fidelity thresholds must be
preregistered from fixtures or published baselines.

## Reproduction protocol

Create a wiki fixture containing headings, Unicode, links, code, tables and a
local image. Launch the production server and, from the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
to activate each visible page
export through a browser, then repeat with the declared converter dependency
missing and with traversal and symlink paths. The external oracle validates
response, media signature, filename, normalized content and path containment.
Preserve browser traces, responses and outputs under
`artifacts/<release>/issues/HC-CORTEX-VIZ-003/raw/`. Stop if the source fixture
hash changes or a path outside the fixture root is read.

## Acceptance criteria

- Every export control produces a non-empty document with the advertised media
  type, safe filename and preregistered fixture content through the production
  route.
- Conversion or dependency failure is visible in the UI and protocol response;
  it is never returned as an empty or successful document.
- Traversal, encoded traversal, absolute-path and symlink-escape fixtures are
  denied with auditable reasons and no external file content.
- The independent content oracle publishes format-specific differences and
  does not reduce them to a self-reported success flag.
- The existing whole-wiki exporter passes its frozen regression fixture after
  the page-route change.

## Regression obligation

The smallest page fixture for every advertised format and the path-escape case
are mandatory after UI, wiki route or exporter changes. Format-set changes
require the complete browser and dependency matrix.

## Evidence

- [Per-page export controls and endpoint calls](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/ui/unified/js/wiki.js)
- [Standalone wiki route table](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_standalone_wiki.py)
- [Whole-wiki command entry point](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/__main__.py)

## Dependencies and exclusions

Requires browser automation and only the converter dependencies declared by
the frozen environment manifest. Pixel-identical rendering and cloud document
providers are excluded.

## Verdict ledger

- UI/server route mismatch in source: `proven`
- Browser export reproduction: `pending`
- Independent document oracle: `pending`
- Regression: `pending`
