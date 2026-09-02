import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  EvidenceError,
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
  sha256,
  snapshotRelease,
  utcTimestamp,
  verifyLedgerBytes
} from "./hc-cortex-002-evidence-lib.mjs";

export const analysisSchemaVersion = "hc-cortex-002-analysis/v1";
export const scoringSchemaVersion = "hc-cortex-002-scoring/v1";

const outputPaths = new Set([
  "CHANGELOG.md",
  "REPRODUCE.md",
  "analysis/analysis.json",
  "analysis/analysis.md",
  "analysis/negative-evidence.json",
  "review/automated-review.md",
  "scoring/scoring.json"
]);
const sharedIdentityFields = [
  "attempt_id",
  "cell_id",
  "protocol_id",
  "protocol_sha256",
  "release_id"
];
const treatmentSensitiveChecks = new Set([
  "delete_state",
  "fault_retry_choreography",
  "fault_rollback_state",
  "fts_count",
  "marker_exactly_once_and_rejected_zero",
  "memory_count",
  "post_load_health_is_read_only",
  "supersession_state",
  "vector_count"
]);

export function isCausalBaselineFailureSet(failedChecks) {
  return Array.isArray(failedChecks) && failedChecks.length > 0 &&
    failedChecks.every((name) => treatmentSensitiveChecks.has(name));
}

function exactKeys(value, expected) {
  return isPlainObject(value) && equalJson(Object.keys(value).sort(lexicalCompare), [...expected].sort(lexicalCompare));
}

function one(records, event, path) {
  const matches = records.filter((record) => record.event === event);
  if (matches.length !== 1) failEvidence("EVENT_CARDINALITY_INVALID", path, `Expected exactly one ${event} event`);
  return matches[0];
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integerNonNegative(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort(lexicalCompare)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const gitBlobPattern = /^[0-9a-f]{40}$/u;

function validateDigestEntry(entry, path) {
  // The real runner's boundGitFile() (workload-ladder-runner-lib.mjs) additionally carries the
  // file's Git blob SHA-1 alongside its content-addressed sha256/bytes -- a legitimate second
  // provenance reference, not noise. Entries produced without it (e.g. hand-authored fixtures
  // predating the real runner's own end-to-end evidence) remain equally valid.
  const shapeValid = exactKeys(entry, ["bytes", "path", "sha256"]) ||
    (exactKeys(entry, ["bytes", "gitBlob", "path", "sha256"]) && gitBlobPattern.test(entry.gitBlob));
  if (!shapeValid || !safeRelativePath(entry.path) || !digestPattern(entry.sha256) || !integerNonNegative(entry.bytes)) {
    failEvidence("PROVENANCE_DIGEST_INVALID", path, "Provenance file entry is not content addressed");
  }
}

function validateProvenanceReceipts(protocol, lock, environment) {
  if (!Array.isArray(lock.runnerInputs?.files) || !digestPattern(lock.runnerInputs?.sha256) ||
      lock.runnerInputs.files.length === 0) {
    failEvidence("RUNNER_PROVENANCE_INVALID", "protocol-lock.json", "Runner inputs are not content addressed");
  }
  lock.runnerInputs.files.forEach((entry, index) => validateDigestEntry(entry, `protocol-lock.json#runner-${index}`));
  const runnerCanonical = lock.runnerInputs.files
    .map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n");
  if (sha256(Buffer.from(runnerCanonical, "utf8")) !== lock.runnerInputs.sha256) {
    failEvidence("RUNNER_PROVENANCE_INVALID", "protocol-lock.json", "Runner input aggregate digest is inconsistent");
  }

  const declaredAdapters = new Map(protocol.adapters.map((entry) => [entry.id, entry]));
  if (!Array.isArray(lock.adapters) || lock.adapters.length !== declaredAdapters.size ||
      !equalJson(environment.adapters, lock.adapters)) {
    failEvidence("ADAPTER_PROVENANCE_INVALID", "environment.json", "Adapter receipts do not match the registered adapter set");
  }
  const adapters = new Map();
  for (const [index, adapter] of lock.adapters.entries()) {
    const declared = declaredAdapters.get(adapter?.id);
    if (!declared || adapters.has(adapter.id) || adapter.path !== declared.path ||
        adapter.runtimeId !== declared.runtimeId || adapter.interface !== declared.interface ||
        !digestPattern(adapter.sha256) || !digestPattern(adapter.treeSha256) ||
        !Array.isArray(adapter.treeFiles) || adapter.treeFiles.length === 0) {
      failEvidence("ADAPTER_PROVENANCE_INVALID", `protocol-lock.json#adapter-${index}`, "Adapter receipt contradicts the protocol");
    }
    adapter.treeFiles.forEach((entry, fileIndex) =>
      validateDigestEntry(entry, `protocol-lock.json#adapter-${index}-file-${fileIndex}`));
    const treeCanonical = adapter.treeFiles
      .map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n");
    if (sha256(Buffer.from(treeCanonical, "utf8")) !== adapter.treeSha256) {
      failEvidence("ADAPTER_PROVENANCE_INVALID", `protocol-lock.json#adapter-${index}`, "Adapter tree digest is inconsistent");
    }
    adapters.set(adapter.id, adapter);
  }

  const declaredSources = new Map(protocol.corpora.map((entry) => [entry.id, entry]));
  if (!Array.isArray(environment.sources) || environment.sources.length !== declaredSources.size) {
    failEvidence("SOURCE_PROVENANCE_INVALID", "environment.json", "Source receipts do not cover every registered corpus");
  }
  const sources = new Map();
  for (const [index, source] of environment.sources.entries()) {
    const declared = declaredSources.get(source?.id);
    if (!declared || sources.has(source.id) || source.revision !== declared.revision || declared.dirty !== false ||
        !digestPattern(source.checkoutIdentitySha256) || !Array.isArray(source.locks) ||
        !Array.isArray(source.sourceFiles)) {
      failEvidence("SOURCE_PROVENANCE_INVALID", `environment.json#source-${index}`, "Source receipt contradicts its clean pinned corpus");
    }
    source.locks.forEach((entry, fileIndex) => validateDigestEntry(entry, `environment.json#source-${index}-lock-${fileIndex}`));
    source.sourceFiles.forEach((entry, fileIndex) => validateDigestEntry(entry, `environment.json#source-${index}-file-${fileIndex}`));
    const init = source.sourceFiles.find((entry) => entry.path === "mcp_server/__init__.py");
    if (!init) {
      failEvidence("SOURCE_PROVENANCE_INVALID", `environment.json#source-${index}`, "Cortex package entrypoint digest is absent");
    }
    sources.set(source.id, source);
  }

  const declaredRuntimeIds = [...new Set(protocol.adapters.map((entry) => entry.runtimeId))].sort(lexicalCompare);
  if (!Array.isArray(environment.runtimes) || environment.runtimes.length !== declaredRuntimeIds.length) {
    failEvidence("RUNTIME_PROVENANCE_INVALID", "environment.json", "Runtime receipts do not cover the registered adapters");
  }
  const runtimes = new Map();
  for (const [index, runtime] of environment.runtimes.entries()) {
    const identity = runtime?.environmentIdentity;
    const virtual = runtime?.virtualEnvironment;
    if (!declaredRuntimeIds.includes(runtime?.id) || runtimes.has(runtime.id) || !digestPattern(runtime.sha256) ||
        typeof runtime.version !== "string" || runtime.version === "" || !isPlainObject(identity) ||
        identity.schemaVersion !== "python-runtime-environment/v1" || !digestPattern(identity.sha256) ||
        identity.python?.implementation !== "CPython" || !/^3\.12(?:\.|$)/u.test(identity.python?.version ?? "") ||
        !Array.isArray(identity.distributions) || !isPlainObject(identity.sqlite) || !isPlainObject(identity.psycopg) ||
        !isPlainObject(virtual) || !digestPattern(virtual.pyvenvCfgSha256) ||
        !integerNonNegative(virtual.pyvenvCfgBytes) || !digestPattern(virtual.invocationIdentitySha256) ||
        !digestPattern(virtual.targetSha256) || virtual.targetSha256 !== runtime.sha256) {
      failEvidence("RUNTIME_PROVENANCE_INVALID", `environment.json#runtime-${index}`, "Python runtime receipt is incomplete or not Python 3.12");
    }
    const identityPayload = Object.fromEntries(Object.entries(identity).filter(([key]) => !["schemaVersion", "sha256"].includes(key)));
    if (sha256(Buffer.from(canonicalJson(identityPayload), "utf8")) !== identity.sha256) {
      failEvidence("RUNTIME_PROVENANCE_INVALID", `environment.json#runtime-${index}`, "Runtime inventory digest is inconsistent");
    }
    runtimes.set(runtime.id, runtime);
  }
  return { adapters, sources, runtimes };
}

function parseJsonBytes(bytes, path) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!isPlainObject(value)) failEvidence("INVALID_JSON_OBJECT", path, "Expected a JSON object");
    return value;
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    failEvidence("INVALID_JSON", path, "Expected valid JSON");
  }
}

function validateProtocol(snapshot) {
  const protocolFile = requireSnapshotFile(snapshot, "protocol.json");
  const protocol = parseJsonBytes(protocolFile.bytes, "protocol.json");
  if (protocol.schemaVersion !== "benchmark-protocol/v1" || !safeIdentifier(protocol.protocolId) ||
      !utcTimestamp(protocol.registeredAt) || !Array.isArray(protocol.plannedCells) ||
      !Array.isArray(protocol.workload?.cellOrder)) {
    failEvidence("PROTOCOL_CONTRACT_INVALID", "protocol.json", "Protocol does not expose the registered HC-CORTEX-002 matrix");
  }
  const ids = protocol.plannedCells.map((cell) => cell?.id);
  if (new Set(ids).size !== ids.length || !equalJson(ids, protocol.workload.cellOrder)) {
    failEvidence("PROTOCOL_CELL_ORDER_INVALID", "protocol.json", "Planned cells and cell order must be identical and unique");
  }
  for (const cell of protocol.plannedCells) {
    if (!safeIdentifier(cell.id) || !["proven", "blocked"].includes(cell.expectedVerdict) ||
        !isPlainObject(cell.parameters)) {
      failEvidence("PROTOCOL_CELL_INVALID", "protocol.json", "Every cell needs a resolved expectation and parameter object");
    }
  }
  const baseline = protocol.plannedCells.find((cell) => cell.id === "regression-baseline-sqlite-c2");
  const candidate = protocol.plannedCells.find((cell) => cell.id === "regression-candidate-sqlite-c2");
  if (baseline?.expectedVerdict !== "blocked" || candidate?.expectedVerdict !== "proven") {
    failEvidence("CAUSAL_EXPECTATION_INVALID", "protocol.json", "The preregistration must require baseline RED and candidate GREEN");
  }
  return { protocol, protocolFile };
}

