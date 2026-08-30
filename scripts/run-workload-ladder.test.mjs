import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const liveRoot = fileURLToPath(new URL("../", import.meta.url));
const registeredFiles = [
  "schemas/benchmark-protocol-v1.schema.json",
  "schemas/execution-manifest-v1.schema.json",
  "scripts/analyze-hc-cortex-002.mjs",
  "scripts/benchmark-release-lib.mjs",
  "scripts/fixtures/workload-ladder-adapter.mjs",
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
const evidenceSourceIds = ["source-1"];

function sourced(description) {
  return { description, evidenceSourceIds };
}

function value(value_, unit, rationale) {
  return { value: value_, unit, rationale, evidenceSourceIds };
}

function cell(id, backend = "sqlite", repetition = 1, expectedVerdict = "proven") {
  return {
    id,
    populationId: "fixture-population",
    experimentalUnitId: "fixture-unit",
    corpusId: "fixture-source",
    adapterId: "fixture-adapter/v1",
    expectedVerdict,
    parameters: {
      sourceId: "fixture-source",
      backend,
      concurrency: 1,
      operationsPerType: 1,
      repetition,
      phase: repetition === 0 ? "regression" : "main",
      callRate: "closed-loop",
      callCount: 1,
      duration: null,
      warmCold: "cold",
      faultIds: ["rollback-after-cas"]
    }
  };
}

function protocolFixture(revision, cells) {
  const backends = [...new Set(cells.map((entry) => entry.parameters.backend))];
  const repetitions = [...new Set(cells.map((entry) => entry.parameters.repetition))];
  return {
    schemaVersion: "benchmark-protocol/v1",
    protocolId: "hc-cortex-002-runner-fixture-v1",
    title: "Workload runner conformance fixture",
    registeredAt: "2026-08-30T10:00:00Z",
    researchQuestion: "Does the runner execute the immutable ordered plan?",
    systemBoundary: "The deterministic fixture adapter and pinned Git checkout.",
    evidenceSources: [{
      id: "source-1",
      citation: "RESEARCH-PROCESS.md",
      claim: "Main cells execute in preregistered order with immutable raw evidence."
    }],
    hypotheses: [{
      id: "H1",
      statement: "Every passing workload receives a fresh independent oracle.",
      falsifier: "Any passing cell reuses a process or omits its oracle."
    }],
    nonClaims: ["The fixture does not measure Cortex performance."],
    populations: [{
      id: "fixture-population",
      description: "Deterministic local fixture cells.",
      inclusion: "Only cells declared in this protocol.",
      exclusion: "All product workloads."
    }],
    experimentalUnits: [{
      id: "fixture-unit",
      description: "Node fixture implementing the Cortex adapter contract.",
      components: ["fixture-adapter"]
    }],
    adapters: [{
      id: "fixture-adapter/v1",
      path: "scripts/fixtures/workload-ladder-adapter.mjs",
      runtimeId: "node",
      interface: "hc-cortex-002/v1"
    }],
    corpora: [{
      id: "fixture-source",
      repository: "local-fixture",
      revision,
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
      description: "One fresh process at a time.",
      limits: {
        processIsolation: value("fresh", "mode", "A process boundary is the fixture oracle."),
        postgresqlSocketPort: value(5432, "Unix socket suffix", "PostgreSQL 17 documents the default suffix.")
      },
      evidenceSourceIds
    },
    operationPolicy: {
      adapterId: "fixture-adapter/v1",
      orderedOperations: [
        { id: "remember", description: "Write one fixture row.", parameters: [] },
        { id: "supersede", description: "Replace one fixture row.", parameters: [] },
        { id: "forget", description: "Remove one fixture row.", parameters: [] }
      ],
      retryPolicy: sourced("No retry is performed."),
      interruptionPolicy: sourced("A signalled attempt is indeterminate.")
    },
    workload: {
      concurrencyLevels: value([1], "workers", "One worker is sufficient for runner conformance."),
      callRate: value(["closed-loop"], "mode", "Completion releases the next operation."),
      callCount: value([1], "operations-per-type", "One operation keeps the fixture minimal."),
      duration: value([null], "not-applicable", "Operation count terminates the fixture."),
      completionCondition: sourced("The adapter closes its ledger and store."),
      warmColdPolicy: sourced("Every cell receives a new database path."),
      faultSchedule: [{
        id: "rollback-after-cas",
        operationId: "supersede",
        description: "Block the superseding transaction after its compare-and-swap.",
        trigger: value(1, "operation ordinal", "The fixture has exactly one supersede operation.")
      }],
      quantileMethod: sourced("No performance quantile is inferred by the runner fixture."),
      parameterSpace: {
        sourceId: value(["fixture-source"], "identifier", "One pinned source is under test."),
        backend: value(backends, "identifier", "Only backends present in the fixture cells are admitted."),
        concurrency: value([1], "workers", "One worker is the conformance slice."),
        operationsPerType: value([1], "operations", "One operation minimizes fixture cost."),
        repetition: value(repetitions, "ordinal", "Every fixture repetition is explicit."),
        phase: value(
          [...new Set(cells.map((entry) => entry.parameters.phase))],
          "identifier",
          "The conformance fixture declares every study phase."
        ),
        callRate: value(["closed-loop"], "mode", "The adapter is completion-driven."),
        callCount: value([1], "operations-per-type", "Matches operationsPerType."),
        duration: value([null], "not-applicable", "No wall-clock stop is used."),
        warmCold: value(["cold"], "mode", "Every cell starts from an empty database."),
        faultIds: value([["rollback-after-cas"]], "identifier list", "Every cell injects the declared fault.")
      },
      cellOrder: cells.map((entry) => entry.id)
    },
    metrics: [{
      id: "process-identity",
      definition: "Workload and oracle process identifiers and nonces.",
      unit: "identifier",
      summary: "Exact raw values."
    }],
    repetitions: {
      count: Math.max(...repetitions),
      unit: "fixture run",
      rationale: "The protocol declares every deterministic fixture repetition.",
      evidenceSourceIds
    },
    stopRule: {
      description: "Stop after the first negative correctness oracle.",
      onSuccess: "Continue to the next declared cell.",
      onFailure: "Preserve evidence and do not start higher cells.",
      evidenceSourceIds
    },
    scoringRubric: {
      procedure: "Compare process and oracle ledgers with the ordered plan.",
      independent: true,
      labels: [{ id: "valid", definition: "The workload and independent oracle both completed." }]
    },
    plannedCells: cells,
    declaredDeviations: []
  };
}

function git(path, arguments_) {
  return execFileSync("git", ["-C", path, ...arguments_], { encoding: "utf8" }).trim();
}

function createFixture(cells) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "workload-ladder-runner-")));
  const source = join(root, "source");
  mkdirSync(source);
  git(source, ["init", "--quiet"]);
  git(source, ["config", "user.name", "Runner Fixture"]);
  git(source, ["config", "user.email", "runner@example.invalid"]);
  writeFileSync(join(source, "tracked.txt"), "clean\n", "utf8");
  git(source, ["add", "tracked.txt"]);
  git(source, ["commit", "--quiet", "-m", "fixture"]);
  const revision = git(source, ["rev-parse", "HEAD"]);
  const registration = join(root, "registration");
  const remote = join(root, "registration-origin.git");
  const postgresqlSocket = join(root, "postgresql-socket");
  mkdirSync(postgresqlSocket, { mode: 0o700 });
  mkdirSync(registration);
  mkdirSync(remote);
  git(remote, ["init", "--quiet", "--bare"]);
  git(registration, ["init", "--quiet"]);
  git(registration, ["config", "user.name", "Runner Fixture"]);
  git(registration, ["config", "user.email", "runner@example.invalid"]);
  git(registration, ["remote", "add", "origin", "https://github.com/example/harness-comparison.git"]);
  git(registration, ["remote", "set-url", "--add", "--push", "origin", remote]);
  mkdirSync(join(registration, "protocols"));
  for (const path of registeredFiles) {
    mkdirSync(join(registration, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(registration, ...path.split("/")), readFileSync(join(liveRoot, ...path.split("/"))));
  }
  const protocol = join(registration, "protocols", "protocol.json");
  writeFileSync(protocol, `${JSON.stringify(protocolFixture(revision, cells), null, 2)}\n`, "utf8");
  git(registration, ["add", "."]);
  git(registration, ["commit", "--quiet", "-m", "register protocol"]);
  git(registration, ["branch", "-M", "main"]);
  git(registration, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  return {
    root,
    source,
    registration,
    revision,
    protocol,
    postgresqlSocket,
    cli: join(registration, "scripts", "run-workload-ladder.mjs"),
    release: join(root, "release")
  };
}

function postgresUrl(fixture, database) {
  return `postgresql:///${database}?host=${encodeURIComponent(fixture.postgresqlSocket)}&port=5432&sslmode=disable`;
}

function writePostgresqlReceipt(fixture, databases) {
  const protocolBytes = readFileSync(fixture.protocol);
  const protocol = JSON.parse(protocolBytes);
  const socketRoot = realpathSync(fixture.postgresqlSocket);
  const postgresqlCells = protocol.workload.cellOrder
    .map((id) => protocol.plannedCells.find((cell_) => cell_.id === id))
    .filter((cell_) => cell_.parameters.backend === "postgresql");
  const receipt = {
    schemaVersion: "hc-cortex-002-postgresql-service-receipt/v1",
    protocolId: protocol.protocolId,
    protocolSha256: createHash("sha256").update(protocolBytes).digest("hex"),
    serviceInstanceId: "fixture-postgresql-service",
    startedAt: "2026-08-31T00:00:00.000Z",
    postgresVersion: "17.0",
    processId: process.pid,
    configuration: {
      listenAddresses: "",
      unixSocketMode: "0700",
      socketDirectoryMode: "0700",
      socketDirectoryIdentitySha256: createHash("sha256").update(socketRoot).digest("hex"),
      socketDirectoryOwnerMatchesProcessUser: true,
      socketOwnerMatchesProcessUser: true,
      port: 5432,
      connectedViaUnixSocket: true,
      serverInetAddress: null
    },
    hostAuthentication: {
      localRuleMethods: ["trust"],
      hostRuleMethods: ["reject"],
      parseErrorCount: 0,
      passwordMaterialRecorded: false
    },
    cells: postgresqlCells.map((cell_) => {
      const database = databases.get(cell_.id);
      assert.equal(typeof database, "string", `missing fixture database for ${cell_.id}`);
      return {
        cellId: cell_.id,
        databaseIdentitySha256: createHash("sha256")
          .update(`${socketRoot}:5432/${database}`)
          .digest("hex"),
        createdFrom: "template0",
        fresh: true
      };
    })
  };
  const path = join(fixture.root, "postgresql-service-receipt.json");
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  const cluster = join(fixture.root, "cluster");
  mkdirSync(cluster, { recursive: true, mode: 0o700 });
  writeFileSync(join(cluster, "postmaster.pid"), `${receipt.processId}\nfixture\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(fixture.root, "provisioner-state.json"), `${JSON.stringify({
    schemaVersion: "hc-cortex-002-postgresql-state/v1",
    protocol: { id: receipt.protocolId, sha256: receipt.protocolSha256 },
    status: "ready",
    pid: receipt.processId,
    serviceInstanceId: receipt.serviceInstanceId,
    startedAt: receipt.startedAt
  }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return { path, receipt };
}

function commitProtocol(fixture, message) {
  git(fixture.registration, ["add", "protocols/protocol.json"]);
  git(fixture.registration, ["commit", "--quiet", "-m", message]);
  git(fixture.registration, ["push", "--quiet", "origin", "main"]);
}

function runnerArguments(fixture, extras = []) {
  return [
    fixture.cli,
    "--protocol", fixture.protocol,
    "--release-root", fixture.release,
    "--source", `fixture-source=${fixture.source}`,
    "--runtime", `node=${process.execPath}`,
    ...extras
  ];
}

function run(fixture, extras = []) {
  return spawnSync(process.execPath, runnerArguments(fixture, extras), {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonLines(path) {
  return readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line));
}

function errorCode(result) {
  return JSON.parse(result.stderr).error.code;
}

function remove(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

function artifactText(root) {
  const chunks = [];
  const visit = (path) => {
    if (lstatSync(path).isDirectory()) {
      for (const entry of readdirSync(path).sort()) visit(join(path, entry));
    } else chunks.push(readFileSync(path).toString("utf8"));
  };
  visit(root);
  return chunks.join("\n");
}

test("plan is stable, ordered, and performs no writes", () => {
  const fixture = createFixture([cell("cell-1", "sqlite", 0), cell("cell-2", "sqlite", 1)]);
  try {
    const first = run(fixture, ["--plan"]);
    const second = run(fixture, ["--plan"]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(JSON.parse(first.stdout).cells.map((entry) => entry.id), ["cell-1", "cell-2"]);
    for (const localPath of [fixture.root, fixture.source, fixture.registration, process.execPath]) {
      assert.equal(first.stdout.includes(localPath), false);
    }
    assert.equal(existsSync(fixture.release), false);
  } finally {
    remove(fixture);
  }
});

test("fresh workload and oracle processes produce immutable evidence and cannot be resumed", () => {
  const fixture = createFixture([cell("cell-1", "sqlite", 1), cell("cell-2", "sqlite", 2)]);
  try {
    const result = run(fixture);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "completed");
    assert.deepEqual(summary.cells.map((entry) => [entry.id, entry.status]), [
      ["cell-1", "passed"],
      ["cell-2", "passed"]
    ]);

    const instances = new Set();
    const nonces = new Set();
    const cellAttemptIds = new Set();
    const lock = readJson(join(fixture.release, "protocol-lock.json"));
    assert.equal(typeof lock.runAttemptId, "string");
    assert.equal(lock.registration.repository, "https://github.com/example/harness-comparison.git");
    for (const ordinal of [1, 2]) {
      const directory = join(fixture.release, "cells", String(ordinal).padStart(4, "0"));
      const input = readJson(join(directory, "cell.json"));
      const cellResult = readJson(join(directory, "cell-result.json"));
      const workloadProcess = readJson(join(directory, "workload", "process.json"));
      const oracleProcess = readJson(join(directory, "oracle", "process.json"));
      assert.equal(workloadProcess.closeAfterStdio, true);
      assert.equal(oracleProcess.closeAfterStdio, true);
      assert.notEqual(workloadProcess.pid, oracleProcess.pid);
      instances.add(workloadProcess.processInstanceId);
      instances.add(oracleProcess.processInstanceId);
      const workloadLedger = readJson(join(fixture.release, workloadProcess.ledger.path));
      const oracleLedger = readJsonLines(join(fixture.release, oracleProcess.ledger.path))[0];
      assert.equal(input.runAttemptId, lock.runAttemptId);
      assert.equal(input.attemptId, cellResult.attemptId);
      assert.equal(input.attemptId, workloadLedger.attempt_id);
      assert.equal(input.attemptId, oracleLedger.attempt_id);
      assert.equal(workloadProcess.command.logicalArguments.attemptId, input.attemptId);
      assert.equal(oracleProcess.command.logicalArguments.attemptId, input.attemptId);
      assert.notEqual(input.attemptId, lock.runAttemptId);
      cellAttemptIds.add(input.attemptId);
      assert.equal(oracleLedger.workload_pid, workloadLedger.pid);
      nonces.add(workloadLedger.nonce);
      nonces.add(oracleLedger.nonce);
      assert.equal(existsSync(join(directory, "database", "cortex.sqlite3")), true);
    }
    assert.equal(instances.size, 4);
    assert.equal(nonces.size, 4);
    assert.equal(cellAttemptIds.size, 2);

    const protocolBytes = readFileSync(fixture.protocol);
    const digest = createHash("sha256").update(protocolBytes).digest("hex");
    assert.equal(lock.protocolSha256, digest);
    assert.deepEqual(readFileSync(join(fixture.release, "protocol.json")), protocolBytes);
    const rawText = artifactText(fixture.release);
    for (const localPath of [fixture.root, fixture.source, fixture.registration, process.execPath]) {
      assert.equal(rawText.includes(localPath), false, `release leaked ${localPath}`);
    }
    assert.equal(rawText.includes("postgresql://"), false);
    const originalSummary = readFileSync(join(fixture.release, "run-summary.json"));
    const repeated = run(fixture);
    assert.equal(repeated.status, 1);
    assert.equal(errorCode(repeated), "RELEASE_ALREADY_EXISTS");
    assert.deepEqual(readFileSync(join(fixture.release, "run-summary.json")), originalSummary);
  } finally {
    remove(fixture);
  }
});

test("source revision and dirty-state mismatches fail before release creation", () => {
  const revisionFixture = createFixture([cell("cell-1")]);
  try {
    const protocol = readJson(revisionFixture.protocol);
    protocol.corpora[0].revision = "0".repeat(40);
    writeFileSync(revisionFixture.protocol, `${JSON.stringify(protocol, null, 2)}\n`, "utf8");
    commitProtocol(revisionFixture, "change declared source revision");
    const mismatch = run(revisionFixture, ["--plan"]);
    assert.equal(mismatch.status, 1);
    assert.equal(errorCode(mismatch), "SOURCE_REVISION_MISMATCH");
    assert.equal(existsSync(revisionFixture.release), false);
  } finally {
    remove(revisionFixture);
  }

  const dirtyFixture = createFixture([cell("cell-1")]);
  try {
    appendFileSync(join(dirtyFixture.source, "tracked.txt"), "dirty\n", "utf8");
    const dirty = run(dirtyFixture, ["--plan"]);
    assert.equal(dirty.status, 1);
    assert.equal(errorCode(dirty), "SOURCE_CHECKOUT_DIRTY");
    assert.equal(existsSync(dirtyFixture.release), false);
  } finally {
    remove(dirtyFixture);
  }
});

test("PostgreSQL requires a unique caller-supplied binding for every selected cell", () => {
  const fixture = createFixture([cell("pg-1", "postgresql", 1), cell("pg-2", "postgresql", 2)]);
  try {
    const deferred = run(fixture, ["--plan"]);
    assert.equal(deferred.status, 0, deferred.stderr);
    assert.deepEqual(
      JSON.parse(deferred.stdout).cells.map((entry) => entry.database.strategy),
      ["required-at-execution", "required-at-execution"]
    );
    const missing = run(fixture);
    assert.equal(missing.status, 1);
    assert.equal(errorCode(missing), "POSTGRESQL_DATABASE_MISSING");
    const first = postgresUrl(fixture, "cell_1");
    const second = postgresUrl(fixture, "cell_2");
    const service = writePostgresqlReceipt(fixture, new Map([
      ["pg-1", "cell_1"],
      ["pg-2", "cell_2"]
    ]));
    const noReceipt = run(fixture, [
      "--database", `pg-1=${first}`,
      "--database", `pg-2=${second}`
    ]);
    assert.equal(noReceipt.status, 1);
    assert.equal(errorCode(noReceipt), "POSTGRESQL_SERVICE_RECEIPT_MISSING");
    const reused = run(fixture, [
      "--database", `pg-1=${first}`,
      "--database", `pg-2=${first}`,
      "--plan"
    ]);
    assert.equal(reused.status, 1);
    assert.equal(errorCode(reused), "POSTGRESQL_DATABASE_REUSED");
    const secret = run(fixture, [
      "--database", "pg-1=postgresql://user:secret@localhost/cell_1",
      "--database", `pg-2=${second}`,
      "--plan"
    ]);
    assert.equal(secret.status, 1);
    assert.equal(errorCode(secret), "POSTGRESQL_DATABASE_SECRET");
    assert.equal(secret.stderr.includes("secret"), false);
    assert.equal(existsSync(fixture.release), false);
    const loopback = run(fixture, [
      "--database", "pg-1=postgresql://localhost/cell_1",
      "--database", "pg-2=postgresql://localhost/cell_2",
      "--plan"
    ]);
    assert.equal(loopback.status, 1);
    assert.equal(errorCode(loopback), "POSTGRESQL_DATABASE_NOT_LOCAL");
    const secondSocket = join(fixture.root, "postgresql-socket-evil");
    mkdirSync(secondSocket, { mode: 0o700 });
    const ambiguous = run(fixture, [
      "--database",
      `pg-1=postgresql:///cell_1?host=${encodeURIComponent(fixture.postgresqlSocket)}` +
        `&host=${encodeURIComponent(secondSocket)}&port=5432&sslmode=disable`,
      "--database", `pg-2=${second}`,
      "--plan"
    ]);
    assert.equal(ambiguous.status, 1);
    assert.equal(errorCode(ambiguous), "POSTGRESQL_DATABASE_IDENTITY_AMBIGUOUS");
    const planned = run(fixture, [
      "--database", `pg-1=${first}`,
      "--database", `pg-2=${second}`,
      "--plan"
    ]);
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(planned.stdout.includes("postgresql://"), false);
    assert.equal(existsSync(fixture.release), false);

    const executedWithoutLivePostgres = run(fixture, [
      "--database", `pg-1=${first}`,
      "--database", `pg-2=${second}`,
      "--postgresql-service-receipt", service.path
    ]);
    assert.equal(executedWithoutLivePostgres.status, 1);
    assert.equal(JSON.parse(executedWithoutLivePostgres.stdout).status, "failed");
    assert.equal(
      JSON.parse(executedWithoutLivePostgres.stdout).cells[0].reason,
      "POSTGRESQL_SERVICE_LIVE_VERIFICATION_FAILED"
    );
    const lock = readJson(join(fixture.release, "protocol-lock.json"));
    const copiedReceipt = readFileSync(join(fixture.release, "postgresql-service-receipt.json"));
    assert.deepEqual(copiedReceipt, readFileSync(service.path));
    assert.equal(lock.postgresqlServiceReceipt.path, "postgresql-service-receipt.json");
    assert.equal(lock.postgresqlServiceReceipt.sha256, createHash("sha256").update(copiedReceipt).digest("hex"));
    assert.equal(lock.postgresqlServiceReceipt.bytes, copiedReceipt.length);
    assert.equal(artifactText(fixture.release).includes(fixture.postgresqlSocket), false);
  } finally {
    remove(fixture);
  }
});

test("PostgreSQL receipt validation rejects post-hoc identities and invalid isolation claims", () => {
  const fixture = createFixture([cell("pg-1", "postgresql", 1), cell("pg-2", "postgresql", 2)]);
  try {
    const databases = new Map([["pg-1", "cell_1"], ["pg-2", "cell_2"]]);
    const service = writePostgresqlReceipt(fixture, databases);
    const first = postgresUrl(fixture, "cell_1");
    const second = postgresUrl(fixture, "cell_2");
    const common = [
      "--database", `pg-1=${first}`,
      "--database", `pg-2=${second}`,
      "--postgresql-service-receipt", service.path,
      "--plan"
    ];

    service.receipt.configuration.listenAddresses = "localhost";
    writeFileSync(service.path, `${JSON.stringify(service.receipt, null, 2)}\n`);
    const networkClaim = run(fixture, common);
    assert.equal(networkClaim.status, 1);
    assert.equal(errorCode(networkClaim), "POSTGRESQL_SERVICE_CONFIGURATION_INVALID");

    const valid = writePostgresqlReceipt(fixture, databases);
    valid.receipt.cells[0].databaseIdentitySha256 = "0".repeat(64);
    writeFileSync(valid.path, `${JSON.stringify(valid.receipt, null, 2)}\n`);
    const changedIdentity = run(fixture, common);
    assert.equal(changedIdentity.status, 1);
    assert.equal(errorCode(changedIdentity), "POSTGRESQL_SERVICE_CELL_BINDING_INVALID");

    const sqlite = createFixture([cell("sqlite-only", "sqlite", 1)]);
    try {
      const unexpected = run(sqlite, ["--postgresql-service-receipt", valid.path, "--plan"]);
      assert.equal(unexpected.status, 1);
      assert.equal(errorCode(unexpected), "POSTGRESQL_SERVICE_RECEIPT_UNEXPECTED");
    } finally {
      remove(sqlite);
    }
  } finally {
    remove(fixture);
  }
});

test("negative oracle evidence stops all higher cells without deleting the failed cell", () => {
  const fixture = createFixture([
    cell("cell-pass", "sqlite", 1),
    cell("cell-fail", "sqlite", 1),
    cell("cell-never", "sqlite", 1)
  ]);
  try {
    const result = run(fixture);
    assert.equal(result.status, 1, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.status, "failed");
    assert.equal(summary.stopCellId, "cell-fail");
    assert.deepEqual(summary.cells.map((entry) => [entry.id, entry.status]), [
      ["cell-pass", "passed"],
      ["cell-fail", "failed"],
      ["cell-never", "not-run"]
    ]);
    assert.equal(existsSync(join(fixture.release, "cells", "0002", "oracle", "process.json")), true);
    assert.equal(existsSync(join(fixture.release, "cells", "0003")), false);
  } finally {
    remove(fixture);
  }
});

test("expected RED control continues, while main failures stop only their backend/repetition", () => {
  const fixture = createFixture([
    cell("regression-baseline-fail", "sqlite", 0, "blocked"),
    cell("regression-candidate", "sqlite", 0, "proven"),
    cell("main-r1-fail", "sqlite", 1, "proven"),
    cell("main-r1-higher", "sqlite", 1, "proven"),
    cell("main-r2-independent", "sqlite", 2, "proven")
  ]);
  try {
    const result = run(fixture);
    assert.equal(result.status, 1, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual(summary.cells.map((entry) => [entry.id, entry.status, entry.verdict]), [
      ["regression-baseline-fail", "passed", "blocked"],
      ["regression-candidate", "passed", "proven"],
      ["main-r1-fail", "failed", "blocked"],
      ["main-r1-higher", "not-run", null],
      ["main-r2-independent", "passed", "proven"]
    ]);
  } finally {
    remove(fixture);
  }
});

test("either regression expectation mismatch globally stops the causal run", () => {
  const baselineMismatch = createFixture([
    cell("regression-baseline-unexpected-green", "sqlite", 0, "blocked"),
    cell("regression-candidate", "sqlite", 0, "proven"),
    cell("main-never", "sqlite", 1, "proven")
  ]);
  try {
    const result = run(baselineMismatch);
    assert.equal(result.status, 1, result.stderr);
    const cells = JSON.parse(result.stdout).cells;
    assert.deepEqual(cells.map((entry) => entry.status), ["failed", "not-run", "not-run"]);
    assert.equal(cells[0].failureScope, "global");
  } finally {
    remove(baselineMismatch);
  }

  const candidateMismatch = createFixture([
    cell("regression-baseline-fail", "sqlite", 0, "blocked"),
    cell("regression-candidate-fail", "sqlite", 0, "proven"),
    cell("main-never", "sqlite", 1, "proven")
  ]);
  try {
    const result = run(candidateMismatch);
    assert.equal(result.status, 1, result.stderr);
    const cells = JSON.parse(result.stdout).cells;
    assert.deepEqual(cells.map((entry) => entry.status), ["passed", "failed", "not-run"]);
    assert.equal(cells[1].failureScope, "global");
  } finally {
    remove(candidateMismatch);
  }
});

test("--cell preserves its global protocol ordinal in plan and artifacts", () => {
  const fixture = createFixture([cell("cell-1"), cell("cell-2"), cell("cell-3")]);
  try {
    const plan = run(fixture, ["--cell", "cell-2", "--plan"]);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).cells[0].ordinal, 2);
    const result = run(fixture, ["--cell", "cell-2"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).cells.map((entry) => entry.status), ["not-run", "passed", "not-run"]);
    assert.equal(existsSync(join(fixture.release, "cells", "0001")), false);
    assert.equal(existsSync(join(fixture.release, "cells", "0002", "cell-result.json")), true);
  } finally {
    remove(fixture);
  }
});
