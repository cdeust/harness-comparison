# HC-HARNESS-005 — Executable adversarial network track

- Project: `cdeust/harness-comparison`
- Category: `network-security`
- Subject: `adversarial-network-track`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §5b
- Sovereignty dimensions: 2, 3, 6, 8

## Observed condition

The research process requires listener, egress, credential, isolation and
adversarial checks. The audited tree statically validates host configuration
separation but does not execute or manifest the complete network/security
track.

## Falsifiable hypothesis

A stack can pass Step 0 while still permitting an undeclared outbound request,
cross-project read, symlink escape, prompt-injected tool argument or
unauthorized write that this repository does not test.

## Why it matters

Local installation is not equivalent to local data control. Undeclared egress
or scope escape directly affects sovereignty and the validity of matched runs.

## Non-claims

No listed exploit is claimed to work against either stack. Passing the current
static validators is acknowledged and is not treated as runtime security proof.

## Reproduction protocol

Run each stack inside an instrumented, disposable environment with separate
credentials and state. Replay the same allowed and denied fixtures for outbound
domains, listeners, repository prompt injection, malicious tool arguments,
symlink traversal, cross-project memory access and unauthorized writes. Preserve
network, filesystem, database and tool audit logs.

## Acceptance criteria

- The manifest inventories processes, listeners, outbound domains, credentials,
  file scopes and database tenants before execution.
- Identical allowed actions succeed and identical forbidden actions fail closed
  on Claude and Codex, with stable reason codes and auditable logs.
- Tests cover TLS behavior, localhost binding, port collision, network loss,
  secret redaction, path containment, prompt injection, symlink escape,
  cross-project reads and unauthorized writes.
- Publication validation rejects missing allow/deny observations, undeclared
  egress or unredacted secrets.
- Raw evidence is privacy-scrubbed and content-addressed without weakening the
  negative tests.

## Regression obligation

Run the affected adversarial fixture after any transport, credential, storage or
sandbox change. Such boundary changes require the full security matrix before a
new sovereignty score is published.

## Evidence

- [Network and security contract](../../../RESEARCH-PROCESS.md)
- [Current static isolation validators](https://github.com/cdeust/harness-comparison/tree/3ab7c8d17044d8b3572fca2cfa705dcae182d16b)

## Dependencies and exclusions

Depends on HC-HARNESS-002. This issue defines the evaluation surface; it does not
prejudge product remediation.

## Verdict ledger

- Contract requirement: `proven`
- Static isolation gates: `proven`
- Runtime adversarial track: `pending`
- Regression: `pending`