function validateReleaseBindings(snapshot, protocol, protocolFile) {
  const lock = parseJsonFile(snapshot, "protocol-lock.json");
  const environment = parseJsonFile(snapshot, "environment.json");
  const summary = parseJsonFile(snapshot, "run-summary.json");
  const protocolSha256 = protocolFile.sha256;
  if (lock.schemaVersion !== "workload-protocol-lock/v1" || lock.protocolId !== protocol.protocolId ||
      lock.protocolSha256 !== protocolSha256 || lock.protocolBytes !== protocolFile.bytesLength ||
      lock.copiedProtocolPath !== "protocol.json" || !safeIdentifier(lock.runAttemptId)) {
    failEvidence("PROTOCOL_LOCK_MISMATCH", "protocol-lock.json", "Execution lock does not bind the exact registered protocol bytes");
  }
  if (!exactKeys(lock.registration, ["path", "repository", "revision"]) ||
      !safeRelativePath(lock.registration.path) || !/^[0-9a-f]{40}$/u.test(lock.registration.revision) ||
      typeof lock.registration.repository !== "string" || lock.registration.repository === "") {
    failEvidence("SOURCE_REGISTRATION_INCOMPLETE", "protocol-lock.json", "Execution lock lacks exact Git registration provenance");
  }
  if (environment.schemaVersion !== "workload-environment/v1" || !Array.isArray(environment.sources) ||
      !Array.isArray(environment.runtimes) || !isPlainObject(environment.host)) {
    failEvidence("ENVIRONMENT_RECEIPT_INVALID", "environment.json", "Environment receipt is incomplete");
  }
  const provenance = validateProvenanceReceipts(protocol, lock, environment);
  if (summary.schemaVersion !== "workload-run-summary/v1" || summary.releaseId !== basename(snapshot.root) ||
      summary.protocolId !== protocol.protocolId || summary.protocolSha256 !== protocolSha256 ||
      summary.runAttemptId !== lock.runAttemptId || !Array.isArray(summary.cells)) {
    failEvidence("RUN_SUMMARY_MISMATCH", "run-summary.json", "Run summary does not bind its release and execution lock");
  }
  const order = protocol.workload.cellOrder;
  if (!equalJson(summary.cells.map((cell) => cell?.id), order)) {
    failEvidence("RUN_SUMMARY_MATRIX_INVALID", "run-summary.json", "Run summary must retain every preregistered cell in order");
  }
  const negativeLog = validateNegativeLog(snapshot, summary);
  const postgresqlService = validatePostgresqlService(snapshot, protocol, summary, protocolSha256, lock);
  return { lock, environment, summary, protocolSha256, postgresqlService, negativeLog, provenance };
}

function validateNegativeLog(snapshot, summary) {
  const path = "negative-log.jsonl";
  const bytes = requireSnapshotFile(snapshot, path).bytes;
  const text = bytes.toString("utf8");
  if (text === "" || !text.endsWith("\n") || text.includes("\r") || text.startsWith("\uFEFF")) {
    failEvidence("NEGATIVE_LOG_FRAMING_INVALID", path, "Negative log must be non-empty LF-terminated JSONL");
  }
  const entries = text.slice(0, -1).split("\n").map((line, index) => {
    if (line === "") failEvidence("NEGATIVE_LOG_FRAMING_INVALID", `${path}:${index + 1}`, "Negative log has a blank record");
    let entry;
    try { entry = JSON.parse(line); } catch {
      failEvidence("NEGATIVE_LOG_JSON_INVALID", `${path}:${index + 1}`, "Negative log record is not JSON");
    }
    if (!isPlainObject(entry) || entry.schemaVersion !== "workload-negative-log/v1") {
      failEvidence("NEGATIVE_LOG_SCHEMA_INVALID", `${path}:${index + 1}`, "Negative log record schema is invalid");
    }
    return entry;
  });
  const expected = summary.cells.filter((entry) => entry.status !== "passed" || entry.verdict === "blocked");
  if (expected.length === 0) {
    if (entries.length !== 1 || entries[0].cellId !== null || entries[0].status !== "none" ||
        entries[0].verdict !== null || entries[0].reason !== "no-negative-evidence-observed") {
      failEvidence("NEGATIVE_LOG_MISMATCH", path, "Negative log sentinel contradicts the all-pass summary");
    }
    return entries;
  }
  if (entries.length !== expected.length) {
    failEvidence("NEGATIVE_LOG_MISMATCH", path, "Negative log does not preserve every negative or skipped summary cell");
  }
  for (const [index, summaryCell] of expected.entries()) {
    const entry = entries[index];
    if (entry.cellId !== summaryCell.id || entry.status !== summaryCell.status ||
        (entry.verdict ?? null) !== (summaryCell.verdict ?? null) || entry.reason !== summaryCell.reason) {
      failEvidence("NEGATIVE_LOG_MISMATCH", `${path}:${index + 1}`, "Negative log record contradicts its run-summary cell");
    }
  }
  return entries;
}

function validatePostgresqlService(snapshot, protocol, summary, protocolSha256, lock) {
  const path = "postgresql-service-receipt.json";
  const planned = new Map(protocol.plannedCells.map((cell, index) => [cell.id, { cell, ordinal: index + 1 }]));
  const plannedPostgresql = protocol.plannedCells.filter((cell) => cell.parameters.backend === "postgresql");
  const postgresqlSummary = summary.cells.filter((entry) =>
    planned.get(entry.id)?.cell.parameters.backend === "postgresql");
  const attempted = summary.cells.filter((entry) => entry.status !== "not-run" &&
    planned.get(entry.id)?.cell.parameters.backend === "postgresql");
  const scheduled = postgresqlSummary.some((entry) =>
    entry.status !== "not-run" || entry.reason !== "excluded-by-explicit-cell-selection");
  if (!snapshot.files.has(path) && !scheduled) {
    if (lock.postgresqlServiceReceipt !== undefined && lock.postgresqlServiceReceipt !== null) {
      failEvidence("POSTGRESQL_SERVICE_LOCK_MISMATCH", "protocol-lock.json", "Execution lock claims an absent PostgreSQL receipt");
    }
    return null;
  }
  if (!snapshot.files.has(path)) {
    failEvidence("POSTGRESQL_SERVICE_RECEIPT_MISSING", path, "Scheduled PostgreSQL cells require their immutable pre-run service receipt");
  }
  const receipt = parseJsonFile(snapshot, path);
  const receiptFile = requireSnapshotFile(snapshot, path);
  if (!exactKeys(receipt, [
    "cells", "configuration", "hostAuthentication", "postgresVersion", "processId", "protocolId",
    "protocolSha256", "schemaVersion", "serviceInstanceId", "startedAt"
  ]) || receipt.schemaVersion !== "hc-cortex-002-postgresql-service-receipt/v1" ||
      receipt.protocolId !== protocol.protocolId || receipt.protocolSha256 !== protocolSha256 ||
      !safeIdentifier(receipt.serviceInstanceId) || !utcTimestamp(receipt.startedAt) ||
      typeof receipt.postgresVersion !== "string" || receipt.postgresVersion === "" ||
      !Number.isSafeInteger(receipt.processId) || receipt.processId < 1) {
    failEvidence("POSTGRESQL_SERVICE_RECEIPT_INVALID", path, "PostgreSQL service identity or protocol binding is invalid");
  }
  const binding = lock.postgresqlServiceReceipt;
  if (!exactKeys(binding, ["bytes", "path", "schemaVersion", "serviceInstanceId", "sha256"]) ||
      binding.path !== path || binding.sha256 !== receiptFile.sha256 || binding.bytes !== receiptFile.bytesLength ||
      binding.schemaVersion !== receipt.schemaVersion || binding.serviceInstanceId !== receipt.serviceInstanceId) {
    failEvidence("POSTGRESQL_SERVICE_LOCK_MISMATCH", "protocol-lock.json", "Execution lock does not bind the exact pre-run PostgreSQL receipt bytes");
  }
  const configuration = receipt.configuration;
  if (!exactKeys(configuration, [
    "connectedViaUnixSocket", "listenAddresses", "port", "serverInetAddress", "socketDirectoryIdentitySha256",
    "socketDirectoryMode", "socketDirectoryOwnerMatchesProcessUser", "socketOwnerMatchesProcessUser", "unixSocketMode"
  ]) || configuration.listenAddresses !== "" || configuration.unixSocketMode !== "0700" ||
      configuration.socketDirectoryMode !== "0700" ||
      !digestPattern(configuration.socketDirectoryIdentitySha256) ||
      configuration.socketDirectoryOwnerMatchesProcessUser !== true ||
      configuration.socketOwnerMatchesProcessUser !== true || configuration.port !== 5432 ||
      configuration.connectedViaUnixSocket !== true || configuration.serverInetAddress !== null) {
    failEvidence("POSTGRESQL_SERVICE_CONFIGURATION_INVALID", path, "PostgreSQL receipt does not prove the preregistered Unix-socket-only configuration");
  }
  const authentication = receipt.hostAuthentication;
  if (!exactKeys(authentication, ["hostRuleMethods", "localRuleMethods", "parseErrorCount", "passwordMaterialRecorded"]) ||
      !equalJson(authentication.localRuleMethods, ["trust"]) || !equalJson(authentication.hostRuleMethods, ["reject"]) ||
      authentication.parseErrorCount !== 0 || authentication.passwordMaterialRecorded !== false) {
    failEvidence("POSTGRESQL_SERVICE_AUTHENTICATION_INVALID", path, "PostgreSQL access rules contradict the registered local-only boundary");
  }
  if (!Array.isArray(receipt.cells) || receipt.cells.length !== plannedPostgresql.length) {
    failEvidence("POSTGRESQL_SERVICE_CELL_SET_INVALID", path, "PostgreSQL receipt does not cover the full preregistered PostgreSQL matrix");
  }
  const observedIds = [];
  const databaseIdentities = [];
  for (const [index, serviceCell] of receipt.cells.entries()) {
    if (!exactKeys(serviceCell, ["cellId", "createdFrom", "databaseIdentitySha256", "fresh"]) ||
        serviceCell.createdFrom !== "template0" || serviceCell.fresh !== true ||
        !digestPattern(serviceCell.databaseIdentitySha256)) {
      failEvidence("POSTGRESQL_SERVICE_CELL_INVALID", `${path}#${index}`, "PostgreSQL cell receipt is incomplete");
    }
    if (serviceCell.cellId !== plannedPostgresql[index].id) {
      failEvidence("POSTGRESQL_SERVICE_CELL_SET_INVALID", `${path}#${index}`, "PostgreSQL receipt order differs from the protocol matrix");
    }
    observedIds.push(serviceCell.cellId);
    databaseIdentities.push(serviceCell.databaseIdentitySha256);
  }
  if (!equalJson(observedIds, plannedPostgresql.map((entry) => entry.id)) ||
      new Set(databaseIdentities).size !== databaseIdentities.length) {
    failEvidence("POSTGRESQL_SERVICE_CELL_SET_INVALID", path, "PostgreSQL matrix must be exact, ordered, and use unique databases");
  }
  const serviceByCell = new Map(receipt.cells.map((entry) => [entry.cellId, entry]));
  for (const attemptedCell of attempted) {
    const registered = planned.get(attemptedCell.id);
    const input = parseJsonFile(snapshot, `cells/${String(registered.ordinal).padStart(4, "0")}/cell.json`);
    if (input.id !== attemptedCell.id ||
        input.database?.databaseIdentitySha256 !== serviceByCell.get(attemptedCell.id)?.databaseIdentitySha256 ||
        input.postgresqlService?.serviceInstanceId !== receipt.serviceInstanceId ||
        input.postgresqlService?.startedAt !== receipt.startedAt ||
        input.postgresqlService?.processId !== receipt.processId) {
      failEvidence("POSTGRESQL_SERVICE_CELL_BINDING_INVALID", attemptedCell.id, "Attempted PostgreSQL database identity contradicts its immutable service receipt");
    }
  }
  const attemptedIds = new Set(attempted.map((entry) => entry.id));
  return {
    path,
    serviceInstanceId: receipt.serviceInstanceId,
    processId: receipt.processId,
    postgresVersion: receipt.postgresVersion,
    cells: receipt.cells.map(({ cellId, databaseIdentitySha256 }) => ({
      cellId,
      databaseIdentitySha256,
      executionState: attemptedIds.has(cellId) ? "attempted" : "provisioned-not-attempted"
    }))
  };
}

