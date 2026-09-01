# HC-CORTEX-002 operational runbook

Exact, copy-pasteable commands for the HC-CORTEX-002 transaction-isolation
protocol pipeline: protocol validation, PostgreSQL reference-service
lifecycle, runner execution, independent analysis, sealing, deep read-only
verification, and generic release validation.

This runbook is operational only. It does not restate the normative research
gates in [`../RESEARCH-PROCESS.md`](../RESEARCH-PROCESS.md), the shared
benchmark contract in [`../BENCHMARK-PROCESS.md`](../BENCHMARK-PROCESS.md), or
the fixture/oracle contract in
[`../adapters/hc-cortex-002/README.md`](../adapters/hc-cortex-002/README.md).
Read those first. Nothing here authorizes running a scored cell: scoring
requires the preregistration freeze described in [`README.md`](README.md).
`registeredAt` is now frozen at `2026-09-01T17:31:11Z` and the harness
preregistration PR (`wip/hc-cortex-002-capstone-protocol` → `main`) is open;
scoring still may not begin until that PR merges.

Every command below was run on this repository's `wip/hc-cortex-002-capstone-
protocol` branch at commit `93070fe` (after `origin/main` was merged in) to
produce the exact output shown or referenced. Paths that name a pinned Cortex
worktree (`/private/tmp/cortex-hc-cortex-002*`) are this session's checkout
locations, not a repository convention — substitute your own pinned worktree
paths.

## 1. Protocol validation

Validate the preregistered protocol in isolation (schema, semantic gates, and
Git registration of the protocol file itself):

```sh
node scripts/validate-benchmark-release.mjs \
  --phase protocol protocols/2026-08-30-hc-cortex-002-v1.json
```

A clean checkout at a pushed commit returns `"valid": true` with the resolved
`sourceRegistration` (repository, revision, path). `INVALID_ARGUMENT` or a
nonzero exit indicates a usage error, not a protocol defect; read the
`error.code` in the JSON on stderr.

## 2. PostgreSQL reference-service lifecycle (`prepare` / `status` / `stop`)

The provisioner creates a private, owner-only PostgreSQL cluster (Unix-socket
only, no TCP listener, mode `0700`) and one fresh `template0` database per
PostgreSQL cell declared in the given protocol. It never executes a workload
cell — this is pure infrastructure provisioning.

```sh
node scripts/provision-hc-cortex-002-postgresql.mjs prepare \
  --protocol protocols/2026-08-30-hc-cortex-002-v1.json \
  --root <new-private-root>

node scripts/provision-hc-cortex-002-postgresql.mjs status \
  --root <new-private-root>

node scripts/provision-hc-cortex-002-postgresql.mjs stop \
  --root <new-private-root>
```

`<new-private-root>` must not already exist; the provisioner refuses reuse
(`prepare` creates it). `prepare` returns a public receipt (schema version,
`postgresVersion`, Unix-socket configuration, host-authentication rules, and
one `cells[]` entry per PostgreSQL cell with a redacted database identity —
never a credential or path). `status` re-verifies the live service identity
against the receipt; `stop` performs a non-destructive `pg_ctl --mode=fast
stop` and preserves the cluster directory as evidence
(`destructiveCleanupPerformed: false`).

### Gotcha: the provisioner needs a *pushed* commit, not just a committed one

`prepare` validates the protocol's Git registration the same way protocol
validation (§1) does, which requires the containing revision to be reachable
from a **fetched `origin` remote-tracking ref** — not merely committed
locally. Running `prepare` against a local commit that has not been pushed
yet fails closed with:

```json
{
  "schemaVersion": "benchmark-release-validation/v1",
  "valid": false,
  "errors": [{
    "code": "GIT_REVISION_NOT_REMOTE_REACHABLE",
    "path": "$.sourceRegistration.revision",
    "message": "Revision is not reachable from a fetched origin remote-tracking ref"
  }]
}
```

surfaced by the provisioner as `PROTOCOL_VALIDATION_FAILED`. `git push` on a
tracking branch updates the local `refs/remotes/origin/<branch>` ref as a
side effect, so the fix is simply: push the branch, then run `prepare` — no
extra `git fetch` needed when pushing from the same checkout. This was
discovered running the real macOS PostgreSQL smoke below: `prepare` failed
against the pre-push commit and succeeded immediately after `git push`.

### Real macOS smoke (PostgreSQL 17.9, Homebrew, this host)

```sh
node scripts/provision-hc-cortex-002-postgresql.mjs prepare \
  --protocol protocols/2026-08-30-hc-cortex-002-v1.json \
  --root /private/tmp/hc-cortex-002-postgresql-smoke
