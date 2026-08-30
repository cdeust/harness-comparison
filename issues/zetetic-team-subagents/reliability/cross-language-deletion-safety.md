# HC-ZETETIC-005 — Cross-language deletion safety

- Project: `cdeust/zetetic-team-subagents`
- Category: `reliability`
- Subject: `cross-language-deletion-safety`
- Population: `INTERNAL`
- Evidence verdict: `pending`
- Priority: `P0`
- Source revision: `cfc8ef791d695866b9578a616cbf7f256b649d5a`
- Research rule: `RESEARCH-PROCESS.md` §§5b, 6, 9; `CORPUS-DESIGN.md` Track R language strata
- Sovereignty dimensions: 4, 6, 8

## Observed condition

The deletion gate's language registry recognizes Python, JavaScript and
TypeScript, Rust, and shell. Other corpus languages are returned as out of
scope. The evaluator also removes every file touched by the same change from
the set of dangerous surviving callers, without distinguishing a repaired call
from an unrelated edit that leaves the deleted symbol referenced.

## Falsifiable hypothesis

A deletion with a live caller in an undeclared language, or in a caller file
that the same diff touches without repairing, can pass the gate without an
explicit unavailable verdict even though an independent source or build oracle
still finds the dangling call.

## Why it matters

The capstone corpus intentionally spans languages with different resolvers.
A safety claim that silently skips part of that corpus or masks a same-diff
caller can turn a destructive regression into a reported pass.

## Non-claims

The source inspection does not establish a false-negative rate and does not
prove that each omitted language must be implemented with regex parsing. It
does not claim that a touched caller is always dangerous; a correctly repaired
call is a required negative control.

## Reproduction protocol

Create pinned, minimal repositories for every declared supported language plus
Go, Java, C, C++, Swift, Kotlin, and Ruby. Each language receives a live-caller
deletion, safe rename or move, justified retirement, malformed source, and
unavailable-parser fixture. Add two same-diff cases: one repairs the caller and
one changes the caller file without removing the dangling reference.

For each committed fixture, run
`python3 tools/deletion_gate.py --repo <fixture> --base <base> --head <head>`.
Exercise the equivalent Edit, Write, Bash, commit, and CI tiers where supported.
The independent oracle is the pinned caller ledger plus the language's parser,
compiler, or test result. Preserve inputs, stdout, stderr, exit status, detected
language, allow or deny decision, timing, and resource brackets. Freeze
repetitions, exclusions, and stop rules before execution.

## Acceptance criteria

- The release publishes an explicit language support matrix; every skipped
  language produces a machine-readable `UNAVAILABLE` result rather than a
  silent pass.
- For every declared supported language, the live-caller fixture is denied and
  the safe rename, repaired caller, and justified retirement controls pass.
- The same-diff unrepaired caller is denied; touching a file alone cannot exempt
  a surviving call, while a genuinely repaired caller remains allowed.
- Malformed source, unreadable Git state, gate outage, symlink escape, and path
  containment fixtures produce the preregistered fail-closed result with an
  auditable reason.
- Reports publish per-language true positives, false positives, false
  negatives, true negatives, missingness, latency distributions, errors, and
  resource use; no aggregate hides an unsupported language.

## Regression obligation

Rerun the affected language and same-diff slice after a parser or evaluator
fix. Registry, diff, path, hook-tier, or corpus-language changes require the
full cross-language and adversarial matrix.

## Evidence

- [Language registry at the pinned revision](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/tools/deletion_gate_lang.py#L18-L66)
- [Touched-file exemption](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/tools/deletion_gate.py#L308-L321)
- [Existing three-tier deletion-gate tests](https://github.com/cdeust/zetetic-team-subagents/blob/cfc8ef791d695866b9578a616cbf7f256b649d5a/tools/tests/deletion-gate/run-tests.sh)
- [Cross-language corpus requirement](../../../CORPUS-DESIGN.md)
- [Adversarial security requirements](../../../RESEARCH-PROCESS.md)

## Dependencies and exclusions

Depends on a frozen fixture corpus and independent language oracles. This
dossier does not require every language to share one parser and does not treat
unsupported coverage as an implementation failure when it is explicit and
scored as unavailable.

## Verdict ledger

- Registry and touched-file behavior at source: `proven`
- Cross-language fixture execution: `pending`
- Independent caller and build oracle: `pending`
- Full tier regression: `pending`