function pathRecord(snapshot, path, expectedSchema) {
  if (!safeRelativePath(path)) failEvidence("UNSAFE_RECEIPT_PATH", path, "Receipt path must be release-relative");
  const record = parseJsonFile(snapshot, path);
  if (record.schemaVersion !== expectedSchema) failEvidence("RECEIPT_SCHEMA_INVALID", path, "Receipt schema is not supported");
  return record;
}

function checkProcessEvents(record, mode, path) {
  if (!Array.isArray(record.events) || record.events.length < 5 || record.events[0]?.event !== "spawn" ||
      record.events.at(-1)?.event !== "close") {
    failEvidence("PROCESS_EVENT_SEQUENCE_INVALID", path, "Process receipt lacks a complete spawn-to-close sequence");
  }
  const names = record.events.map((event) => event?.event);
  for (const required of ["spawn", "stdout-end", "stderr-end", "exit", "close"]) {
    if (names.filter((name) => name === required).length !== 1) {
      failEvidence("PROCESS_EVENT_SEQUENCE_INVALID", path, `Process receipt must contain exactly one ${required}`);
    }
  }
  if (record.events.length !== 5 || names[0] !== "spawn" || names.at(-1) !== "close") {
    failEvidence("PROCESS_EVENT_SEQUENCE_INVALID", path, "Completed process receipt contains extra lifecycle events");
  }
  let priorMonotonic = null;
  let priorTimestamp = null;
  for (const [index, event] of record.events.entries()) {
    if (!utcTimestamp(event.at) || typeof event.monotonicNs !== "string" || !/^(?:0|[1-9]\d*)$/u.test(event.monotonicNs)) {
      failEvidence("PROCESS_EVENT_TIMESTAMP_INVALID", `${path}#${index}`, "Process event clock is invalid");
    }
    const monotonic = BigInt(event.monotonicNs);
    const timestamp = Date.parse(event.at);
    if ((priorMonotonic !== null && monotonic < priorMonotonic) ||
        (priorTimestamp !== null && timestamp < priorTimestamp)) {
      failEvidence("PROCESS_EVENT_TIMESTAMP_INVALID", `${path}#${index}`, "Process event clocks move backwards");
    }
    priorMonotonic = monotonic;
    priorTimestamp = timestamp;
  }
  const exitEvent = record.events.find((event) => event.event === "exit");
  const closeEvent = record.events.at(-1);
  const closeIndex = record.events.length - 1;
  if (record.closeAfterStdio !== true || !Number.isSafeInteger(record.pid) || record.pid < 1 ||
      record.events[0].pid !== record.pid || record.status !== "complete" ||
      names.indexOf("stdout-end") >= closeIndex || names.indexOf("stderr-end") >= closeIndex ||
      closeEvent.stdoutEnded !== true || closeEvent.stderrEnded !== true ||
      exitEvent.code !== record.exit?.code || exitEvent.signal !== record.exit?.signal ||
      closeEvent.code !== record.exit?.code || closeEvent.signal !== record.exit?.signal) {
    failEvidence("PROCESS_RECEIPT_INCOMPLETE", path, "Completed process receipt does not prove stream drain and close");
  }
  const expectedExit = mode === "oracle" && record.adapterEnvelope?.verdict === "blocked" ? 1 : 0;
  if (record.exit?.code !== expectedExit || record.exit?.signal !== null || record.spawnError !== null ||
      record.orchestrationError !== null) {
    failEvidence("PROCESS_EXIT_INVALID", path, "Process exit does not match its adapter verdict");
  }
}

function validateEnvelope(snapshot, record, mode, path) {
  if (!exactKeys(record.adapterEnvelope, ["interface", "ledger_path", "mode", "status", "verdict"]) ||
      record.adapterEnvelope.interface !== "hc-cortex-002/v1" || record.adapterEnvelope.mode !== mode ||
      record.adapterEnvelope.status !== "complete") {
    failEvidence("ADAPTER_ENVELOPE_INVALID", path, "Adapter envelope is not the completed HC-CORTEX-002 contract");
  }
  const stdout = requireSnapshotFile(snapshot, record.stdoutPath);
  const observed = parseJsonBytes(stdout.bytes, record.stdoutPath);
  if (!equalJson(observed, record.adapterEnvelope)) {
    failEvidence("ADAPTER_STDOUT_MISMATCH", record.stdoutPath, "Captured stdout does not equal the process envelope");
  }
  requireSnapshotFile(snapshot, record.stderrPath);
}

function processExpectedIdentity(cellInput, processId, releaseId) {
  return {
    attempt_id: cellInput.attemptId,
    cell_id: cellInput.id,
    process_instance_id: processId,
    protocol_id: cellInput.protocolId,
    protocol_sha256: cellInput.protocolSha256,
    release_id: releaseId
  };
}

function validateProcess(snapshot, path, mode, cellInput, planned, bindings) {
  const record = pathRecord(snapshot, path, "workload-process-record/v1");
  const adapter = bindings.provenance.adapters.get(planned.adapterId);
  const runtime = adapter ? bindings.provenance.runtimes.get(adapter.runtimeId) : null;
  if (record.mode !== mode || !safeIdentifier(record.processInstanceId) || !adapter || !runtime ||
      record.command?.interface !== "hc-cortex-002/v1" || record.command.adapterId !== adapter.id ||
      record.command.adapterPath !== adapter.path || record.command.adapterTreeSha256 !== adapter.treeSha256 ||
      record.command.runtimeId !== runtime.id || record.command.runtimeSha256 !== runtime.sha256) {
    failEvidence("PROCESS_BINDING_INVALID", path, "Process mode, identity, or adapter interface is invalid");
  }
  const logical = record.command?.logicalArguments;
  const expectedLogical = {
    mode,
    releaseId: bindings.summary.releaseId,
    protocolId: cellInput.protocolId,
    protocolSha256: cellInput.protocolSha256,
    cellId: cellInput.id,
    attemptId: cellInput.attemptId,
    processInstanceId: record.processInstanceId,
    backend: planned.parameters.backend,
    concurrency: planned.parameters.concurrency,
    operationsPerType: planned.parameters.operationsPerType,
    runId: cellInput.runId,
    postgresqlService: cellInput.postgresqlService ?? null
  };
  for (const [field, expected] of Object.entries(expectedLogical)) {
    if (!equalJson(logical?.[field], expected)) {
      failEvidence("PROCESS_BINDING_INVALID", path, `Logical process argument ${field} is not bound to the cell`);
    }
  }
  const expectedDatabase = planned.parameters.backend === "sqlite"
    ? { strategy: "release-cell-local", databaseIdentitySha256: cellInput.database?.databaseIdentitySha256 }
    : cellInput.database;
  if (!equalJson(logical?.database, expectedDatabase)) {
    failEvidence("PROCESS_DATABASE_BINDING_INVALID", path, "Process database identity contradicts its cell receipt");
  }
  if (!isPlainObject(record.ledger) || !safeRelativePath(record.ledger.path) ||
      !digestPattern(record.ledger.sha256) || !integerNonNegative(record.ledger.bytes)) {
    failEvidence("LEDGER_RECEIPT_INVALID", path, "Process receipt lacks a content-addressed ledger");
  }
  checkProcessEvents(record, mode, path);
  validateEnvelope(snapshot, record, mode, path);
  const ledgerFile = requireSnapshotFile(snapshot, record.ledger.path);
  if (ledgerFile.sha256 !== record.ledger.sha256 || ledgerFile.bytesLength !== record.ledger.bytes) {
    failEvidence("LEDGER_RECEIPT_MISMATCH", record.ledger.path, "Ledger bytes contradict the process receipt");
  }
  const ledger = verifyLedgerBytes(
    ledgerFile.bytes,
    record.ledger.path,
    processExpectedIdentity(cellInput, record.processInstanceId, bindings.summary.releaseId)
  );
  return { record, ledger, ledgerPath: record.ledger.path };
}

function validateStartRuntime(start, planned, provenance, path) {
  const adapter = provenance.adapters.get(planned.adapterId);
  const runtime = adapter ? provenance.runtimes.get(adapter.runtimeId) : null;
  const source = provenance.sources.get(planned.parameters.sourceId);
  const observed = start.runtime;
  const init = source?.sourceFiles.find((entry) => entry.path === "mcp_server/__init__.py");
  if (!runtime || !source || !init || !isPlainObject(observed) ||
      observed.cortex_commit !== source.revision ||
      observed.cortex_checkout_identity_sha256 !== source.checkoutIdentitySha256 ||
      observed.cortex_tree_dirty !== false || observed.mcp_server_init_sha256 !== init.sha256 ||
      observed.python_executable_identity_sha256 !== runtime.virtualEnvironment.invocationIdentitySha256 ||
      observed.python_version !== runtime.environmentIdentity.python.version ||
      typeof observed.python_executable_name !== "string" || observed.python_executable_name === "" ||
      observed.python_executable_name.includes("/") || observed.python_executable_name.includes("\\") ||
      !(observed.distribution_version === null || typeof observed.distribution_version === "string") ||
      typeof observed.platform !== "string" || observed.platform === "") {
    failEvidence("PROCESS_RUNTIME_PROVENANCE_MISMATCH", path, "Adapter runtime observation contradicts the source and runtime receipts");
  }
}

function operationIndex(records, event, path) {
  const entries = records.filter((record) => record.event === event);
  const grouped = new Map();
  for (const entry of entries) {
    if (typeof entry.operation_id !== "string" || entry.operation_id === "") {
      failEvidence("OPERATION_ID_INVALID", path, "Operation identity is missing");
    }
    if (!grouped.has(entry.operation_id)) grouped.set(entry.operation_id, []);
    grouped.get(entry.operation_id).push(entry);
  }
  return { entries, grouped };
}

function expectedIntentCounts(operationsPerType) {
  return {
    faulted_supersede: 1,
    forget: operationsPerType,
    recovery_health: 1,
    remember: operationsPerType,
    setup_seed: 2 * operationsPerType + 1,
    supersede_atomic: operationsPerType
  };
}

function countBy(records, field) {
  const counts = {};
  for (const record of records) counts[record[field]] = (counts[record[field]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => lexicalCompare(left, right)));
}

