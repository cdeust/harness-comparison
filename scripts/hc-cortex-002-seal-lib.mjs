import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  assertPrivateDataAbsent,
  digestPattern,
  equalJson,
  failEvidence,
  inventory,
  inventoryDigest,
  isPlainObject,
  lexicalCompare,
  parseJsonFile,
  requireSnapshotFile,
  safeRelativePath,
  sameSnapshot,
  snapshotRelease,
  utcTimestamp
} from "./hc-cortex-002-evidence-lib.mjs";
import { analysisOutputPaths, analysisSchemaVersion, scoringSchemaVersion } from "./hc-cortex-002-analysis-lib.mjs";

const manifestName = "execution-manifest.json";
const statuses = new Set(["PILOT", "VERIFIED", "PUBLISHED"]);

function roleFor(path) {
  if (path === "protocol.json") return "protocol";
  if (path === "analysis/analysis.json" || path === "analysis/analysis.md") return "analysis";
  if (path === "scoring/scoring.json") return "scoring";
  if (path === "negative-log.jsonl" || path === "analysis/negative-evidence.json") return "negative-log";
  if (path === "review/automated-review.md") return "review";
  if (path === "REPRODUCE.md") return "reproduction";
  if (path === "CHANGELOG.md") return "change-log";
  return "raw";
}

function validateAnalysis(snapshot) {
  const analysis = parseJsonFile(snapshot, "analysis/analysis.json");
  const scoring = parseJsonFile(snapshot, "scoring/scoring.json");
  const negative = parseJsonFile(snapshot, "analysis/negative-evidence.json");
  if (analysis.schemaVersion !== analysisSchemaVersion || scoring.schemaVersion !== scoringSchemaVersion ||
      negative.schemaVersion !== "hc-cortex-002-negative-evidence/v1") {
    failEvidence("ANALYSIS_SCHEMA_INVALID", "analysis", "Independent analysis artifacts use an unsupported schema");
  }
  if (analysis.protocolId !== scoring.protocolId || analysis.generatedAt !== scoring.generatedAt ||
      !digestPattern(analysis.protocolSha256) || !Array.isArray(analysis.rawInputs) ||
      analysis.rawInputSetSha256 !== inventoryDigest(analysis.rawInputs)) {
    failEvidence("ANALYSIS_BINDING_INVALID", "analysis/analysis.json", "Analysis and scoring artifacts do not bind one raw input set");
  }
  const outputs = analysisOutputPaths();
  const rawObserved = inventory(snapshot).filter((entry) => !outputs.has(entry.path) && entry.path !== manifestName);
  if (!equalJson(rawObserved, analysis.rawInputs)) {
    failEvidence("RAW_INPUT_SET_MISMATCH", "analysis/analysis.json", "Raw evidence differs from the independently analyzed byte set");
  }
  if (!equalJson(
    scoring.cells,
    analysis.cells.map((cell) => ({
      id: cell.id,
      correctnessLabel: cell.correctnessLabel,
      expectedVerdict: cell.expectedVerdict,
      observedVerdict: cell.observedVerdict,
      expectationMatch: cell.expectationMatch,
      evidenceComplete: cell.evidenceComplete
    }))
  ) || !equalJson(scoring.descriptiveSaturation, analysis.saturation)) {
    failEvidence("SCORING_ANALYSIS_MISMATCH", "scoring/scoring.json", "Scoring is not a deterministic projection of the analysis");
  }
  return { analysis, scoring, negative };
}

function validateStatus(status, analysis, scoring) {
  if (!statuses.has(status)) failEvidence("RELEASE_STATUS_INVALID", "$", "Sealer status must be PILOT, VERIFIED, or PUBLISHED");
  if (!Array.isArray(analysis.cells) || analysis.cells.length === 0) {
    failEvidence("NO_SEALABLE_CELLS", "analysis/analysis.json", "A sealed execution release needs at least one independently reconciled cell");
  }
  if (["VERIFIED", "PUBLISHED"].includes(status)) {
    if (analysis.completeness?.fullMatrix !== true || scoring.studyVerdict?.label !== "PASS" ||
        analysis.cells.some((cell) => cell.evidenceComplete !== true)) {
      failEvidence("RELEASE_NOT_VERIFIED", "scoring/scoring.json", "Full publication status requires the exact complete matrix and PASS verdict");
    }
  }
}

function repositories(protocol, lock, environment) {
  const sourceById = new Map(environment.sources.map((source) => [source.id, source]));
  const entries = [{
    id: "harness-comparison",
    repository: lock.registration.repository,
    revision: lock.registration.revision,
    dirty: false,
    dirtyPaths: []
  }];
  for (const corpus of protocol.corpora) {
    const observed = sourceById.get(corpus.id);
    if (!observed || observed.revision !== corpus.revision || corpus.dirty !== false) {
      failEvidence("SOURCE_ENVIRONMENT_MISMATCH", "environment.json", `Source receipt for ${corpus.id} contradicts the protocol`);
    }
    entries.push({
      id: corpus.id,
      repository: corpus.repository,
      revision: corpus.revision,
      dirty: false,
      dirtyPaths: []
    });
  }
  return entries;
}

