# HC-ZETETIC-001 — Installed enforcement parity

- Project: `cdeust/zetetic-team-subagents`
- Category: `integration`
- Subject: `installed-enforcement-parity`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `cfc8ef791d695866b9578a616cbf7f256b649d5a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 5b, 8–9; `WHOLE-STACK-PARITY.md` experimental rule and operational parity gates
- Sovereignty dimensions: 2, 3, 6, 8, 9

## Observed condition

At the pinned revision, `hooks/hooks.json` registers the pre-tool and post-tool
deletion gates, while `.claude-plugin/plugin.json` does not. The setup script
can rewrite the plugin manifest from the hook manifest during installation, but
it leaves the plugin manifest unchanged when parsing or Python availability
fails. The Git-hook installer separately states that every fresh clone begins
unwired. The hook and command indexes also describe schemas and inventory that
do not match the pinned tree.

## Falsifiable hypothesis

A clean installation can expose a different enforcement and command surface
depending on installation path, host, or setup availability, allowing a
destructive edit to continue without the gate that the source manifest and
documentation claim is active.

## Why it matters

The benchmark treats a capability as available only after an external
handshake on both hosts. A source-only gate that is absent from the installed
surface is a silent-failure and reproducibility risk, not a working control.

## Non-claims

The source comparison does not prove that a normal marketplace installation
currently omits the deletion gates. It does not prove that every documented
command is unusable. Installation-time rewriting may repair part of the
manifest drift; the runtime matrix remains pending.

## Reproduction protocol

Check out the source revision into a clean clone. For each declared install
path, create a disposable home and isolated host configuration, record the
pre-install manifests, run `bash scripts/setup.sh install`, then record the
installed files and registered hook, command, agent, and skill identifiers.
Repeat separately through the version-pinned Claude and Codex adapters.

Use a fixture repository with one harmless edit and one deletion of a Python
definition that retains an untouched live caller. Exercise Edit, Write, Bash,
commit, and CI paths. The independent oracle is the normalized installed
surface plus the fixture's source-level caller ledger and observed allow or
deny result. Store raw host output, normalized manifests, file hashes, exit
codes, process and network inventory under the preregistered result directory.
Freeze repetitions and cell order before execution; stop only when an
environment health gate fails, and retain that failure.

## Acceptance criteria

- One declared authoritative manifest generates every shipped and installed
  hook surface; a versioned parity command reports no difference at the pinned
  revision.
- Clean Claude and Codex cells enumerate the expected surface independently;
  an unavailable host integration is recorded as `UNAVAILABLE`, not replaced
  silently.
- The harmless fixture is allowed and the live-caller deletion is denied at
  every applicable installed tier, with stable machine-readable reasons.
- A deliberately removed hook, stale command entry, malformed manifest, and
  unavailable setup dependency each produce a deterministic failing fixture;
  none is reported as a healthy installation.
- Documentation examples validate against the same schema and time units that
  the host consumes.
- The run publishes raw artifacts, hashes, errors, retries, duration, resource
  brackets, and an independent verdict for each host and install path.

## Regression obligation

Rerun the manifest-drift fixtures and the harmless/deletion pair after a fix.
A change to packaging, hook schema, install path, or host adapter requires the
full Claude and Codex integration matrix.

## Evidence

- [Plugin manifest at the pinned revision](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/.claude-plugin/plugin.json#L25-L134)
- [Authoritative hook entries, including both deletion tiers](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/hooks/hooks.json#L61-L118)
- [Installation-time manifest reconciliation and fail-open branches](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/scripts/setup.sh#L210-L271)
- [Fresh-clone Git-hook activation boundary](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/tools/install-git-hooks.sh#L14-L23)
- [Hook installation documentation at the pinned revision](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/hooks/README.md#L5-L54)
- [Command index at the pinned revision](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/commands/_index.md#L1-L25)
- [Cross-host availability rule](../../../WHOLE-STACK-PARITY.md)

## Dependencies and exclusions

Depends on a version-pinned packaged release and isolated Claude and Codex
adapters. This dossier does not redesign the deletion algorithm and does not
claim that Git hooks alone can enforce tool-level operations.

## Verdict ledger

- Pinned source divergence: `proven`
- Clean packaged-host reproduction: `pending`
- Independent allow and deny oracle: `pending`
- Cross-host regression: `pending`