function validateWorkloadLedger(ledger, cellInput, planned, provenance, path) {
  const records = ledger.records;
  const start = one(records, "process_start", path);
  const preflight = one(records, "backend_preflight", path);
  const loadWindow = one(records, "load_window", path);
  const measurement = one(records, "measurement_summary", path);
  const terminal = one(records, "terminal", path);
  const expectedPostgresqlService = planned.parameters.backend === "postgresql" ? {
    service_instance_id: cellInput.postgresqlService?.serviceInstanceId,
    started_at: cellInput.postgresqlService?.startedAt,
    server_inet_address: null
  } : null;
  if (records[0] !== start || records.at(-1) !== terminal || start.mode !== "workload" ||
      start.backend !== planned.parameters.backend || start.concurrency !== planned.parameters.concurrency ||
      start.operations_per_type !== planned.parameters.operationsPerType || start.run_id !== cellInput.runId ||
      start.database_identity_sha256 !== cellInput.database?.databaseIdentitySha256 ||
      !equalJson(start.postgresql_service ?? null, expectedPostgresqlService) ||
      terminal.state !== "complete" || terminal.store_closed !== true) {
    failEvidence("WORKLOAD_TERMINAL_INVALID", path, "Workload did not complete its exact registered configuration");
  }
  validateStartRuntime(start, planned, provenance, path);
  const freshness = preflight.observation;
  if (freshness?.checked_before_store_initialization !== true || freshness.empty !== true ||
      freshness.user_relation_count !== 0) {
    failEvidence("DATABASE_NOT_FRESH", path, "Cell did not prove an empty pre-store database");
  }
  const intents = operationIndex(records, "operation_intent", path);
  const outcomes = operationIndex(records, "operation_outcome", path);
  if (!equalJson(countBy(intents.entries, "operation"), expectedIntentCounts(planned.parameters.operationsPerType)) ||
      intents.entries.length !== intents.grouped.size || outcomes.entries.length !== outcomes.grouped.size ||
      !equalJson([...intents.grouped.keys()].sort(lexicalCompare), [...outcomes.grouped.keys()].sort(lexicalCompare))) {
    failEvidence("OPERATION_LEDGER_INCOMPLETE", path, "Workload intents and terminal outcomes do not reconcile exactly");
  }
  for (const intent of intents.entries) {
    const outcome = outcomes.grouped.get(intent.operation_id)?.[0];
    const expected = intent.operation === "faulted_supersede" ? "rejected" : "acknowledged";
    if (intent.fsync_before_operation !== true || outcome?.operation !== intent.operation || outcome?.outcome !== expected) {
      failEvidence("OPERATION_OUTCOME_INVALID", path, "Operation outcome contradicts its durable intent");
    }
    if (intent.phase === "load" && (outcome.admission?.observed !== true || !isPlainObject(outcome.timing))) {
      failEvidence("ADMISSION_EVIDENCE_MISSING", path, "Measured load operation lacks source-admission timing");
    }
  }
  const retries = records.filter((record) => record.event === "operation_retry");
  validateRetryChoreography(retries, intents, path);
  const loadRecords = records.filter((record) => record.phase === "load" &&
    ["operation_intent", "operation_outcome", "operation_retry"].includes(record.event));
  const lastLoadIndex = Math.max(...loadRecords.map((record) => records.indexOf(record)));
  if (records.indexOf(loadWindow) <= lastLoadIndex || records.indexOf(loadWindow) >= records.indexOf(measurement)) {
    failEvidence("LOAD_WINDOW_INVALID", path, "Load window receipt must follow all load operations and precede the measurement summary");
  }
  return {
    path, records, start, preflight, loadWindow, measurement, terminal,
    intents: intents.entries, outcomes: outcomes.entries, retries
  };
}

// Protocol retryPolicy: the harness performs no general retry; only the peer remember inside
// the injected SQLite fault window may retry once, and every attempt stays in the ledger.
// Whether that single retry occurred is treatment-sensitive (the shared-handle baseline never
// observes the lock), so its count is judged by the fault_retry_choreography oracle check and
// never by ledger validity; only the structural bound is an evidence invariant.
function validateRetryChoreography(retries, intents, path) {
  if (retries.length > 1) {
    failEvidence("RETRY_CHOREOGRAPHY_INVALID", path, "Ledger records more than the single permitted peer-remember retry");
  }
  for (const retry of retries) {
    const intent = intents.grouped.get(retry.operation_id)?.[0];
    if (retry.operation !== "remember" || retry.phase !== "load" || retry.attempt !== 1 ||
        intent?.operation !== "remember" || intent.phase !== "load") {
      failEvidence("RETRY_CHOREOGRAPHY_INVALID", path, "Retry is not the single permitted peer remember inside the fault window");
    }
  }
}

function sharedIdentity(left, right) {
  return sharedIdentityFields.every((field) => left[field] === right[field]);
}

function checkShape(check, path) {
  if (!exactKeys(check, ["expected", "observed", "passed"]) || typeof check.passed !== "boolean") {
    failEvidence("ORACLE_CHECK_INVALID", path, "Oracle check must expose exactly expected, observed, and passed");
  }
}

function empty(value) {
  return Array.isArray(value) ? value.length === 0 : isPlainObject(value) && Object.keys(value).length === 0;
}

function expectedCheckSet(backend) {
  const names = [
    "acknowledged_and_rejected_contract",
    "configuration_binding",
    "connection_telemetry_shape",
    "delete_state",
    "fault_retry_choreography",
    "fault_rollback_state",
    "final_live_count_formula",
    "fresh_empty_database_preflight",
    "fresh_process_restart",
    "fts_count",
    "load_telemetry_scope_and_types",
    "load_window_exact",
    "marker_exactly_once_and_rejected_zero",
    "memory_count",
    "one_outcome_per_intent",
    "planned_operation_counts",
    "post_load_health_is_read_only",
    "release_protocol_cell_attempt_binding",
    "supersession_state",
    "vector_count",
    "workload_terminal",
    "zero_model_remote_tool_boundary"
  ];
  if (backend === "sqlite") names.push("sqlite_foreign_keys", "sqlite_integrity");
  else names.push("postgresql_constraints_validated");
  return names.sort(lexicalCompare);
}

function persistedState(workload, observations, planned, path) {
  if (!isPlainObject(observations) || observations.persisted_state_schema !== "hc-cortex-002/persisted-state/v1" ||
      observations.backend !== planned.parameters.backend ||
      !equalJson(observations.scope, { domain: "hc-cortex-002", agent_context: workload.start.run_id }) ||
      !Array.isArray(observations.rows)) {
    failEvidence("PERSISTED_STATE_CONTRACT_INVALID", path, "Oracle did not publish the registered normalized persisted-state snapshot");
  }
  const rows = observations.rows;
  const rowsById = new Map();
  let priorId = 0;
  for (const [index, row] of rows.entries()) {
    if (!exactKeys(row, ["content", "fts_populated", "id", "superseded_by_id", "supersedes_id", "vector_populated"]) ||
        !Number.isSafeInteger(row.id) || row.id < 1 || row.id <= priorId || typeof row.content !== "string" ||
        row.content === "" || ![null, undefined].includes(row.supersedes_id) &&
          (!Number.isSafeInteger(row.supersedes_id) || row.supersedes_id < 1) ||
        ![null, undefined].includes(row.superseded_by_id) &&
          (!Number.isSafeInteger(row.superseded_by_id) || row.superseded_by_id < 1) ||
        typeof row.fts_populated !== "boolean" || typeof row.vector_populated !== "boolean") {
      failEvidence("PERSISTED_STATE_ROW_INVALID", `${path}#row-${index}`, "Normalized persisted-state row is malformed or unsorted");
    }
    rowsById.set(row.id, row);
    priorId = row.id;
  }
  const intents = new Map(workload.intents.map((entry) => [entry.operation_id, entry]));
  const outcomes = new Map(workload.outcomes.map((entry) => [entry.operation_id, entry]));
  const expectedContents = new Map();
  for (const intent of workload.intents) {
    if (typeof intent.marker !== "string" || intent.marker === "") continue;
    const expected = intent.operation === "faulted_supersede" ||
      (intent.operation === "setup_seed" && intent.role === "delete_target") ? 0 : 1;
    expectedContents.set(intent.marker, expected);
  }
  const actualContents = new Map();
  for (const row of rows) actualContents.set(row.content, (actualContents.get(row.content) ?? 0) + 1);
  const markerDifferences = [...expectedContents].filter(([content, expected]) =>
    (actualContents.get(content) ?? 0) !== expected);
  const unexpectedContents = [...actualContents.keys()].filter((content) => !expectedContents.has(content));
  const supersessionErrors = [];
  const deleteErrors = [];
  const faultErrors = [];
  for (const [operationId, intent] of intents) {
    const outcome = outcomes.get(operationId);
    if (intent.operation === "supersede_atomic") {
      const newId = outcome?.result?.memory_id;
      const targetId = intent.target_id;
      const oldRow = rowsById.get(targetId);
      const newRow = rowsById.get(newId);
      if (!oldRow || !newRow || oldRow.superseded_by_id !== newId ||
          newRow.supersedes_id !== targetId || outcome?.result?.head_id !== targetId) {
        supersessionErrors.push(operationId);
      }
    } else if (intent.operation === "forget" && rowsById.has(intent.target_id)) {
      deleteErrors.push(operationId);
    } else if (intent.operation === "faulted_supersede") {
      const target = rowsById.get(intent.target_id);
      if (!target || target.superseded_by_id !== null) faultErrors.push(operationId);
    }
  }
  for (const row of rows) {
    if (row.supersedes_id !== null && rowsById.get(row.supersedes_id)?.superseded_by_id !== row.id) {
      supersessionErrors.push(`reciprocal-new-${row.id}`);
    }
    if (row.superseded_by_id !== null && rowsById.get(row.superseded_by_id)?.supersedes_id !== row.id) {
      supersessionErrors.push(`reciprocal-old-${row.id}`);
    }
  }
  const ftsCount = rows.filter((row) => row.fts_populated).length;
  const vectorCount = rows.filter((row) => row.vector_populated).length;
  if (observations.memory_count !== rows.length || observations.fts_count !== ftsCount ||
      observations.vector_count !== vectorCount || observations.vector_available !== true) {
    failEvidence("PERSISTED_STATE_COUNT_MISMATCH", path, "Persisted-state aggregate counts contradict normalized rows");
  }
  let postgresqlConstraintsValid = null;
  if (planned.parameters.backend === "sqlite") {
    if (observations.postgresql_constraints !== "not_applicable") {
      failEvidence("PERSISTED_STATE_CONTRACT_INVALID", path, "SQLite snapshot must mark PostgreSQL constraints not applicable");
    }
  } else {
    if (!Array.isArray(observations.postgresql_constraints)) {
      failEvidence("POSTGRESQL_CONSTRAINT_EVIDENCE_INVALID", path, "PostgreSQL constraint evidence is absent");
    }
    const identities = new Set();
    let prior = null;
    let allValidated = true;
    for (const [index, constraint] of observations.postgresql_constraints.entries()) {
      if (!exactKeys(constraint, [
        "columns", "definition", "name", "referenced_columns", "referenced_schema", "referenced_table",
        "schema", "table", "type", "validated"
      ]) || !["schema", "table", "name", "type", "definition"].every((field) =>
        typeof constraint[field] === "string" && constraint[field] !== "") ||
        !Array.isArray(constraint.columns) || !constraint.columns.every((entry) => typeof entry === "string" && entry !== "") ||
        !Array.isArray(constraint.referenced_columns) ||
        !constraint.referenced_columns.every((entry) => typeof entry === "string" && entry !== "") ||
        !(constraint.referenced_schema === null || typeof constraint.referenced_schema === "string") ||
        !(constraint.referenced_table === null || typeof constraint.referenced_table === "string") ||
        typeof constraint.validated !== "boolean") {
        failEvidence("POSTGRESQL_CONSTRAINT_EVIDENCE_INVALID", `${path}#constraint-${index}`, "PostgreSQL constraint row is malformed");
      }
      const ordering = `${constraint.schema}\0${constraint.table}\0${constraint.name}`;
      if (prior !== null && ordering <= prior) {
        failEvidence("POSTGRESQL_CONSTRAINT_EVIDENCE_INVALID", `${path}#constraint-${index}`, "PostgreSQL constraints are not uniquely sorted");
      }
      prior = ordering;
      allValidated &&= constraint.validated;
      identities.add(canonicalJson({
        schema: constraint.schema,
        table: constraint.table,
        type: constraint.type,
        columns: constraint.columns,
        referenced_schema: constraint.referenced_schema,
        referenced_table: constraint.referenced_table,
        referenced_columns: constraint.referenced_columns
      }));
    }
    const required = ["supersedes_id", "superseded_by_id"].map((column) => canonicalJson({
      schema: "public", table: "memories", type: "foreign_key", columns: [column],
      referenced_schema: "public", referenced_table: "memories", referenced_columns: ["id"]
    }));
    postgresqlConstraintsValid = allValidated && required.every((identity) => identities.has(identity));
  }
  return {
    rows,
    expectedLive: [...expectedContents.values()].reduce((sum, value) => sum + value, 0),
    markerValid: markerDifferences.length === 0 && unexpectedContents.length === 0,
    supersessionValid: supersessionErrors.length === 0,
    deleteValid: deleteErrors.length === 0,
    faultValid: faultErrors.length === 0,
    memoryCount: rows.length,
    ftsCount,
    vectorCount,
    postgresqlConstraintsValid
  };
}

