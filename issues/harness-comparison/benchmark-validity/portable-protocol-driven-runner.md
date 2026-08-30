# HC-HARNESS-001 — Portable, protocol-driven runner

- Project: `cdeust/harness-comparison`
- Category: `benchmark-validity`
- Subject: `portable-protocol-driven-runner`
- Population: `BENCHMARK`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `3ab7c8d17044d8b3572fca2cfa705dcae182d16b`
- Research rule: `RESEARCH-PROCESS.md` §§1, 3, 5; `CORPUS-DESIGN.md` acceptance gate
- Sovereignty dimensions: 2, 3, 9

## Observed condition

The Codex probe runner fixes the result revision, a workstation-specific corpus
root and the five internal repositories in source. Three prompt templates also
write to a workstation-specific historical result directory. The runner cannot
therefore consume a newly preregistered independent corpus from a clean clone
without source edits.

## Falsifiable hypothesis

A clean clone at a different filesystem location cannot configure and dry-run
an arbitrary pinned Track R corpus solely through a versioned protocol file.

## Why it matters

Location- and revision-specific source prevents independent reproduction and
couples the primary external track to the internal dogfooding corpus.

## Non-claims

This does not claim that the existing isolation mechanisms fail. Both static
isolation validators pass at the audited revision. It does not validate any
historical result directory.

## Reproduction protocol

1. Clone the audited revision to a non-author-specific filesystem path.
2. Create a minimal protocol containing one pinned public repository, a release
   identifier and a temporary output root.
3. Invoke the Codex and Claude runners in dry-run/plan mode without editing
   JavaScript or prompt files.
4. Use the protocol and generated execution plan as the oracle; capture stdout,
   exit status and hashes under the release artifact directory.

Stop after the first source edit or unresolved absolute path is required.

## Acceptance criteria

- A versioned protocol schema supplies population, repositories with full SHAs,
  cells, adapters, release identifier and output root.
- Both host runners consume the same protocol and generate the same ordered cell
  identities without source changes.
- A clean-clone test runs from a non-author path and fails on every unresolved
  placeholder or unpinned repository.
- Repository search finds no author-specific absolute path or historical result
  revision in executable runners and prompts.
- Generated artifacts record the protocol hash and runner revision.

## Regression obligation

Run both static isolation validators and one Step 0 plus one no-model dry-run per
host. Because this changes the protocol boundary, the next scored release must
execute the full matched matrix.

## Evidence

- [Hard-coded result and corpus roots](https://github.com/cdeust/harness-comparison/blob/3ab7c8d17044d8b3572fca2cfa705dcae182d16b/codex-harness/run-probes-sequential.mjs#L20-L25)
- [Hard-coded Step 0 output](https://github.com/cdeust/harness-comparison/blob/3ab7c8d17044d8b3572fca2cfa705dcae182d16b/codex-harness/prompts/step0-a.md#L19-L24)
- [`CORPUS-DESIGN.md` acceptance gate](../../../CORPUS-DESIGN.md)

## Dependencies and exclusions

Depends on HC-HARNESS-002 for the protocol schema. Installing or evaluating a
new external candidate is outside this issue.

## Verdict ledger

- Source condition: `proven`
- Cross-path reproduction: `pending`
- External oracle: `pending`
- Regression: `pending`