```

Returned a receipt with `"postgresVersion": "17.9 (Homebrew)"`, Unix-socket-
only configuration (`listenAddresses: ""`, `connectedViaUnixSocket: true`,
`serverInetAddress: null`), local-trust/host-reject authentication, and eight
fresh `template0` databases — one per PostgreSQL cell in the registered
matrix (`main-r1-postgresql-c1/c2/c4/c5`, `main-r2-postgresql-c1/c2/c4/c5`).
`status --root ...` reported `"status": "running"` with
`"isolationConfigurationVerified": true`. `stop --root ...` reported
`"status": "stopped"`, `"destructiveCleanupPerformed": false`; the OS process
was confirmed gone afterward (`ps -p <pid>` returned no match). This smoke
provisioned and tore down real infrastructure only — no cell ran, no evidence
was scored, and `registeredAt` was not touched.

**Linux is untested on this host.** This runbook records only the macOS
result above; a Linux PostgreSQL smoke remains outstanding (see
[`../adapters/hc-cortex-002/README.md`](../adapters/hc-cortex-002/README.md)
publication status and the dossier's verdict ledger).

## 3. Runner bindings and execution

```sh
node scripts/run-workload-ladder.mjs \
  --protocol protocols/2026-08-30-hc-cortex-002-v1.json \
  --release-root <new-release-root> \
  --source cortex-baseline=<pinned-baseline-checkout> \
  --source cortex-candidate=<pinned-candidate-checkout> \
  --runtime python-3.12=<pinned-candidate-venv>/bin/python \
  [--database <postgresql-cell-id>=<postgresql-url>] \
  [--postgresql-service-receipt <pg-root>/postgresql-service-receipt.json] \
  [--cell <cell-id>] \
  [--plan]