function recomputeOracleCheck(name, check, context) {
  const { workload, oracleStart, cellInput, planned, persisted } = context;
  const observed = check.observed;
  // Derivation (adapters/hc-cortex-002/README.md "Executable fixture"): setup seeds 2N+1
  // disjoint targets (N supersession + N deletion + 1 fault), load adds N new rows from
  // supersede and N from plain remember, then removes the N deleted targets:
  // (2N+1) + N (remember) + N (supersede result rows) - N (forgotten) = 3N+1.
  const expectedLive = 3 * planned.parameters.operationsPerType + 1;
  if (name === "workload_terminal") return workload.terminal.state === "complete";
  if (name === "release_protocol_cell_attempt_binding") {
    const workloadIdentity = Object.fromEntries(sharedIdentityFields.map((field) => [field, workload.start[field]]));
    const oracleIdentity = Object.fromEntries(sharedIdentityFields.map((field) => [field, oracleStart[field]]));
    return equalJson(observed, workloadIdentity) && equalJson(check.expected, oracleIdentity) &&
      equalJson(workloadIdentity, oracleIdentity);
  }
  if (name === "configuration_binding") {
    const expected = {
      process_start_count: 1,
      backend: planned.parameters.backend,
      concurrency: planned.parameters.concurrency,
      operations_per_type: planned.parameters.operationsPerType,
      database_identity_sha256: oracleStart.database_identity_sha256
      ,postgresql_service: oracleStart.postgresql_service ?? null
    };
    const workloadConfiguration = {
      process_start_count: 1,
      backend: workload.start.backend,
      concurrency: workload.start.concurrency,
      operations_per_type: workload.start.operations_per_type,
      database_identity_sha256: workload.start.database_identity_sha256
      ,postgresql_service: workload.start.postgresql_service ?? null
    };
    return equalJson(observed, workloadConfiguration) && equalJson(check.expected, expected) &&
      equalJson(workloadConfiguration, expected);
  }
  if (name === "fresh_process_restart") {
    const exact = {
      workload_boot_nonce: workload.start.boot_nonce,
      oracle_boot_nonce: oracleStart.boot_nonce,
      workload_process_instance_id: workload.start.process_instance_id,
      oracle_process_instance_id: oracleStart.process_instance_id
    };
    return equalJson(observed, exact) && observed.workload_boot_nonce !== observed.oracle_boot_nonce &&
      observed.workload_process_instance_id !== observed.oracle_process_instance_id;
  }
  if (name === "fresh_empty_database_preflight") {
    return observed?.preflight_count === 1 && observed.observation?.checked_before_store_initialization === true &&
      observed.observation?.empty === true && observed.observation?.user_relation_count === 0;
  }
  if (name === "planned_operation_counts") {
    const expected = expectedIntentCounts(planned.parameters.operationsPerType);
    return equalJson(observed, expected) && equalJson(check.expected, expected);
  }
  if (name === "one_outcome_per_intent") {
    return observed?.intents === workload.intents.length && observed?.unique_intents === workload.intents.length &&
      observed?.outcomes === workload.outcomes.length && empty(observed?.duplicate_or_missing);
  }
  if (name === "acknowledged_and_rejected_contract") return empty(observed);
  if (name === "post_load_health_is_read_only") {
    const recoveryOutcome = workload.outcomes.find((entry) => entry.operation === "recovery_health");
    const base = observed?.intent_count === 1 && observed.marker === null && observed.target_id === null &&
      observed.result?.memory_count === persisted.memoryCount && observed.result?.fts_count === persisted.ftsCount &&
      observed.result?.vector_count === persisted.vectorCount && persisted.memoryCount === expectedLive &&
      persisted.ftsCount === expectedLive && persisted.vectorCount === expectedLive &&
      equalJson(observed.result, recoveryOutcome?.result);
    if (!base) return false;
    if (planned.parameters.backend !== "sqlite") return true;
    return observed.result.vector_available === true && Array.isArray(observed.result.sqlite_integrity) &&
      observed.result.sqlite_integrity.length === 1 && Object.values(observed.result.sqlite_integrity[0]).length === 1 &&
      Object.values(observed.result.sqlite_integrity[0])[0] === "ok" &&
      equalJson(observed.result.sqlite_foreign_key_violations, []);
  }
  if (name === "fault_retry_choreography") {
    const expectedRetries = planned.parameters.backend === "sqlite" && planned.parameters.concurrency >= 2 ? 1 : 0;
    return observed === workload.retries.length && observed === expectedRetries && check.expected === expectedRetries;
  }
  if (name === "marker_exactly_once_and_rejected_zero") {
    return persisted.markerValid;
  }
  if (name === "supersession_state") return persisted.supersessionValid;
  if (name === "delete_state") return persisted.deleteValid;
  if (name === "fault_rollback_state") return persisted.faultValid;
  if (name === "final_live_count_formula") return observed === expectedLive && check.expected === expectedLive;
  if (["memory_count", "fts_count", "vector_count"].includes(name)) {
    const count = name === "memory_count" ? persisted.memoryCount : name === "fts_count" ? persisted.ftsCount : persisted.vectorCount;
    return observed?.available === true && observed.count === count && count === expectedLive && check.expected === expectedLive;
  }
  if (name === "sqlite_integrity") {
    return Array.isArray(observed) && observed.length === 1 && isPlainObject(observed[0]) &&
      Object.values(observed[0]).length === 1 && Object.values(observed[0])[0] === "ok";
  }
  if (name === "sqlite_foreign_keys") return empty(observed);
  if (name === "postgresql_constraints_validated") return persisted.postgresqlConstraintsValid === true;
  if (name === "load_telemetry_scope_and_types") {
    const load = workload.measurement.observations?.load;
    const expectedTypes = {
      remember: planned.parameters.operationsPerType,
      supersede_atomic: planned.parameters.operationsPerType,
      forget: planned.parameters.operationsPerType,
      faulted_supersede: 1
    };
    return observed?.summary_count === 1 && observed.completed_operations === 3 * planned.parameters.operationsPerType + 1 &&
      observed.completed_operations === load?.completed_operations &&
      equalJson(observed.per_operation_completed, expectedTypes) &&
      observed.quantile_method === load?.latency_quantile_method &&
      observed.throughput_denominator === load?.throughput_denominator;
  }
  if (name === "load_window_exact") {
    const loadWindowEvents = workload.records.filter((record) => record.event === "load_window");
    const loadIntents = workload.intents.filter((intent) => intent.phase === "load");
    const loadOutcomes = workload.outcomes.filter((outcome) => outcome.phase === "load");
    const start = decimalBigInt(observed?.start_monotonic_ns, cellInput.id, "start_monotonic_ns");
    const end = decimalBigInt(observed?.end_monotonic_ns, cellInput.id, "end_monotonic_ns");
    const elapsed = decimalBigInt(observed?.elapsed_ns, cellInput.id, "elapsed_ns");
    const summaryElapsed = workload.measurement.observations?.load?.elapsed_ns;
    return loadWindowEvents.length === 1 && observed?.event_count === 1 &&
      end >= start && end - start === elapsed &&
      observed?.start_monotonic_ns === workload.loadWindow.start_monotonic_ns &&
      observed?.end_monotonic_ns === workload.loadWindow.end_monotonic_ns &&
      observed?.elapsed_ns === workload.loadWindow.elapsed_ns &&
      typeof summaryElapsed === "number" && BigInt(summaryElapsed) === elapsed &&
      observed?.summary_elapsed_ns === summaryElapsed &&
      observed?.load_intent_count === loadIntents.length &&
      observed?.load_outcome_count === loadOutcomes.length &&
      loadIntents.every((intent) => BigInt(intent.monotonic_ns) >= start) &&
      loadOutcomes.every((outcome) => BigInt(outcome.monotonic_ns) <= end);
  }
  if (name === "zero_model_remote_tool_boundary") {
    return equalJson(observed, {
      model_calls: 0,
      remote_tool_calls: 0,
      attributable_cost: null,
      unit: "not-applicable"
    }) &&
      equalJson(observed, workload.measurement.observations?.model_tool_cost);
  }
  if (name === "connection_telemetry_shape") {
    return isPlainObject(observed) && Object.hasOwn(observed, "method") &&
      Object.hasOwn(observed, "open_after_load") && Object.hasOwn(observed, "peak_open") &&
      equalJson(observed, workload.measurement.observations?.connections);
  }
  failEvidence("ORACLE_CHECK_UNKNOWN", cellInput.id, `Analyzer has no registered interpretation for ${name}`);
}

