// Real end-to-end conformance: runner -> real Python HC-CORTEX-002 adapter (pinned Cortex
// candidate worktree) -> independent analyzer -> sealer -> read-only verifier, on a disposable
// single-cell SQLite C1/W1 fixture. This is distinct from run-workload-ladder.test.mjs, which
// only exercises the runner against a Node fixture-adapter double, never the real adapter.py or
// the analysis/seal/verify chain -- unit fakes cannot prove the real adapter's raw ledger output
// satisfies the analyzer's independently recomputed persisted-state contract.
//
// This fixture is entirely disposable: its protocol is authored here, lives only in a scratch
// directory, is never committed to this repository, never touches protocols/2026-08-30-hc-
// cortex-002-v1.json, never sets registeredAt on a real protocol, and is not a scored cell.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { analyzeHcCortex002Release } from "./hc-cortex-002-analysis-lib.mjs";
import { sealHcCortex002Release } from "./hc-cortex-002-seal-lib.mjs";
import { verifyHcCortex002Release } from "./verify-hc-cortex-002-release-lib.mjs";

const liveRoot = fileURLToPath(new URL("../", import.meta.url));
const pythonPath = "/private/tmp/cortex-hc-cortex-002/.venv/bin/python";
const candidateCheckout = "/private/tmp/cortex-hc-cortex-002";

const skip = !existsSync(pythonPath) || !existsSync(candidateCheckout)
  ? "pinned Cortex candidate venv/worktree is not present on this host"
  : false;

const registeredScriptFiles = [
  "schemas/benchmark-protocol-v1.schema.json",
  "schemas/execution-manifest-v1.schema.json",
  "scripts/analyze-hc-cortex-002.mjs",
  "scripts/benchmark-release-lib.mjs",
  "scripts/hc-cortex-002-analysis-lib.mjs",
  "scripts/hc-cortex-002-evidence-lib.mjs",
  "scripts/hc-cortex-002-postgresql-lib.mjs",
  "scripts/hc-cortex-002-seal-lib.mjs",
  "scripts/provision-hc-cortex-002-postgresql.mjs",
  "scripts/run-workload-ladder.mjs",
  "scripts/seal-hc-cortex-002.mjs",
  "scripts/validate-benchmark-release.mjs",
  "scripts/verify-hc-cortex-002-release-lib.mjs",
  "scripts/verify-hc-cortex-002-release.mjs",
  "scripts/workload-ladder-runner-lib.mjs"
];

function git(path, arguments_) {
  return execFileSync("git", ["-C", path, ...arguments_], { encoding: "utf8" }).trim();
}

function sourced(description) {
  return { description, evidenceSourceIds: ["source-1"] };
}

function value(value_, unit, rationale) {
  return { value: value_, unit, rationale, evidenceSourceIds: ["source-1"] };
}

