# HC-ZETETIC-003 — Strict frontmatter portability

- Project: `cdeust/zetetic-team-subagents`
- Category: `integration`
- Subject: `strict-frontmatter-portability`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P1`
- Source revision: `cfc8ef791d695866b9578a616cbf7f256b649d5a`
- Research rule: `RESEARCH-PROCESS.md` §§3, 8–9; `WHOLE-STACK-PARITY.md` experimental rule
- Sovereignty dimensions: 3, 6, 9

## Observed condition

A strict YAML parse of skill frontmatter at the pinned revision reports syntax
errors in exactly seven files: `skills/research/lab-notebook.md` and
`skills/compose/failure-resilient-design.md`, `conjecture-to-code.md`,
`performance-investigation.md`, `statistical-intervention.md`,
`anomaly-to-explanation.md`, and `product-quality-audit.md`. The existing agent
definition audit does not establish strict parsing of the complete skill tree.

## Falsifiable hypothesis

At least one clean Claude or Codex package discovery path will reject, omit, or
misread one of these skills while a permissive local check still reports the
bundle as healthy.

## Why it matters

Cross-host procedure availability is part of the complete-stack handshake.
Metadata accepted only by one parser creates an installation-dependent silent
capability gap and weakens provider replaceability.

## Non-claims

The source scan does not prove that either current host rejects all seven
files. It does not establish which YAML dialect the product should support.
No discovery count is claimed until clean packaged-host output is retained.

## Reproduction protocol

At the pinned checkout, scan every skill, agent, and command frontmatter using
a version-pinned strict YAML parser and a declared metadata schema. Preserve the
file-level parse result and parser version. The baseline scan must include all
seven named files and a valid control fixture. Then install the packaged bundle
into isolated Claude and Codex homes, enumerate discovered identifiers, and
attempt to retrieve one complete procedure from every affected file.

The independent oracle is the declared schema plus the pinned file set, not a
host's self-reported health. All inputs, parse errors, discovery output, exit
codes, and package hashes belong in the raw result. Freeze parser version,
host versions, repetitions, and stop rule before execution.

## Acceptance criteria

- A versioned full-tree validator parses every frontmatter block with the
  declared schema and returns zero syntax or schema failures for the release.
- A fixture containing an unquoted mapping delimiter fails with a stable
  machine-readable file, line, and rule identifier.
- Clean Claude and Codex package discovery enumerate the same expected IDs, or
  record a host-specific `UNAVAILABLE` capability without silently dropping a
  file.
- Each formerly failing procedure is retrievable in full with source revision
  and path through every supported host adapter.
- CI runs the same strict validator against the packaged artifact, not only the
  working tree, and retains the manifest hash.

## Regression obligation

Rerun the strict parser fixtures and affected discovery slice after a metadata
fix. A schema, parser, packaging, or host-adapter change requires full-tree
validation and the complete Claude and Codex discovery matrix.

## Evidence

- [Pinned skill tree](https://github.com/cdeust/zetetic-team-subagents/tree/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills)
- [Lab notebook frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/research/lab-notebook.md)
- [Failure-resilient design frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/failure-resilient-design.md)
- [Conjecture-to-code frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/conjecture-to-code.md)
- [Performance-investigation frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/performance-investigation.md)
- [Statistical-intervention frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/statistical-intervention.md)
- [Anomaly-to-explanation frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/anomaly-to-explanation.md)
- [Product-quality-audit frontmatter](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/skills/compose/product-quality-audit.md)

## Dependencies and exclusions

Depends on a declared metadata schema and reproducible packaged-host discovery
command. This dossier does not require identical internal parser
implementations and does not treat discovery alone as proof that a procedure
executes correctly.

## Verdict ledger

- Pinned source parse condition: `proven`
- Immutable parser artifact: `pending`
- Packaged Claude and Codex discovery: `pending`
- Full-tree regression: `pending`