function validateOracleLedger(ledger, workloadLedger, workload, cellInput, planned, provenance, path) {
  const records = ledger.records;
  const start = one(records, "process_start", path);
  const verified = one(records, "workload_ledger_verified", path);
  const result = one(records, "oracle_result", path);
  const terminal = one(records, "terminal", path);
  if (records[0] !== start || records.at(-1) !== terminal || start.mode !== "oracle" ||
      start.backend !== planned.parameters.backend || start.concurrency !== planned.parameters.concurrency ||
      start.operations_per_type !== planned.parameters.operationsPerType || start.run_id !== cellInput.runId ||
      !sharedIdentity(workloadLedger.identity, ledger.identity) ||
      workloadLedger.identity.process_instance_id === ledger.identity.process_instance_id ||
      start.boot_nonce === workload.start.boot_nonce || start.database_identity_sha256 !== workload.start.database_identity_sha256 ||
      !equalJson(start.postgresql_service ?? null, workload.start.postgresql_service ?? null) ||
      verified.workload_sha256 !== workloadLedger.sha256 || verified.workload_records !== workloadLedger.records.length ||
      terminal.state !== "complete" || terminal.store_closed !== true) {
    failEvidence("ORACLE_BINDING_INVALID", path, "Oracle does not prove an independent restart over the workload chain");
  }
  validateStartRuntime(start, planned, provenance, path);
  if (!isPlainObject(result.checks)) failEvidence("ORACLE_CHECKS_MISSING", path, "Oracle result has no exact check ledger");
  const names = Object.keys(result.checks).sort(lexicalCompare);
  if (!equalJson(names, expectedCheckSet(planned.parameters.backend))) {
    failEvidence("ORACLE_CHECK_SET_INVALID", path, "Oracle check set differs from the registered HC-CORTEX-002 predicates");
  }
  const persisted = persistedState(workload, result.observations, planned, path);
  // Derivation (see the twin comment in recomputeOracleCheck): 2N+1 seeds, +N remembers,
  // +N supersede-result rows, -N forgotten targets = 3N+1 live rows.
  const expectedLive = 3 * planned.parameters.operationsPerType + 1;
  if (persisted.expectedLive !== expectedLive) {
    failEvidence("PERSISTED_STATE_COUNT_MISMATCH", path, "Marker-derived live count contradicts the registered operation formula");
  }
  const recomputed = {};
  for (const name of names) {
    const check = result.checks[name];
    checkShape(check, `${path}#${name}`);
    const passed = Boolean(recomputeOracleCheck(name, check, { workload, oracleStart: start, cellInput, planned, persisted }));
    if (check.passed !== passed) failEvidence("ORACLE_CHECK_VERDICT_MISMATCH", `${path}#${name}`, "Oracle pass flag contradicts its observations");
    recomputed[name] = passed;
  }
  const verdict = Object.values(recomputed).every(Boolean) ? "proven" : "blocked";
  if (result.verdict !== verdict || terminal.verdict !== verdict) {
    failEvidence("ORACLE_VERDICT_MISMATCH", path, "Oracle verdict does not equal the conjunction of exact checks");
  }
  return { start, result, terminal, checks: recomputed, verdict, observations: result.observations };
}

function quantileShape(value) {
  return isPlainObject(value) && ["p50", "p95", "p99"].every((key) => integerNonNegative(value[key]));
}

function decimalBigInt(value, path, field) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    failEvidence("LOAD_WINDOW_INVALID", path, `${field} is not a canonical non-negative integer`);
  }
  return BigInt(value);
}

function quantileType1(values, probability) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const rank = probability === 0 ? 1 : Math.min(ordered.length, Math.ceil(ordered.length * probability));
  return ordered[rank - 1];
}

function quantiles(values) {
  if (values.length === 0) return null;
  return {
    p50: quantileType1(values, 0.50),
    p95: quantileType1(values, 0.95),
    p99: quantileType1(values, 0.99)
  };
}

function countOutcomes(records) {
  return Object.fromEntries(Object.entries(countBy(records, "outcome")).sort(([left], [right]) => lexicalCompare(left, right)));
}

function recomputedBucket(records, retries, elapsedNs) {
  const timing = (field) => records.map((entry) => entry.timing?.[field]).filter((value) => value !== null);
  const elapsedSeconds = elapsedNs / 1_000_000_000;
  return {
    completed_operations: records.length,
    elapsed_ns: elapsedNs,
    throughput_operations_per_second: elapsedSeconds === 0 ? null : records.length / elapsedSeconds,
    throughput_denominator: "common measured load wall time",
    latency_quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
    total_latency_ns: quantiles(timing("total_ns")),
    service_latency_ns: quantiles(timing("service_ns")),
    queue_latency_ns: quantiles(timing("queue_ns")),
    outcomes: countOutcomes(records),
    error_events: records.filter((entry) => entry.error !== null).length,
    retry_events: retries.length
  };
}

function recomputeQueueDepth(outcomes, path) {
  const events = [];
  for (const outcome of outcomes) {
    if (outcome.admission?.queued !== true) continue;
    const entered = decimalBigInt(outcome.admission.entered_monotonic_ns, path, "entered_monotonic_ns");
    const acquired = decimalBigInt(outcome.admission.acquired_monotonic_ns, path, "acquired_monotonic_ns");
    if (acquired < entered || acquired - entered !== BigInt(outcome.timing?.queue_ns)) {
      failEvidence("LOAD_METRICS_RAW_INVALID", path, "Queued admission interval contradicts operation timing");
    }
    events.push({ at: entered, delta: 1 }, { at: acquired, delta: -1 });
  }
  events.sort((left, right) => left.at < right.at ? -1 : left.at > right.at ? 1 : left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    if (active < 0) failEvidence("LOAD_METRICS_RAW_INVALID", path, "Queue interval ordering is ambiguous");
    maximum = Math.max(maximum, active);
  }
  if (active !== 0) failEvidence("LOAD_METRICS_RAW_INVALID", path, "Queue intervals do not close");
  return maximum;
}

function recomputeDispatcherInflight(records, path) {
  let active = 0;
  let maximum = 0;
  for (const record of records) {
    if (record.phase !== "load") continue;
    if (record.event === "operation_intent") {
      active += 1;
      maximum = Math.max(maximum, active);
    } else if (record.event === "operation_outcome") {
      active -= 1;
      if (active < 0) failEvidence("LOAD_METRICS_RAW_INVALID", path, "Load outcome precedes its dispatcher intent");
    }
  }
  if (active !== 0) failEvidence("LOAD_METRICS_RAW_INVALID", path, "Dispatcher intervals do not close");
  return maximum;
}

function recomputeLoadMetrics(workload, path) {
  const window = workload.loadWindow;
  const start = decimalBigInt(window.start_monotonic_ns, path, "start_monotonic_ns");
  const end = decimalBigInt(window.end_monotonic_ns, path, "end_monotonic_ns");
  const elapsed = decimalBigInt(window.elapsed_ns, path, "elapsed_ns");
  if (end < start || end - start !== elapsed || elapsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    failEvidence("LOAD_WINDOW_INVALID", path, "Measured load window arithmetic is inconsistent or exceeds exact JSON integers");
  }
  const elapsedNs = Number(elapsed);
  const outcomes = workload.outcomes.filter((entry) => entry.phase === "load");
  const retries = workload.retries.filter((entry) => entry.phase === "load");
  for (const outcome of outcomes) {
    for (const field of ["total_ns", "service_ns", "queue_ns"]) {
      if (!integerNonNegative(outcome.timing?.[field])) {
        failEvidence("LOAD_METRICS_RAW_INVALID", path, `Load outcome has invalid ${field}`);
      }
    }
    if (!isPlainObject(outcome.admission) || outcome.admission.observed !== true ||
        !["acknowledged", "rejected", "indeterminate"].includes(outcome.outcome)) {
      failEvidence("LOAD_METRICS_RAW_INVALID", path, "Load outcome lacks observed admission or terminal state");
    }
  }
  const byOperation = {};
  for (const operation of [...new Set(outcomes.map((entry) => entry.operation))].sort(lexicalCompare)) {
    byOperation[operation] = recomputedBucket(
      outcomes.filter((entry) => entry.operation === operation),
      retries.filter((entry) => entry.operation === operation),
      elapsedNs
    );
  }
  return {
    ...recomputedBucket(outcomes, retries, elapsedNs),
    elapsed_ns: elapsedNs,
    throughput_denominator: "common measured load wall time",
    latency_quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
    max_queue_depth: recomputeQueueDepth(outcomes, path),
    queue_boundary: "Cortex safe_handler source admission semaphore",
    max_dispatcher_inflight: recomputeDispatcherInflight(workload.records, path),
    per_operation_type: byOperation
  };
}

function extractMetrics(workload, oracle, planned) {
  const observations = workload.measurement.observations ?? {};
  const load = recomputeLoadMetrics(workload, workload.path);
  if (!equalJson(load, observations.load)) {
    failEvidence("LOAD_METRICS_RECOMPUTATION_MISMATCH", workload.path, "Published load metrics differ from raw operation evidence");
  }
  const missing = [];
  if (!isPlainObject(load) || !finiteNonNegative(load.throughput_operations_per_second)) missing.push("throughput.aggregate");
  for (const dimension of ["total_latency_ns", "service_latency_ns", "queue_latency_ns"]) {
    if (!quantileShape(load?.[dimension])) missing.push(`latency.aggregate.${dimension}`);
  }
  if (!integerNonNegative(load?.max_queue_depth)) missing.push("queue-depth.maximum");
  if (!integerNonNegative(load?.max_dispatcher_inflight)) missing.push("dispatcher-inflight.maximum");
  for (const operation of ["faulted_supersede", "forget", "remember", "supersede_atomic"]) {
    const metric = load?.per_operation_type?.[operation];
    if (!isPlainObject(metric) || !finiteNonNegative(metric.throughput_operations_per_second)) {
      missing.push(`throughput.${operation}`);
      continue;
    }
    for (const dimension of ["total_latency_ns", "service_latency_ns", "queue_latency_ns"]) {
      if (!quantileShape(metric[dimension])) missing.push(`latency.${operation}.${dimension}`);
    }
  }
  if (!isPlainObject(observations.resources) || !finiteNonNegative(observations.resources.user_seconds) ||
      !finiteNonNegative(observations.resources.system_seconds) ||
      !(observations.resources.max_rss_bytes === null || integerNonNegative(observations.resources.max_rss_bytes)) ||
      typeof observations.resources.max_rss_observation !== "string") missing.push("cpu-memory");
  if (!isPlainObject(observations.storage_bytes) || Object.values(observations.storage_bytes).some((value) => !integerNonNegative(value))) {
    missing.push("storage-bytes");
  }
  if (!isPlainObject(observations.connections) || !Object.hasOwn(observations.connections, "method") ||
      !Object.hasOwn(observations.connections, "open_after_load") || !Object.hasOwn(observations.connections, "peak_open")) {
    missing.push("database-connections");
  }
  if (!isPlainObject(observations.recovery?.timing) || !integerNonNegative(observations.recovery.timing.total_ns) ||
      observations.recovery.state_change !== "none; read-only count observation") missing.push("post-load-recovery");
  if (!equalJson(observations.model_tool_cost, {
    model_calls: 0,
    remote_tool_calls: 0,
    attributable_cost: null,
    unit: "not-applicable"
  })) {
    missing.push("model-tool-cost");
  }
  const loadOutcomes = workload.outcomes.filter((entry) => entry.phase === "load");
  const errors = loadOutcomes.filter((entry) => entry.error !== null).length;
  const indeterminate = loadOutcomes.filter((entry) => entry.outcome === "indeterminate").length;
  return {
    throughput: load?.throughput_operations_per_second ?? null,
    latencyNs: {
      total: load?.total_latency_ns ?? null,
      service: load?.service_latency_ns ?? null,
      queue: load?.queue_latency_ns ?? null
    },
    perOperationType: load?.per_operation_type ?? null,
    maxQueueDepth: load?.max_queue_depth ?? null,
    maxDispatcherInflight: load?.max_dispatcher_inflight ?? null,
    errors,
    indeterminate,
    retries: workload.retries.length,
    resources: observations.resources ?? null,
    storageBytes: observations.storage_bytes ?? null,
    connections: observations.connections ?? null,
    recovery: observations.recovery ?? null,
    persistedState: oracle?.observations ?? null,
    modelToolCost: observations.model_tool_cost ?? null,
    missing: [...new Set(missing)].sort(lexicalCompare)
  };
}