```

- The runner refuses to start unless the harness checkout is exactly the
  protocol's registered revision, clean, and remotely reachable
  (`HARNESS_REVISION_MISMATCH` / `HARNESS_CHECKOUT_DIRTY`; the registration
  itself is derived from `HEAD` and checked against a fetched `origin` ref).
  A change to any runner input therefore means: commit, push, `prepare` a
  fresh PostgreSQL root (§2, the receipt binds the registration revision),
  and execute into a fresh `<new-release-root>`. Never re-execute into an
  existing release root.

- `--source <id>=<checkout>` binds a protocol-declared `corpora[].id` to a
  real, clean Git checkout at exactly the corpus's registered revision.
  `--runtime <id>=<executable>` binds a protocol-declared `adapters[].runtimeId`
  to a real executable. Every declared source/runtime referenced by the
  selected cells must be bound or the runner fails closed
  (`SOURCE_BINDING_MISSING` / `RUNTIME_BINDING_MISSING`).
- `--database` is required per PostgreSQL cell (§2's `prepare` writes the
  exact `--database <cellId>=<url>` bindings to `<root>/runner-bindings.json`
  as `runnerArguments[]`, for reuse); SQLite cells are runner-owned and must
  not be bound (`SQLITE_DATABASE_OVERRIDE`). The bound URLs contain `&`, so
  pass them as quoted array arguments — in zsh,
  `args=("${(@f)$(jq -r '.runnerArguments[]' <root>/runner-bindings.json)}")`
  then `"${args[@]}"`; never splice them unquoted into a shell line.
- `--postgresql-service-receipt` is required whenever a selected cell uses
  PostgreSQL: it points at §2's immutable pre-run receipt, whose bytes the
  runner binds into `protocol-lock.json` and re-verifies live before and
  after every PostgreSQL process. Omitting it fails closed with
  `POSTGRESQL_SERVICE_RECEIPT_MISSING` before any artifact is written.
- `--cell <id>` selects and executes exactly one declared cell; every other
  cell in `workload.cellOrder` is recorded in `run-summary.json` as
  `"status": "not-run", "reason": "excluded-by-explicit-cell-selection"`.
  Omit `--cell` to execute the full ordered matrix (a scored main run).
- `--plan` performs no filesystem writes and prints the resolved,
  git-registered plan (protocol digest, bound sources/runtimes/adapters,
  ordered cells) — safe to run against the real registered protocol at any
  time. Verified this session: `--plan` against
  `protocols/2026-08-30-hc-cortex-002-v1.json` with both pinned worktrees
  bound returned `"schemaVersion": "workload-ladder-plan/v1"` with 18 resolved
  cells and created no `<release-root>` directory.

The real single-cell conformance path (runner → real adapter → analyzer →
sealer → verifier) is exercised end-to-end by
[`../scripts/hc-cortex-002-real-adapter-e2e.test.mjs`](../scripts/hc-cortex-002-real-adapter-e2e.test.mjs)
against a disposable fixture protocol, never the registered one.

## 4. Independent analysis

```sh
node scripts/analyze-hc-cortex-002.mjs <release-root>
```

Recomputes every oracle check, persisted-state row/edge, and load-window
metric independently from raw ledger evidence — it never trusts a producer's
`passed` flag or descriptive `expected` prose — and writes
`analysis/analysis.json`, `analysis/analysis.md`,
`analysis/negative-evidence.json`, `scoring/scoring.json`,
`review/automated-review.md`, `REPRODUCE.md`, and `CHANGELOG.md`. Refuses to
overwrite an existing analysis (`ANALYSIS_ALREADY_EXISTS`).

## 5. Sealing

```sh
node scripts/seal-hc-cortex-002.mjs --status PILOT <release-root>
node scripts/seal-hc-cortex-002.mjs --status VERIFIED <release-root>
node scripts/seal-hc-cortex-002.mjs --status PUBLISHED <release-root>
```

Writes `execution-manifest.json`, built entirely from the raw evidence tree
and the independent analysis — never from the caller's claims. `PILOT`
accepts a partial, non-prefix-ordered matrix with sealed skip evidence.
`VERIFIED` and `PUBLISHED` require the exact complete registered matrix and a
`PASS` study verdict (`RELEASE_NOT_VERIFIED` otherwise). Refuses to overwrite
an existing manifest (`MANIFEST_ALREADY_EXISTS`).

## 6. Deep (read-only) verification

```sh
node scripts/verify-hc-cortex-002-release.mjs <release-root>
```

Re-derives the entire chain from raw bytes with no filesystem writes:
snapshots the release, recomputes analysis + scoring + negative evidence
generically (every declared output document, not a hardcoded subset) and
compares each recomputed document byte-for-byte against what is on disk;
rebuilds the manifest from raw evidence and compares its bytes the same way;
then re-snapshots the release and rejects any concurrent mutation
(`RELEASE_CHANGED_DURING_VERIFICATION`). This is the check that rejects a
rehashed-but-forged analysis, scoring, negative-evidence, or manifest
projection — see the adversarial coverage in
[`../scripts/hc-cortex-002-analysis.test.mjs`](../scripts/hc-cortex-002-analysis.test.mjs)
(search for "rehashed but forged").

## 7. Generic release validation

```sh
# Protocol only (§1)
node scripts/validate-benchmark-release.mjs --phase protocol <protocol.json>

# One release
node scripts/validate-benchmark-release.mjs [--source-repo <git-root>] <release-root>

# Every release under a search root, including HC-CORTEX-002 issue-specific
# derived-evidence verification (§6) for any release whose manifest-declared
# protocol identifies as HC-CORTEX-002, wherever that protocol snapshot lives
node scripts/validate-benchmark-release.mjs \
  --phase discover [--source-repo <git-root>] <search-root>