function realAdapterProtocolFixture(candidateRevision) {
  return {
    schemaVersion: "benchmark-protocol/v1",
    protocolId: "hc-cortex-002-real-adapter-conformance-fixture-v1",
    title: "Real HC-CORTEX-002 adapter runner/analyzer/sealer/verifier conformance fixture",
    registeredAt: "2026-09-01T00:00:00Z",
    researchQuestion: "Does the real adapter's raw ledger satisfy the independently recomputed evidence contract?",
    systemBoundary: "One disposable SQLite C1/W1 cell against the pinned Cortex candidate checkout.",
    evidenceSources: [{
      id: "source-1",
      citation: "tasks/HC-CORTEX-002-HANDOFF.md",
      claim: "The real adapter, analyzer, sealer, and verifier reconcile on one disposable cell."
    }],
    hypotheses: [{
      id: "H1",
      statement: "One disposable SQLite C1/W1 cell against the real adapter analyzes and seals as PILOT.",
      falsifier: "Any stage of the chain rejects the real adapter's raw evidence."
    }],
    nonClaims: [
      "This fixture is not a scored cell and does not enter any benchmark release.",
      "This fixture does not measure Cortex performance."
    ],
    populations: [{
      id: "cortex-conformance",
      description: "One disposable conformance cell.",
      inclusion: "The single declared cell.",
      exclusion: "The registered 18-cell HC-CORTEX-002 matrix."
    }],
    experimentalUnits: [{
      id: "cortex-candidate",
      description: "The pinned Cortex candidate checkout.",
      components: ["hc-cortex-002-adapter"]
    }],
    adapters: [{
      id: "hc-cortex-002-adapter",
      path: "adapters/hc-cortex-002/adapter.py",
      runtimeId: "python-3.12",
      interface: "hc-cortex-002/v1"
    }],
    corpora: [{
      id: "cortex-candidate",
      repository: "https://github.com/cdeust/Cortex.git",
      revision: candidateRevision,
      dirty: false
    }],
    modelPolicy: {
      provider: "none",
      model: "deterministic-fixture",
      versionPolicy: "No model is invoked.",
      parameters: {},
      networkUse: "No network access."
    },
    resourcePolicy: {
      description: "One fresh process at a time; disposable conformance slice only.",
      limits: {
        processIsolation: value("fresh", "mode", "A process boundary is the fixture oracle."),
        postgresqlSocketPort: value(5432, "Unix socket suffix", "PostgreSQL 17 documents the default suffix.")
      },
      evidenceSourceIds: ["source-1"]
    },
    operationPolicy: {
      adapterId: "hc-cortex-002-adapter",
      orderedOperations: [{
        id: "faulted-supersede",
        description: "The adapter's fixed faulted-supersede operation: raised and rejected before commit.",
        parameters: []
      }],
      retryPolicy: sourced("SQLite concurrency 1 has no fault retry."),
      interruptionPolicy: sourced("An interrupted attempt remains indeterminate.")
    },
    workload: {
      concurrencyLevels: value([1], "processes", "C1 is the conformance slice."),
      callRate: value(["closed-loop"], "mode", "Each operation completes before the next starts."),
      callCount: value([1], "operations", "W1 is the conformance slice."),
      duration: value([null], "not-applicable", "Completion, not elapsed time, ends the cell."),
      completionCondition: sourced("The real adapter's ledger and store close."),
      warmColdPolicy: sourced("The cell starts from a new database."),
      faultSchedule: [{
        id: "fault-after-cas",
        operationId: "faulted-supersede",
        description: "The adapter's fixed faulted_supersede operation is always injected and rejected.",
        trigger: value(1, "operation ordinal", "The adapter always runs exactly one faulted_supersede.")
      }],
      quantileMethod: sourced("Hyndman-Fan type 1, matching the real adapter's own metric computation."),
      parameterSpace: {
        sourceId: value(["cortex-candidate"], "identifier", "One pinned candidate checkout is in scope."),
        backend: value(["sqlite"], "identifier", "SQLite is the conformance slice."),
        concurrency: value([1], "processes", "C1 is the conformance slice."),
        operationsPerType: value([1], "operations", "W1 is the conformance slice."),
        repetition: value([0, 1], "ordinal", "The analyzer's causal-contrast contract requires a declared regression stratum alongside the executed conformance repetition."),
        phase: value(["main", "regression"], "identifier", "The declared regression cell and the executed conformance cell are each represented once."),
        callRate: value(["closed-loop"], "mode", "The workload call-rate policy is bound."),
        callCount: value([1], "operations", "The workload call count is bound."),
        duration: value([null], "not-applicable", "The workload duration is bound."),
        warmCold: value(["cold"], "mode", "Every cell starts from an empty database."),
        faultIds: value([["fault-after-cas"]], "identifier list", "Every cell injects the declared fault.")
      },
      // The independent analyzer (hc-cortex-002-analysis-lib.mjs::validateProtocol) hardcodes
      // its own causal-contrast requirement: plannedCells must include exactly the literal ids
      // "regression-baseline-sqlite-c2" (blocked) and "regression-candidate-sqlite-c2" (proven).
      // This fixture declares the baseline cell structurally (satisfying the analyzer's
      // protocol-level contract) but never executes it -- `--cell` selects only the candidate
      // cell for a real run against the pinned candidate checkout, and the runner marks the
      // undeclared-for-execution baseline "not-run: excluded-by-explicit-cell-selection", which
      // the analyzer treats as no analyzed cell at all (see analyzeCell's early `return null`).
      // A real baseline run belongs to the full 18-cell registered protocol, not this fixture.
      cellOrder: ["regression-baseline-sqlite-c2", "regression-candidate-sqlite-c2"]
    },
    metrics: [{
      id: "process-identity",
      definition: "Workload and oracle process identifiers and nonces.",
      unit: "identifier",
      summary: "Exact raw values."
    }],
    repetitions: {
      count: 1,
      unit: "fixture run",
      rationale: "One disposable conformance repetition.",
      evidenceSourceIds: ["source-1"]
    },
    stopRule: {
      description: "Stop after the first negative correctness oracle.",
      onSuccess: "Preserve the validation receipt.",
      onFailure: "Preserve the reason for every skipped cell.",
      evidenceSourceIds: ["source-1"]
    },
    scoringRubric: {
      procedure: "Compare the real adapter's raw ledger with the independently recomputed oracle checks.",
      independent: true,
      labels: [{ id: "proven", definition: "The independent restart oracle reconciles every check." }]
    },
    plannedCells: [
      {
        // Declared only to satisfy the analyzer's hardcoded causal-contrast protocol contract
        // (validateProtocol requires this exact id with expectedVerdict "blocked"). Never
        // executed by this fixture -- see the cellOrder comment above.
        id: "regression-baseline-sqlite-c2",
        populationId: "cortex-conformance",
        experimentalUnitId: "cortex-candidate",
        corpusId: "cortex-candidate",
        adapterId: "hc-cortex-002-adapter",
        expectedVerdict: "blocked",
        parameters: {
          sourceId: "cortex-candidate",
          backend: "sqlite",
          concurrency: 1,
          operationsPerType: 1,
          repetition: 0,
          phase: "regression",
          callRate: "closed-loop",
          callCount: 1,
          duration: null,
          warmCold: "cold",
          faultIds: ["fault-after-cas"]
        }
      },
      {
        id: "regression-candidate-sqlite-c2",
        populationId: "cortex-conformance",
        experimentalUnitId: "cortex-candidate",
        corpusId: "cortex-candidate",
        adapterId: "hc-cortex-002-adapter",
        expectedVerdict: "proven",
        parameters: {
          sourceId: "cortex-candidate",
          backend: "sqlite",
          concurrency: 1,
          operationsPerType: 1,
          repetition: 1,
          phase: "main",
          callRate: "closed-loop",
          callCount: 1,
          duration: null,
          warmCold: "cold",
          faultIds: ["fault-after-cas"]
        }
      }
    ],
    declaredDeviations: []
  };
}

function createFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hc-cortex-002-real-adapter-e2e-")));
  const registration = join(root, "registration");
  const remote = join(root, "registration-origin.git");
  mkdirSync(registration);
  mkdirSync(remote);
  git(remote, ["init", "--quiet", "--bare"]);
  git(registration, ["init", "--quiet"]);
  git(registration, ["config", "user.name", "Real Adapter E2E Fixture"]);
  git(registration, ["config", "user.email", "real-adapter-e2e@example.invalid"]);
  git(registration, ["remote", "add", "origin", "https://github.com/example/harness-comparison.git"]);
  git(registration, ["remote", "set-url", "--add", "--push", "origin", remote]);
  const adapterTreeFiles = git(liveRoot, ["ls-files", "adapters/hc-cortex-002"]).split("\n").filter(Boolean);
  for (const path of [...registeredScriptFiles, ...adapterTreeFiles]) {
    mkdirSync(join(registration, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(registration, ...path.split("/")), readFileSync(join(liveRoot, ...path.split("/"))));
  }
  mkdirSync(join(registration, "protocols"), { recursive: true });
  const candidateRevision = git(candidateCheckout, ["rev-parse", "HEAD"]);
  const protocol = join(registration, "protocols", "protocol.json");
  writeFileSync(protocol, `${JSON.stringify(realAdapterProtocolFixture(candidateRevision), null, 2)}\n`, "utf8");
  git(registration, ["add", "."]);
  git(registration, ["commit", "--quiet", "-m", "register real-adapter conformance fixture"]);
  git(registration, ["branch", "-M", "main"]);
  git(registration, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  return {
    root,
    registration,
    candidateRevision,
    protocol,
    cli: join(registration, "scripts", "run-workload-ladder.mjs"),
    release: join(root, "release")
  };
}

function remove(fixture) {
  if (process.env.HC_CORTEX_002_KEEP_FIXTURE === "1") {
    process.stderr.write(`retained real-adapter-e2e fixture: ${fixture.root}\n`);
    return;
  }
  rmSync(fixture.root, { recursive: true, force: true });
}

test(
  "runner -> real Python adapter -> analyzer -> sealer -> read-only verifier conformance, SQLite C1/W1 against the pinned candidate",
  { skip },
  () => {
    const fixture = createFixture();
    try {
      const execution = spawnSync(process.execPath, [
        fixture.cli,
        "--protocol", fixture.protocol,
        "--release-root", fixture.release,
        "--source", `cortex-candidate=${candidateCheckout}`,
        "--runtime", `python-3.12=${pythonPath}`,
        "--cell", "regression-candidate-sqlite-c2"
      ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      assert.equal(execution.status, 0, `runner failed: ${execution.stdout}\n${execution.stderr}`);
      const summary = JSON.parse(execution.stdout);
      assert.equal(summary.status, "completed", JSON.stringify(summary));
      assert.deepEqual(summary.cells.map((entry) => [entry.id, entry.status, entry.verdict]), [
        ["regression-baseline-sqlite-c2", "not-run", null],
        ["regression-candidate-sqlite-c2", "passed", "proven"]
      ]);

      const protocolBytes = readFileSync(fixture.protocol);
      const digest = createHash("sha256").update(protocolBytes).digest("hex");
      const lock = JSON.parse(readFileSync(join(fixture.release, "protocol-lock.json"), "utf8"));
      assert.equal(lock.protocolSha256, digest);

      const generatedAt = new Date().toISOString();
      const analyzed = analyzeHcCortex002Release(fixture.release, { generatedAt });
      assert.equal(analyzed.analysis.cells.length, 1);
      const cell = analyzed.analysis.cells[0];
      assert.equal(cell.correctnessLabel, "PASS");
      assert.equal(cell.observedVerdict, "proven");
      assert.equal(cell.expectationMatch, true);
      assert.equal(cell.evidenceComplete, true);
      assert.deepEqual(cell.metrics.missing, []);

      const manifest = sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt });
      assert.equal(manifest.releaseStatus, "PILOT");
      assert.equal(manifest.cells.length, 1);
      assert.equal(manifest.cells[0].verdict, "proven");

      const verification = verifyHcCortex002Release(fixture.release);
      assert.equal(verification.valid, true);
      assert.equal(verification.releaseStatus, "PILOT");
      assert.equal(verification.studyVerdict, analyzed.scoring.studyVerdict.label);
    } finally {
      remove(fixture);
    }
  }
);
