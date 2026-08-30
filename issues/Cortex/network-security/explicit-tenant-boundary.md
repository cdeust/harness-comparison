# HC-CORTEX-010 — Explicit tenant boundary

- Project: `cdeust/Cortex`
- Category: `network-security`
- Subject: `explicit-tenant-boundary`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §5b; `CAPSTONE-CHARTER.md` sovereignty scorecard
- Sovereignty dimensions: 1, 2, 8

## Observed condition

Project-root scoping is implemented for memory operations, but the pinned
source does not define an authenticated application or tenant identity, an
authorization policy, or row-level tenant enforcement. Project documentation
therefore limits the supported trust boundary to local use.

## Falsifiable hypothesis

If Cortex is exposed through a shared service or common database, one client
can read or mutate another client's records because a project path is treated
as scope rather than authenticated authority.

## Why it matters

Local-first operation is sovereign only when the supported boundary is
explicit and shared deployments either isolate data or fail closed instead of
implying protection they do not provide.

## Non-claims

This does not claim the documented single-user stdio deployment is remotely
exploitable. It does not require multi-tenancy if shared service mode remains
explicitly unavailable.

## Reproduction protocol

Provision identities A and B with separate project roots and canary memories,
then run the allowed and denied matrix through isolated Claude and Codex
adapters. From the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
and the matching `claude-harness` command. Repeat for direct
stdio, any declared listener mode and a shared PostgreSQL deployment; attempt
path aliases, forged root metadata and direct ID access. An external database
and protocol oracle records returned content, mutations and audit events under
`artifacts/<release>/issues/HC-CORTEX-010/raw/`. Stop on any cross-identity
canary disclosure or mutation.

## Acceptance criteria

- The supported trust and deployment boundary is machine-readable and
  documented; unsupported shared modes refuse startup or requests with a
  stable `UNAVAILABLE` result.
- In every supported shared mode, authenticated identity A can access its own
  fixture while missing, invalid and identity-B credentials are denied before
  query or mutation.
- Project-root aliases, forged metadata and direct foreign IDs cannot cross
  the boundary, as verified independently in the database and tool responses.
- Allowed and denied events carry correlation, identity class, scope and
  reason without logging credentials or memory content.
- Claude and Codex pass separate matrices with isolated mutable state; no pass
  in one host substitutes for the other.

## Regression obligation

The own-record, foreign-record and forged-root cases are mandatory after scope,
transport or storage changes. Adding a shared mode requires the full host,
backend and adversarial matrix.

## Evidence

- [Rooted scoping coverage](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/tests_py/handlers/test_connection_rooted_scoping.py)
- [Documented local trust boundary](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/README.md)
- [Local managed-agent architecture decision](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/docs/adr/ADR-0049-cortex-stays-local-managed-agents-migration.md)

## Dependencies and exclusions

Requires disposable OS identities or equivalent containers and separate host
configurations. Enterprise identity-provider selection and public cloud
hosting are excluded.

## Verdict ledger

- Missing authenticated tenant policy in source: `proven`
- Supported-mode adversarial execution: `pending`
- Independent isolation oracle: `pending`
- Regression: `pending`