```

`discover` walks every nested `execution-manifest.json`, validates each
release generically, then locates that release's protocol via the already-
validated manifest's own `protocol.path` field (re-read with a byte-for-byte
quiescence check against the generic pass's recorded manifest digest) — never
a hardcoded filename — and dispatches to the HC-CORTEX-002 verifier (§6) only
when the resolved protocol's `protocolId` matches. See §8 for why this
distinction matters.

## 8. Known limitation — the sealer hardcodes `protocol.json`

The generic manifest contract
(`schemas/execution-manifest-v1.schema.json`) only requires
`manifest.protocol.path` to be *some* registered, content-addressed artifact
path inside the release — it does not require the literal name
`protocol.json`, and §7's `discover` correctly derives the path from that
field rather than assuming it.

`scripts/hc-cortex-002-seal-lib.mjs`, however, hardcodes the literal string
`"protocol.json"` in three places: the artifact-role classifier
(`roleFor`), the raw-evidence lookup that builds the manifest
(`parseJsonFile(snapshot, "protocol.json")` /
`requireSnapshotFile(snapshot, "protocol.json")`), and the manifest field it
writes (`protocol: { path: "protocol.json", ... }`). Every release this
pipeline itself produces therefore always has `manifest.protocol.path ===
"protocol.json"` — the sealer cannot express a nonstandard path even if the
generic contract would allow one.

**Consequence:** a fully-verified-positive HC-CORTEX-002 release at a
nonstandard protocol path is currently impossible to produce with this
pipeline's own tooling. `discover`'s path-derivation fix (§7) is still
correct and necessary — it prevents a *false rejection* of any other
generic release that legitimately uses a different protocol path (the
regression this fix addressed; see
`scripts/validate-benchmark-release.test.mjs`, "discovery locates an
HC-CORTEX-002-identified protocol at a nonstandard manifest-declared path")
— but it cannot manufacture a positive HC-CORTEX-002 case that the sealer
itself is architecturally unable to produce. This is a known limitation, not
a refactor performed in this pass: changing the sealer's literal-path
assumption would touch the manifest contract for every existing sealed
release and is out of scope here.

## 9. First scored execution (2026-09-01) — invalidated by two harness defects

The first full 18-cell execution of the frozen protocol ran from harness
`main` at `dc53c6fa0e334509f9968e72e014c256d7911d62` into
`hc-cortex-002-release-20260901` (runner exit 0, 19:59:14Z–20:05:34Z, every
cell `passed`, 17 `proven`, `regression-baseline-sqlite-c2` `blocked` as
preregistered). It could **not** be analyzed, sealed or scored, because §4's
analyzer rejected its own runner's raw evidence at the RED control:

1. `RETRY_CHOREOGRAPHY_INVALID` — the analyzer's workload-ledger validation
   demanded exactly one `operation_retry` for every SQLite cell at
   concurrency ≥ 2. The shared-handle baseline legitimately records zero (the
   peer remember never observes `SQLITE_BUSY` on a shared connection), which
   the adapter's oracle already reports as the failed, treatment-sensitive
   `fault_retry_choreography` check. A treatment-sensitive predicate had been
   duplicated as an evidence gate, so the negative control was unanalyzable
   by construction; the synthetic analysis fixture hid it by emitting a retry
   for the blocked baseline too.
2. `PROCESS_RECEIPT_INCOMPLETE` — the runner wrote `status: "failed"` into
   every process receipt whose child exited non-zero, although the oracle
   exits 1 by contract to report `blocked` and the runner's own cell
   classifier accepts that as an observation. The analyzer requires a
   `complete` lifecycle status for a blocked oracle receipt.

Both are fixed at the source in the same change that records this section
(`scripts/hc-cortex-002-analysis-lib.mjs`: structural retry bound only, count
judged by the oracle check and bound to the ledger;
`scripts/workload-ladder-runner-lib.mjs`: receipt status describes the
lifecycle, exit codes are interpreted per mode), with regression tests that
were confirmed red against the pre-fix code. Because the runner binds the
harness `HEAD` (§3), the fix cannot repair an already-executed release: the
first tree is preserved unsealed as negative engineering evidence (it is not
a `PILOT` release — no manifest can be built from receipts the analyzer
refuses) and the matrix is re-executed from the pushed fix into a fresh
release root with a fresh PostgreSQL root (§2). The protocol bytes, cells and
`registeredAt` are unchanged; this is a harness correction, not a protocol
correction (`protocols/README.md`).

## Command index

| Stage | Command |
|---|---|
| Protocol validation | `node scripts/validate-benchmark-release.mjs --phase protocol <protocol.json>` |
| PostgreSQL prepare | `node scripts/provision-hc-cortex-002-postgresql.mjs prepare --protocol <protocol.json> --root <root>` |
| PostgreSQL status | `node scripts/provision-hc-cortex-002-postgresql.mjs status --root <root>` |
| PostgreSQL stop | `node scripts/provision-hc-cortex-002-postgresql.mjs stop --root <root>` |
| Runner (plan) | `node scripts/run-workload-ladder.mjs --protocol <p> --release-root <r> --source ... --runtime ... --plan` |
| Runner (execute) | `node scripts/run-workload-ladder.mjs --protocol <p> --release-root <r> --source ... --runtime ... [--database ...] [--postgresql-service-receipt <receipt>] [--cell <id>]` |
| Analysis | `node scripts/analyze-hc-cortex-002.mjs <release-root>` |
| Sealing | `node scripts/seal-hc-cortex-002.mjs --status PILOT\|VERIFIED\|PUBLISHED <release-root>` |
| Deep verification | `node scripts/verify-hc-cortex-002-release.mjs <release-root>` |
| Generic release validation | `node scripts/validate-benchmark-release.mjs [--source-repo <git-root>] <release-root>` |
| Discovery | `node scripts/validate-benchmark-release.mjs --phase discover [--source-repo <git-root>] <search-root>` |
