# HC-CORTEX-VIZ-006 — Authenticated, origin-protected activity writes

- Project: `cdeust/cortex-viz`
- Category: `network-security`
- Subject: `authenticated-origin-protected-activity-writes`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `77037021ac27864a95fec23fc957c1553b2aa884`
- Research rule: `RESEARCH-PROCESS.md` §5b; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 1, 2, 8

## Observed condition

The standalone server explicitly exempts `/api/activity` from its same-origin
write check. Listener protection validates loopback host binding but does not
authenticate writers, and the installed producer hook sends no credential.

## Falsifiable hypothesis

A hostile web origin or unauthorized local process can submit forged activity
records to a running dashboard and contaminate its evidence stream.

## Why it matters

Observability becomes an attack surface when untrusted writers can alter the
record used for human supervision, benchmark evidence and incident analysis.

## Non-claims

This does not claim non-loopback binding is enabled by default or that forged
activity grants code execution. It does not prescribe a permanent account or
external identity provider.

## Reproduction protocol

Launch the production server and installed hook with a fresh declared local
credential. Execute the allowed hook request and denied requests for missing
and invalid credentials, hostile and absent Origin, form-compatible content
types, DNS-rebinding Host values, replay and an unauthorized local process.
From the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
and the matching `claude-harness` command. Run the installed matrix
separately for Claude and Codex. An external HTTP/database oracle compares
status, durable rows and audit events; a canary scanner checks logs and process
arguments for credential exposure. Preserve raw traffic and reports under
`artifacts/<release>/issues/HC-CORTEX-VIZ-006/raw/`. Stop immediately if any
denied canary becomes durable.

## Acceptance criteria

- The legitimate installed hook authenticates and creates exactly its expected
  durable event through both host configurations.
- Missing, invalid, replayed and unauthorized-local credentials are denied
  before persistence with stable auditable reasons.
- Hostile or absent Origin, unsafe content type and DNS-rebinding Host fixtures
  follow a documented allow/deny policy and cannot bypass writer authorization.
- Credentials are generated and stored in an owner-only local location, are
  replaceable, and never appear in URLs, logs, process arguments or exported
  activity payloads.
- Allowed and denied counters correlate HTTP and database outcomes without
  recording secret material; Claude and Codex results are scored separately.

## Regression obligation

The legitimate hook and smallest baseline-reproducing unauthorized write are
mandatory after hook, HTTP or credential changes. Transport or host-support
changes require the full origin, credential, replay and cross-host matrix.

## Evidence

- [Activity endpoint origin exemption](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_standalone.py)
- [Current listener host guard](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/server/http_security.py)
- [Unauthenticated producer hook](https://github.com/cdeust/cortex-viz/blob/77037021ac27864a95fec23fc957c1553b2aa884/cortex_viz/hooks/activity_capture.py)

## Dependencies and exclusions

Requires browser-origin control, disposable listener ports and isolated host
installations. Remote multi-user authorization and TLS termination are separate
deployment questions.

## Verdict ledger

- Origin exemption and missing writer authentication in source: `proven`
- Adversarial HTTP reproduction: `pending`
- Independent HTTP/database oracle: `pending`
- Regression: `pending`