function processReceipt(snapshot, path) {
  const value = parseJsonFile(snapshot, path);
  if (value.schemaVersion !== "workload-process-record/v1") {
    failEvidence("PROCESS_RECEIPT_INVALID", path, "Analysis references a non-process receipt");
  }
  return value;
}

function cellInput(snapshot, ordinal) {
  return parseJsonFile(snapshot, `cells/${String(ordinal).padStart(4, "0")}/cell.json`);
}

function environmentForManifest(snapshot, protocol, lock, runnerEnvironment, analysis) {
  const processes = [];
  const stores = [];
  let totalMemory = null;
  for (const cell of analysis.cells) {
    for (const mode of ["workload", "oracle"]) {
      const path = cell.processReceipts?.[mode];
      if (!path) continue;
      const receipt = processReceipt(snapshot, path);
      totalMemory ??= receipt.environmentBefore?.memory?.totalBytes;
      processes.push({
        id: `${cell.id}-${mode}`,
        instanceId: receipt.processInstanceId,
        command: `${receipt.command.runtimeId} ${receipt.command.adapterId} ${mode}`,
        pid: receipt.pid,
        host: "same-user local host; no operating-system sandbox claimed",
        declaredEndpoints: []
      });
    }
    const cellPrefix = `cells/${String(cell.ordinal).padStart(4, "0")}`;
    if (snapshot.files.has(`${cellPrefix}/cell.json`)) {
      const input = cellInput(snapshot, cell.ordinal);
      const location = cell.backend === "sqlite"
        ? `${cellPrefix}/${input.database.path}`
        : `redacted-database-identity:${input.database.databaseIdentitySha256}`;
      stores.push({
        id: cell.id,
        type: cell.backend,
        location,
        isolation: "fresh database dedicated to one cell",
        initialState: cell.processReceipts?.workload
          ? "empty database checked by workload preflight"
          : "unverified because execution did not reach workload evidence"
      });
    }
  }
  if (analysis.postgresqlService !== null) {
    const receipt = parseJsonFile(snapshot, analysis.postgresqlService.path);
    if (receipt.serviceInstanceId !== analysis.postgresqlService.serviceInstanceId ||
        receipt.processId !== analysis.postgresqlService.processId ||
        receipt.postgresVersion !== analysis.postgresqlService.postgresVersion ||
        receipt.configuration?.port !== 5432) {
      failEvidence("POSTGRESQL_SERVICE_ANALYSIS_MISMATCH", analysis.postgresqlService.path, "PostgreSQL service receipt changed after analysis");
    }
    processes.push({
      id: "postgresql-private-service",
      instanceId: receipt.serviceInstanceId,
      command: `postgresql ${receipt.postgresVersion}; Unix-domain socket only`,
      pid: receipt.processId,
      host: "same-user local host; no operating-system sandbox claimed",
      declaredEndpoints: [{
        transport: "unix-domain-socket",
        portSuffix: receipt.configuration.port,
        binding: "private owner-controlled socket directory; PostgreSQL socket filename suffix only",
        evidence: "configuration-receipt",
        networkScanPerformed: false
      }]
    });
  }
  const cpus = runnerEnvironment.host.cpus;
  totalMemory ??= runnerEnvironment.memory?.totalBytes;
  if (!Array.isArray(cpus) || cpus.length === 0 || !Number.isSafeInteger(totalMemory) || totalMemory < 1) {
    failEvidence("HOST_RECEIPT_INCOMPLETE", "environment.json", "Runner receipts lack CPU or total-memory evidence");
  }
  const runtimes = runnerEnvironment.runtimes.map((runtime) => ({
    id: runtime.id,
    version: `${runtime.version}; sha256=${runtime.sha256}`
  }));
  const runnerInput = lock.runnerInputs?.sha256;
  if (!digestPattern(runnerInput)) failEvidence("RUNNER_PROVENANCE_INCOMPLETE", "protocol-lock.json", "Runner input digest is absent");
  return {
    repositories: repositories(protocol, lock, runnerEnvironment),
    host: {
      os: runnerEnvironment.host.platform,
      release: runnerEnvironment.host.release,
      architecture: runnerEnvironment.host.architecture,
      cpu: cpus[0].model,
      logicalCpus: cpus.length,
      memoryBytes: totalMemory
    },
    runtimes,
    tools: [
      { id: "workload-ladder-runner", version: `sha256=${runnerInput}` },
      { id: "hc-cortex-002-independent-analyzer", version: analysisSchemaVersion }
    ],
    credentials: [],
    stores,
    processes
  };
}