function rawCellArtifacts(snapshot, ordinal) {
  const prefix = `cells/${String(ordinal).padStart(4, "0")}/`;
  return [...snapshot.files.keys()].filter((path) => path.startsWith(prefix)).sort(lexicalCompare);
}

function summaryMatchesResult(summaryCell, result) {
  for (const field of ["id", "ordinal", "expectedVerdict", "verdict", "status", "reason"]) {
    if ((summaryCell[field] ?? null) !== (result[field] ?? null)) return false;
  }
  return true;
}

function incompleteCell(snapshot, summaryCell, planned, ordinal, details = {}) {
  const correctnessLabel = summaryCell.status === "indeterminate" ? "INDETERMINATE" : "FAIL";
  return {
    id: planned.id,
    ordinal,
    phase: planned.parameters.phase,
    backend: planned.parameters.backend,
    repetition: planned.parameters.repetition,
    concurrency: planned.parameters.concurrency,
    sourceId: planned.parameters.sourceId,
    expectedVerdict: planned.expectedVerdict,
    observedVerdict: summaryCell.verdict ?? null,
    expectationMatch: false,
    correctnessLabel,
    executionStatus: summaryCell.status,
    reason: summaryCell.reason,
    failedChecks: [],
    metrics: null,
    evidenceComplete: false,
    attemptId: details.attemptId ?? null,
    startedAt: details.startedAt ?? null,
    endedAt: details.endedAt ?? null,
    processReceipts: details.processReceipts ?? null,
    ledgerReceipts: details.ledgerReceipts ?? null,
    rawArtifactPaths: rawCellArtifacts(snapshot, ordinal)
  };
}

function analyzeCell(snapshot, summaryCell, planned, ordinal, bindings) {
  if (summaryCell.status === "not-run") return null;
  const cellRoot = `cells/${String(ordinal).padStart(4, "0")}`;
  if (!snapshot.files.has(`${cellRoot}/cell.json`) || !snapshot.files.has(`${cellRoot}/cell-result.json`)) {
    return incompleteCell(snapshot, summaryCell, planned, ordinal);
  }
  const cellInput = pathRecord(snapshot, `${cellRoot}/cell.json`, "workload-cell-input/v1");
  const result = pathRecord(snapshot, `${cellRoot}/cell-result.json`, "workload-cell-result/v1");
  if (cellInput.id !== planned.id || cellInput.ordinal !== ordinal || cellInput.expectedVerdict !== planned.expectedVerdict ||
      cellInput.protocolId !== bindings.protocol.protocolId || cellInput.protocolSha256 !== bindings.protocolSha256 ||
      cellInput.runAttemptId !== bindings.lock.runAttemptId || !safeIdentifier(cellInput.attemptId) ||
      !safeIdentifier(cellInput.runId) || !equalJson(cellInput.parameters, planned.parameters) ||
      !digestPattern(cellInput.database?.databaseIdentitySha256) ||
      (planned.parameters.backend === "postgresql"
        ? !safeIdentifier(cellInput.postgresqlService?.serviceInstanceId) ||
          !utcTimestamp(cellInput.postgresqlService?.startedAt) ||
          !Number.isSafeInteger(cellInput.postgresqlService?.processId)
        : cellInput.postgresqlService !== null) ||
      cellInput.source?.id !== planned.parameters.sourceId ||
      cellInput.source?.revision !== bindings.provenance.sources.get(planned.parameters.sourceId)?.revision ||
      !summaryMatchesResult(summaryCell, result) ||
      result.attemptId !== cellInput.attemptId) {
    failEvidence("CELL_RECEIPT_MISMATCH", cellRoot, "Cell input, result, summary, and preregistration do not match");
  }
  const partialDetails = {
    attemptId: cellInput.attemptId,
    startedAt: result.startedAt ?? null,
    endedAt: result.endedAt ?? null
  };
  if (!result.workloadProcessPath) return incompleteCell(snapshot, summaryCell, planned, ordinal, partialDetails);
  const workloadProcess = validateProcess(
    snapshot, result.workloadProcessPath, "workload", cellInput, planned, bindings
  );
  if (workloadProcess.record.adapterEnvelope.verdict !== "pending") {
    failEvidence("WORKLOAD_ENVELOPE_VERDICT_INVALID", result.workloadProcessPath, "Workload verdict must remain pending until restart reconciliation");
  }
  const workload = validateWorkloadLedger(
    workloadProcess.ledger, cellInput, planned, bindings.provenance, workloadProcess.ledgerPath
  );
  if (!result.oracleProcessPath) {
    return incompleteCell(snapshot, summaryCell, planned, ordinal, {
      ...partialDetails,
      processReceipts: {
        workload: result.workloadProcessPath,
        oracle: null,
        workloadProcessInstanceId: workloadProcess.record.processInstanceId,
        oracleProcessInstanceId: null,
        attemptId: cellInput.attemptId
      },
      ledgerReceipts: {
        workload: {
          path: workloadProcess.ledgerPath,
          sha256: workloadProcess.ledger.sha256,
          records: workloadProcess.ledger.records.length
        },
        oracle: null
      }
    });
  }
  const oracleProcess = validateProcess(
    snapshot, result.oracleProcessPath, "oracle", cellInput, planned, bindings
  );
  const oracle = validateOracleLedger(
    oracleProcess.ledger,
    workloadProcess.ledger,
    workload,
    cellInput,
    planned,
    bindings.provenance,
    oracleProcess.ledgerPath
  );
  if (oracleProcess.record.adapterEnvelope.verdict !== oracle.verdict || result.verdict !== oracle.verdict) {
    failEvidence("CELL_ORACLE_VERDICT_MISMATCH", cellRoot, "Cell result and process envelope contradict the recomputed oracle");
  }
  const failedChecks = Object.entries(oracle.checks).filter(([, passed]) => !passed).map(([name]) => name);
  const baselineControl = planned.id === "regression-baseline-sqlite-c2";
  const baselineCauseValid = baselineControl && isCausalBaselineFailureSet(failedChecks);
  const expectationMatch = oracle.verdict === planned.expectedVerdict && (!baselineControl || baselineCauseValid);
  const metrics = extractMetrics(workload, oracle, planned);
  return {
    id: planned.id,
    ordinal,
    phase: planned.parameters.phase,
    backend: planned.parameters.backend,
    repetition: planned.parameters.repetition,
    concurrency: planned.parameters.concurrency,
    sourceId: planned.parameters.sourceId,
    expectedVerdict: planned.expectedVerdict,
    observedVerdict: oracle.verdict,
    expectationMatch,
    correctnessLabel: oracle.verdict === "proven" ? "PASS" : "FAIL",
    executionStatus: result.status,
    reason: result.reason,
    attemptId: cellInput.attemptId,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    failedChecks,
    metrics,
    evidenceComplete: result.status === "passed" && expectationMatch && metrics.missing.length === 0,
    processReceipts: {
      workload: result.workloadProcessPath,
      oracle: result.oracleProcessPath,
      workloadProcessInstanceId: workloadProcess.record.processInstanceId,
      oracleProcessInstanceId: oracleProcess.record.processInstanceId,
      attemptId: cellInput.attemptId
    },
    ledgerReceipts: {
      workload: { path: workloadProcess.ledgerPath, sha256: workloadProcess.ledger.sha256, records: workloadProcess.ledger.records.length },
      oracle: { path: oracleProcess.ledgerPath, sha256: oracleProcess.ledger.sha256, records: oracleProcess.ledger.records.length }
    },
    rawArtifactPaths: rawCellArtifacts(snapshot, ordinal)
  };
}

function saturationForBackend(cells, protocol, backend) {
  const levels = protocol.workload.concurrencyLevels.value;
  const repetitions = Array.from({ length: protocol.repetitions.count }, (_, index) => index + 1);
  const lookup = new Map(cells.filter((cell) => cell?.phase === "main" && cell.backend === backend)
    .map((cell) => [`${cell.repetition}:${cell.concurrency}`, cell]));
  const missing = [];
  for (const repetition of repetitions) {
    for (const concurrency of levels) {
      const cell = lookup.get(`${repetition}:${concurrency}`);
      if (!cell) missing.push(`r${repetition}-c${concurrency}:cell`);
      else if (!finiteNonNegative(cell.metrics?.throughput)) missing.push(`${cell.id}:throughput`);
      else if (!integerNonNegative(cell.metrics?.latencyNs?.queue?.p95)) missing.push(`${cell.id}:queue-p95`);
      else if (!integerNonNegative(cell.metrics?.maxQueueDepth)) missing.push(`${cell.id}:max-queue-depth`);
    }
  }
  if (missing.length > 0) return { backend, status: "INDETERMINATE", onsetConcurrency: null, comparisons: [], missing };
  const comparisons = [];
  let onset = null;
  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1];
    const current = levels[index];
    const perRepetition = repetitions.map((repetition) => {
      const left = lookup.get(`${repetition}:${previous}`);
      const right = lookup.get(`${repetition}:${current}`);
      return {
        repetition,
        throughputNonIncrease: right.metrics.throughput <= left.metrics.throughput,
        queueP95Increase: right.metrics.latencyNs.queue.p95 > left.metrics.latencyNs.queue.p95,
        maxQueueDepthIncrease: right.metrics.maxQueueDepth > left.metrics.maxQueueDepth
      };
    });
    const satisfies = perRepetition.every((entry) =>
      entry.throughputNonIncrease && entry.queueP95Increase && entry.maxQueueDepthIncrease
    );
    comparisons.push({ previousConcurrency: previous, concurrency: current, repetitions: perRepetition, satisfies });
    if (onset === null && satisfies) onset = current;
  }
  return onset === null
    ? { backend, status: "NOT_OBSERVED", onsetConcurrency: null, comparisons, missing: [] }
    : { backend, status: "OBSERVED", onsetConcurrency: onset, comparisons, missing: [] };
}

