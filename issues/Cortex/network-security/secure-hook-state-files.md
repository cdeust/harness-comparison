# HC-CORTEX-005 — Secure hook state files

- Project: `cdeust/Cortex`
- Category: `network-security`
- Subject: `secure-hook-state-files`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `8f5ae3b87b6969f3abcb3736859febfdab69304a`
- Research rule: `RESEARCH-PROCESS.md` §5b
- Sovereignty dimensions: 2, 6, 8

## Observed condition

File-priming and post-commit hooks use predictable, shared `/tmp` JSON paths
and direct `Path.write_text` updates. The code neither creates an owner-only
state directory nor rejects a pre-existing symbolic link.

## Falsifiable hypothesis

A local adversary can pre-create the cooldown path as a symlink and cause a
hook to overwrite another writable file, or concurrent hooks can lose state
without an auditable error.

## Why it matters

Local execution does not provide sovereignty if hook-controlled paths escape
their owner boundary or mutable security state fails silently.

## Non-claims

This does not claim privilege escalation beyond the invoking user. It does not
prescribe a particular cross-platform cache library.

## Reproduction protocol

Inside disposable user accounts on supported operating systems, run allowed
state updates and denied fixtures for symlink pre-creation, wrong ownership,
permission mismatch, parallel writers, truncated JSON and process death during
write. From the repository root, invoke the preregistered cell with
`node codex-harness/run-isolated.mjs --harness B --cwd <pinned-checkout> --prompt-file <preregistered-cell>`.
An external filesystem oracle compares resolved targets, ownership, valid JSON
and canary hashes. Preserve filesystem
metadata, target hashes, stderr and allow/deny audit records under
`artifacts/<release>/issues/HC-CORTEX-005/raw/`. Stop immediately if a canary
outside the fixture root changes.

## Acceptance criteria

- Hook state resides in a per-user, owner-only directory resolved without
  following attacker-controlled links.
- The legitimate hook update succeeds and every symlink, ownership and path
  escape fixture fails closed with a stable auditable reason.
- Parallel and interrupted writes leave either the previous or next valid
  state, never truncated JSON or a lost acknowledged update.
- No canary outside the declared state root changes on macOS, Linux or Windows.
- Logs expose failure metadata while redacting repository content and secrets.

## Regression obligation

Run the symlink, parallel-write and crash fixtures after any hook-state or path
change. A new hook state file must enter the complete path-containment matrix.

## Evidence

- [Preemptive-context cooldown state](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/preemptive_context.py)
- [Post-commit cooldown state](https://github.com/cdeust/Cortex/blob/8f5ae3b87b6969f3abcb3736859febfdab69304a/mcp_server/hooks/post_commit_reindex.py)
- [`RESEARCH-PROCESS.md` network and security track](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Requires OS-specific disposable accounts or equivalent sandboxes. Database
tenant isolation and HTTP writer authentication are separate dossiers.

## Verdict ledger

- Predictable direct-write paths: `proven`
- Adversarial filesystem reproduction: `pending`
- Cross-platform allow/deny oracle: `pending`
- Regression: `pending`