function artifacts(snapshot) {
  return inventory(snapshot).filter((entry) => entry.path !== manifestName).map((entry) => ({
    ...entry,
    role: roleFor(entry.path),
    immutable: true
  }));
}

function manifestCells(snapshot, analysis) {
  return analysis.cells.map((cell) => {
    const status = cell.executionStatus === "passed"
      ? "completed"
      : cell.executionStatus === "indeterminate" ? "indeterminate" : "failed";
    const truthResolved = ["proven", "blocked"].includes(cell.observedVerdict) &&
      typeof cell.processReceipts?.oracle === "string" &&
      typeof cell.ledgerReceipts?.oracle?.path === "string";
    const unresolved = !truthResolved;
    return {
      id: cell.id,
      startedAt: cell.startedAt ?? null,
      endedAt: cell.endedAt ?? null,
      status,
      expectedVerdict: cell.expectedVerdict,
      verdict: cell.observedVerdict ?? "indeterminate",
      protocolSha256: analysis.protocolSha256,
      attemptId: cell.attemptId ?? cell.processReceipts?.attemptId ?? null,
      processInstanceId: cell.processReceipts?.oracleProcessInstanceId ??
        cell.processReceipts?.workloadProcessInstanceId ?? null,
      restartReceiptArtifactPath: cell.processReceipts?.oracle ?? null,
      rawLedgerArtifactPath: cell.ledgerReceipts?.workload?.path ?? null,
      rawArtifactPaths: cell.rawArtifactPaths,
      resolution: {
        state: unresolved ? "unresolved" : "resolved",
        detail: unresolved
          ? "Execution did not reach a complete independent restart verdict; see raw and negative evidence."
          : "Independent restart oracle and analyzer reached a terminal verdict."
      }
    };
  });
}

export function sealHcCortex002Release(releaseRoot, options = {}) {
  const status = options.releaseStatus ?? "PILOT";
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!utcTimestamp(generatedAt)) failEvidence("GENERATED_AT_INVALID", "$", "Manifest timestamp must be UTC");
  const snapshot = snapshotRelease(releaseRoot);
  if (snapshot.files.has(manifestName) && options.verifyExisting !== true) {
    failEvidence("MANIFEST_ALREADY_EXISTS", manifestName, "Sealer never overwrites a manifest");
  }
  assertPrivateDataAbsent(snapshot);
  const { analysis, scoring } = validateAnalysis(snapshot);
  validateStatus(status, analysis, scoring);
  if (Date.parse(generatedAt) < Date.parse(analysis.generatedAt)) {
    failEvidence("MANIFEST_TIMESTAMP_INVALID", "$", "Manifest cannot predate independent analysis");
  }
  const protocol = parseJsonFile(snapshot, "protocol.json");
  const lock = parseJsonFile(snapshot, "protocol-lock.json");
  const runnerEnvironment = parseJsonFile(snapshot, "environment.json");
  const protocolFile = requireSnapshotFile(snapshot, "protocol.json");
  if (protocol.protocolId !== analysis.protocolId || protocolFile.sha256 !== analysis.protocolSha256 ||
      lock.protocolSha256 !== analysis.protocolSha256 || lock.runAttemptId !== analysis.runAttemptId ||
      !isPlainObject(lock.registration) || !safeRelativePath(lock.registration.path)) {
    failEvidence("MANIFEST_PROTOCOL_BINDING_INVALID", "protocol-lock.json", "Protocol, lock, and analysis bindings differ");
  }
  const manifest = {
    schemaVersion: "benchmark-execution-manifest/v1",
    releaseId: basename(snapshot.root),
    releaseStatus: status,
    generatedAt,
    immutabilityPolicy: {
      scheme: "sha256+bytes+manifest/v1",
      osWriteProtectionClaimed: false,
      externalBinding: status === "PUBLISHED" ? "git-commit" : "validation-snapshot"
    },
    protocol: {
      path: "protocol.json",
      sha256: protocolFile.sha256,
      sourceRegistration: {
        repository: lock.registration.repository,
        revision: lock.registration.revision,
        path: lock.registration.path
      }
    },
    environment: environmentForManifest(snapshot, protocol, lock, runnerEnvironment, analysis),
    artifacts: artifacts(snapshot),
    cells: manifestCells(snapshot, analysis)
  };
  const confirmation = snapshotRelease(releaseRoot);
  if (!sameSnapshot(snapshot, confirmation)) {
    failEvidence("RELEASE_CHANGED_DURING_SEAL", "$", "Release changed while its manifest was being constructed");
  }
  if (options.write !== false && options.verifyExisting !== true) {
    writeFileSync(join(snapshot.root, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
  }
  return manifest;
}
