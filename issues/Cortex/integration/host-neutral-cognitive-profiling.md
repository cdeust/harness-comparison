# HC-CORTEX-011 — Host-neutral cognitive profiling

- Project: `cdeust/Cortex`
- Category: `integration`
- Subject: `host-neutral-cognitive-profiling`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5, 6; `WHOLE-STACK-PARITY.md` cross-host controls
- Sovereignty dimensions: 3, 6, 10

## Observed condition

Profile rebuilding scans Claude project JSONL files from the Claude-specific
home layout. The documented host matrix permits other hosts to run with an
empty cognitive profile instead of ingesting a host-neutral activity stream.

## Falsifiable hypothesis

Matched work performed through Codex produces no equivalent profile evidence,
so methodology output differs because of host log availability rather than
observed behavior.

## Why it matters

A sovereign cognitive layer cannot make one supported harness its hidden
source of truth or silently degrade critical context when the operator changes
host.

## Non-claims

This does not require Claude and Codex transcript formats to match or profiles
from genuinely different behavior to be identical. It does not authorize
collecting prompts beyond the preregistered consent and redaction policy.

## Reproduction protocol

Replay a frozen, consented sequence of tool choices and outcomes separately
through isolated Claude and Codex installations. From the repository root, use
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`
and the matching `claude-harness` command, then rebuild profiles from each declared
adapter, and compare normalized evidence events, coverage, profile schema and
methodology output with an independent fixture oracle. Also run missing,
malformed and redacted-input cases. Preserve host manifests, normalized events,
redaction reports and outputs under
`artifacts/<release>/issues/HC-CORTEX-011/raw/`. Stop on fixture disclosure,
cross-host state reuse or version drift.

## Acceptance criteria

- Each host has a documented adapter that emits the same versioned,
  host-neutral evidence schema and never requires reading the other host's
  private directory.
- The matched fixture yields the preregistered event inventory and compatible
  profile fields on Claude and Codex, scored separately by the external oracle.
- Missing or malformed host evidence produces an explicit incomplete or
  unavailable status; it never masquerades as a valid empty profile.
- Consent, redaction and retention controls are applied before persistence,
  and the raw-artifact scan finds none of the seeded secret canaries.
- Rebuilding twice from the same immutable event set is idempotent and records
  input hashes and adapter versions.

## Regression obligation

The smallest baseline-reproducing matched and malformed fixtures per host are
mandatory after scanner, adapter or profile-schema changes. Host support
changes require the complete cross-host privacy and parity matrix.

## Evidence

- [Profile rebuild handler](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/handlers/rebuild_profiles.py)
- [Claude-specific session scanner](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/infrastructure/scanner.py)
- [Current host capability matrix](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/README.md)

## Dependencies and exclusions

Requires pinned, installed versions of both hosts and a synthetic consented
fixture. Behavioral equivalence of the host models themselves is excluded.

## Verdict ledger

- Claude-specific evidence scanner in source: `proven`
- Matched cross-host execution: `pending`
- Independent profile oracle: `pending`
- Regression: `pending`