function buildScoring(protocol, cells, saturation, generatedAt) {
  const byId = new Map(cells.filter(Boolean).map((cell) => [cell.id, cell]));
  const baseline = byId.get("regression-baseline-sqlite-c2");
  const candidate = byId.get("regression-candidate-sqlite-c2");
  const causalPass = baseline?.observedVerdict === "blocked" && baseline.expectationMatch === true &&
    candidate?.observedVerdict === "proven" && candidate.expectationMatch === true;
  const candidateCells = protocol.plannedCells.filter((cell) => cell.parameters.sourceId === "cortex-candidate");
  const absentCandidateIds = candidateCells.filter((planned) => !byId.has(planned.id)).map((planned) => planned.id);
  const observedCandidateFailures = candidateCells.map((planned) => byId.get(planned.id)).filter((cell) =>
    cell && (cell.observedVerdict !== "proven" || !cell.expectationMatch)
  );
  const incompleteCandidateIds = candidateCells.map((planned) => byId.get(planned.id)).filter((cell) =>
    cell && cell.observedVerdict === "proven" && cell.expectationMatch && !cell.evidenceComplete
  ).map((cell) => cell.id);
  const candidateProblemIds = [
    ...absentCandidateIds,
    ...observedCandidateFailures.map((cell) => cell.id),
    ...incompleteCandidateIds
  ];
  const fullMatrix = cells.filter(Boolean).length === protocol.plannedCells.length;
  let label = "PASS";
  const reasons = [];
  if (!fullMatrix) {
    label = "INDETERMINATE";
    reasons.push("The complete preregistered matrix was not observed.");
  }
  if (!causalPass) {
    label = "FAIL";
    reasons.push("The required baseline RED to candidate GREEN causal contrast was not reproduced exactly.");
  }
  if (observedCandidateFailures.length > 0) {
    label = "FAIL";
    reasons.push("At least one candidate cell is absent, non-conformant, or missing preregistered evidence.");
  } else if ((absentCandidateIds.length > 0 || incompleteCandidateIds.length > 0) && label !== "FAIL") {
    label = "INDETERMINATE";
    reasons.push("At least one candidate cell is absent or missing preregistered evidence.");
  }
  if (reasons.length === 0) reasons.push("The causal control and every candidate cell match the preregistered exact verdicts.");
  return {
    schemaVersion: scoringSchemaVersion,
    generatedAt,
    protocolId: protocol.protocolId,
    aggregatePolicy: "No maturity score or performance winner is computed for this issue-specific experiment.",
    causalContrast: {
      label: causalPass ? "PASS" : "FAIL",
      baseline: baseline ? { id: baseline.id, state: baseline.observedVerdict === "blocked" ? "RED" : "UNEXPECTED_GREEN", failedChecks: baseline.failedChecks } : null,
      candidate: candidate ? { id: candidate.id, state: candidate.observedVerdict === "proven" ? "GREEN" : "REGRESSION", failedChecks: candidate.failedChecks } : null,
      exactChange: causalPass ? "blocked (RED) -> proven (GREEN)" : null
    },
    candidateConformance: {
      label: observedCandidateFailures.length > 0
        ? "FAIL"
        : candidateProblemIds.length === 0 && fullMatrix ? "PASS" : "INDETERMINATE",
      requiredCells: candidateCells.length,
      conformantCells: candidateCells.length - candidateProblemIds.length,
      nonconformantCellIds: candidateProblemIds
    },
    studyVerdict: { label, reasons },
    descriptiveSaturation: saturation,
    cells: cells.filter(Boolean).map((cell) => ({
      id: cell.id,
      correctnessLabel: cell.correctnessLabel,
      expectedVerdict: cell.expectedVerdict,
      observedVerdict: cell.observedVerdict,
      expectationMatch: cell.expectationMatch,
      evidenceComplete: cell.evidenceComplete
    }))
  };
}

function negativeEvidence(summary, cells, protocol) {
  const byId = new Map(cells.filter(Boolean).map((cell) => [cell.id, cell]));
  return {
    schemaVersion: "hc-cortex-002-negative-evidence/v1",
    declaredDeviations: protocol.declaredDeviations,
    nonClaims: protocol.nonClaims,
    entries: summary.cells.filter((entry) => entry.status !== "passed" || entry.verdict === "blocked").map((entry) => ({
      cellId: entry.id,
      status: entry.status,
      verdict: entry.verdict ?? null,
      reason: entry.reason ?? null,
      failedChecks: byId.get(entry.id)?.failedChecks ?? [],
      expectedNegativeControl: entry.id === "regression-baseline-sqlite-c2" && entry.verdict === "blocked"
    }))
  };
}

function markdownAnalysis(analysis, scoring) {
  const rows = analysis.cells.map((cell) =>
    `| ${cell.id} | ${cell.expectedVerdict} | ${cell.observedVerdict ?? "not observed"} | ${cell.correctnessLabel} | ${cell.evidenceComplete ? "complete" : "incomplete"} |`
  ).join("\n");
  return `# HC-CORTEX-002 independent analysis\n\n` +
    `Generated: ${analysis.generatedAt}\n\n` +
    `Study verdict: **${scoring.studyVerdict.label}**. Causal contrast: **${scoring.causalContrast.label}**. ` +
    `This issue-specific analysis deliberately computes no aggregate maturity score.\n\n` +
    `| Cell | Expected | Observed | Correctness | Evidence |\n| --- | --- | --- | --- | --- |\n${rows}\n\n` +
    `## Descriptive saturation\n\n${analysis.saturation.map((entry) =>
      `- ${entry.backend}: ${entry.status}${entry.onsetConcurrency === null ? "" : ` at concurrency ${entry.onsetConcurrency}`}`
    ).join("\n")}\n\n` +
    `Declared deviations and non-claims are preserved verbatim in \`analysis/analysis.json\` and ` +
    `\`analysis/negative-evidence.json\`.\n`;
}

function outputDocuments(analysis, scoring, negative) {
  const missing = analysis.cells.flatMap((cell) => cell.metrics?.missing.map((entry) => `${cell.id}: ${entry}`) ?? []);
  return new Map([
    ["analysis/analysis.json", `${JSON.stringify(analysis, null, 2)}\n`],
    ["analysis/analysis.md", markdownAnalysis(analysis, scoring)],
    ["analysis/negative-evidence.json", `${JSON.stringify(negative, null, 2)}\n`],
    ["scoring/scoring.json", `${JSON.stringify(scoring, null, 2)}\n`],
    ["review/automated-review.md", `# Automated evidence review\n\nGenerated: ${analysis.generatedAt}\n\n` +
      `- Raw input set: \`${analysis.rawInputSetSha256}\` (${analysis.rawInputs.length} files).\n` +
      `- Cryptographic framing, process bindings, cell identities, oracle checks and privacy scan: passed.\n` +
      `- Missing preregistered observations: ${missing.length === 0 ? "none" : missing.join("; ")}.\n` +
      `- Scope: automated integrity review only; it is not a substitute for independent scientific peer review.\n`],
    ["REPRODUCE.md", `# Reproduce HC-CORTEX-002 analysis\n\n` +
      `From the registered harness-comparison revision, run:\n\n` +
      "```sh\nnode scripts/analyze-hc-cortex-002.mjs <release-root>\nnode scripts/seal-hc-cortex-002.mjs --status PILOT <release-root>\nnode scripts/validate-benchmark-release.mjs <release-root>\n```\n\n" +
      `The analyzer refuses overwrite, so reproduction starts from a byte-identical raw release copy whose input-set digest is ` +
      `\`${analysis.rawInputSetSha256}\`.\n`],
    ["CHANGELOG.md", `# Release change log\n\n- ${analysis.generatedAt}: independently verified raw runner evidence; generated analysis, scoring, negative-evidence, review, and reproduction artifacts.\n`]
  ]);
}

function writeOutputs(root, documents) {
  mkdirSync(join(root, "analysis"), { recursive: false, mode: 0o700 });
  mkdirSync(join(root, "scoring"), { recursive: false, mode: 0o700 });
  mkdirSync(join(root, "review"), { recursive: false, mode: 0o700 });
  for (const [path, content] of documents) {
    writeFileSync(join(root, ...path.split("/")), content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
}

export function analyzeHcCortex002Release(releaseRoot, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  if (!utcTimestamp(generatedAt)) failEvidence("GENERATED_AT_INVALID", "$", "Analysis timestamp must be UTC");
  const verifyExisting = options.verifyExisting === true;
  const exclusions = verifyExisting ? new Set([...outputPaths, "execution-manifest.json"]) : new Set();
  const initial = snapshotRelease(releaseRoot, exclusions);
  if (!verifyExisting) {
    for (const path of outputPaths) {
      if (initial.files.has(path)) failEvidence("ANALYSIS_ALREADY_EXISTS", path, "Analyzer never overwrites prior analysis");
    }
    if (initial.files.has("execution-manifest.json")) {
      failEvidence("RELEASE_ALREADY_SEALED", "execution-manifest.json", "Analyze raw evidence before sealing it");
    }
  }
  assertPrivateDataAbsent(initial);
  const { protocol, protocolFile } = validateProtocol(initial);
  const bindings = { ...validateReleaseBindings(initial, protocol, protocolFile), protocol };
  const cells = bindings.summary.cells.map((summaryCell, index) => {
    const planned = protocol.plannedCells[index];
    if (summaryCell.ordinal !== index + 1 || summaryCell.expectedVerdict !== planned.expectedVerdict) {
      failEvidence("RUN_SUMMARY_CELL_MISMATCH", `run-summary.json#${planned.id}`, "Summary cell contradicts its preregistration");
    }
    return analyzeCell(initial, summaryCell, planned, index + 1, bindings);
  });
  const cellEnds = cells.filter((cell) => cell?.endedAt !== null && cell?.endedAt !== undefined)
    .map((cell) => Date.parse(cell.endedAt));
  if (cellEnds.some((value) => !Number.isFinite(value)) ||
      (cellEnds.length > 0 && Date.parse(generatedAt) < Math.max(...cellEnds))) {
    failEvidence("ANALYSIS_TIMESTAMP_INVALID", "$", "Analysis cannot predate an attempted cell's terminal receipt");
  }
  const saturation = ["sqlite", "postgresql"].map((backend) => saturationForBackend(cells, protocol, backend));
  const rawInputs = inventory(initial);
  const analysis = {
    schemaVersion: analysisSchemaVersion,
    generatedAt,
    releaseId: bindings.summary.releaseId,
    protocolId: protocol.protocolId,
    protocolSha256: bindings.protocolSha256,
    runAttemptId: bindings.lock.runAttemptId,
    postgresqlService: bindings.postgresqlService,
    rawInputs,
    rawInputSetSha256: inventoryDigest(rawInputs),
    completeness: {
      plannedCells: protocol.plannedCells.length,
      attemptedCells: cells.filter(Boolean).length,
      skippedCells: bindings.summary.cells.filter((cell) => cell.status === "not-run").map((cell) => ({ id: cell.id, reason: cell.reason })),
      fullMatrix: cells.filter(Boolean).length === protocol.plannedCells.length
    },
    declaredDeviations: protocol.declaredDeviations,
    nonClaims: protocol.nonClaims,
    privacy: { status: "PASS", findings: [] },
    cells: cells.filter(Boolean),
    saturation
  };
  const scoring = buildScoring(protocol, cells, saturation, generatedAt);
  const negative = negativeEvidence(bindings.summary, cells, protocol);
  const documents = outputDocuments(analysis, scoring, negative);
  const confirmation = snapshotRelease(releaseRoot, exclusions);
  if (!sameSnapshot(initial, confirmation)) {
    failEvidence("RAW_RELEASE_CHANGED", "$", "Raw release changed while independent analysis was running");
  }
  if (options.write !== false && !verifyExisting) writeOutputs(initial.root, documents);
  return { analysis, scoring, negativeEvidence: negative, documents };
}

export function analysisOutputPaths() {
  return new Set(outputPaths);
}
