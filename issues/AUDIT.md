# Current-source issue audit — 2026-08-30

## Scope

The audit reviewed 118 legacy engineering records as candidate hypotheses. It
did not accept their open/closed state, original wording or historical evidence
as proof. Every candidate was rebound to the current public source of the
affected project, then tested against the research contract at
`harness-comparison@3ab7c8d17044d8b3572fca2cfa705dcae182d16b`.

The inspected product revisions are:

| Project | Audited revision |
|---|---|
| Cortex | [`8f5ae3b87b6969f3abcb3736859febfdab69304a`](https://github.com/cdeust/Cortex/commit/8f5ae3b87b6969f3abcb3736859febfdab69304a) |
| cortex-viz | [`77037021ac27864a95fec23fc957c1553b2aa884`](https://github.com/cdeust/cortex-viz/commit/77037021ac27864a95fec23fc957c1553b2aa884) |
| ai-architect-mcp-codebase | [`f6286875ac5fb37a3be52d5778fb2ce19655ff03`](https://github.com/cdeust/ai-architect-mcp-codebase/commit/f6286875ac5fb37a3be52d5778fb2ce19655ff03) |
| ai-architect-mcp-spec | [`e5c163b74e73e09c52ae26524905a0fa4c8efd13`](https://github.com/cdeust/ai-architect-mcp-spec/commit/e5c163b74e73e09c52ae26524905a0fa4c8efd13) |
| zetetic-team-subagents | [`cfc8ef791d695866b9578a616cbf7f256b649d5a`](https://github.com/cdeust/zetetic-team-subagents/commit/cfc8ef791d695866b9578a616cbf7f256b649d5a) |

Pull requests and change records were excluded before classification. The
record-level ledger uses opaque legacy IDs without linking back to a non-public
system.

## Disposition rules

- **Current source condition**: a distinct, checkable condition survives at the
  pinned source and maps to one active dossier.
- **Resolved**: current source or a reproduced current test refutes the legacy
  condition; no active dossier remains.
- **Superseded or duplicate**: the record is redundant, over-broad, or replaced
  by a more precise dossier/study; it is not counted again as an active finding.
- **Insufficient current evidence**: available current evidence cannot support a
  falsifiable condition without guessing.
- **Outside the current capstone population**: the project or subject is outside
  the versioned charter, irrespective of whether it may matter elsewhere.

## Disposition

| Disposition | Source records | Publication action |
|---|---:|---|
| Current source condition | 59 | Consolidated by root cause into 42 product dossiers, all initially `pending` until their external reproduction passes. |
| Resolved at the audited revision | 12 | Retired; no active dossier. |
| Superseded or duplicate | 14 | Absorbed into a current root-cause dossier or a capstone study; no duplicate issue. |
| Insufficient current evidence | 3 | Excluded until new checkable evidence exists. |
| Outside the current capstone population | 30 | Excluded; reconsider only through a charter or inclusion-gate revision. |
| **Total** | **118** | Complete inventory coverage. |

The 42 product dossiers comprise 18 for Cortex/cortex-viz, 18 for
ai-architect-mcp-codebase/ai-architect-mcp-spec and 6 for
zetetic-team-subagents. Thirteen additional benchmark-infrastructure, study and
frontier-inclusion dossiers are derived directly from the versioned research
contract; they are not counted as legacy product findings.

Every source record and its replacement, retirement, or exclusion is listed in
[AUDIT-LEDGER.md](AUDIT-LEDGER.md).

An independent disposition pass found one initial conflation: `L-069` described
a precise installed-copy defect that is resolved at the pinned revision, while
the broader parity hypothesis in HC-ZETETIC-001 survives on distinct records.
The published partition incorporates that correction.

## Verification method

1. Pin the public default-branch revision.
2. Locate the current source, test or public contract that supports or refutes
   the candidate.
3. Consolidate candidates only when they share one root cause and one external
   acceptance experiment.
4. Exclude projects and concerns outside the populations defined by
   `CAPSTONE-CHARTER.md` and `BENCHMARK-TRACKS.md`.
5. Publish a product defect only after the dossier's external reproduction and
   oracle pass. Static source establishes a `pending` hypothesis, not a runtime
   benchmark result.

The codebase audit ran 485 library tests plus 18 targeted integration tests at
the pinned revision. The specification audit ran its build and 1,506 tests.
Those green suites establish the inspected baseline; they do not close gaps
that their current tests omit or encode as expected behavior.

## Explicit exclusions

- Historical benchmark scores and persistent-memory recollections were not used
  as evidence.
- Repository popularity, release recency and README claims were not treated as
  capability proof.
- Session utility, retired bridge, marketing and release-governance candidates
  outside the five-project internal product population were not converted into
  AI Architect product issues.
- External comparison candidates remain reconnaissance records until they pass
  the charter inclusion gate on both Claude and Codex.

## Audit verdict ledger

- Inventory coverage: `proven`
- Source revision pinning: `proven`
- Product dossier reproduction: `pending`
- Matched benchmark results: `pending`
- Independent publication review: `pending`
