# Capstone issue-audit worklog

## Plan

- [x] Freeze the repository research contract as the normative audit rubric.
- [x] Reconcile the complete legacy inventory against pinned current source.
- [x] Consolidate current findings by product, category and root-cause subject.
- [x] Define external acceptance criteria and regression obligations for every
  active dossier.
- [x] Add a machine-checked public registry contract and issue form.
- [x] Add ECC and DeepSeek Harness to frontier watch through pinned candidate
  cards and class-specific inclusion pilots.
- [x] Validate local links, dossier indexes, proof vocabulary, isolation and
  Markdown integrity.
- [x] Obtain independent review through the pull request and merge only after
  approval.

## Review

- Legacy inventory: 118 records, with the complete disposition table in
  [`issues/AUDIT.md`](../issues/AUDIT.md).
- Active product work: 42 consolidated dossiers across the five-project AI
  Architect population.
- Benchmark and study work: 13 dossiers, including separate ECC and DeepSeek
  Harness inclusion pilots.
- Automated gate: 55 unique dossiers and 2 candidate cards; both host isolation
  validators pass.
- Publication status: source audit complete; runtime reproduction, matched
  comparison and independent scoring remain explicitly `pending`.

## Registry validator follow-up

- [x] Reproduce the ignored-runtime false-positive on merged `main`.
- [x] Add a regression proving ignored Markdown is excluded.
- [x] Prove untracked, non-ignored Markdown remains covered.
- [x] Make repository-wide Markdown discovery honor the Git source boundary.
- [x] Run the registry, host-isolation, privacy and diff gates.
- [ ] Publish the correction through a dedicated pull request.

### Validator review

- Before: 201 false link failures from 636 ignored third-party Markdown files
  under `codex-harness/runtime/` on the merged checkout.
- Regression: ignored broken Markdown leaves the validator green; untracked,
  non-ignored broken Markdown still fails and is named in stderr.
- After: the registry reports 55 valid dossiers and 2 candidate cards; both
  host-isolation validators and the diff/privacy gates pass.
- Independent read-only review found no merge blocker and confirmed that
  NUL-delimited `git ls-files` plus `execFileSync` avoids shell and platform
  quoting differences. A tracked file missing from a sparse or unstaged
  worktree can still produce an unhandled read error; controlled diagnostics
  for that separate edge remain future hardening.
