import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
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
import {
  analyzeHcCortex002Release,
  isCausalBaselineFailureSet
} from "./hc-cortex-002-analysis-lib.mjs";
import { validateBenchmarkRelease } from "./benchmark-release-lib.mjs";
import { EvidenceError, privacyFindings } from "./hc-cortex-002-evidence-lib.mjs";
import { sealHcCortex002Release } from "./hc-cortex-002-seal-lib.mjs";
import { verifyHcCortex002Release } from "./verify-hc-cortex-002-release-lib.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixedTime = "2026-08-31T00:00:00Z";
const protocolBytes = readFileSync(join(repositoryRoot, "protocols/2026-08-30-hc-cortex-002-v1.json"));
const protocol = JSON.parse(protocolBytes);
const protocolSha256 = hash(protocolBytes);
const releaseId = "release";
const runAttemptId = "00000000-0000-4000-8000-000000000000";
const runtimeSha256 = "a".repeat(64);
const adapterFile = {
  path: "adapters/hc-cortex-002/adapter.py",
  sha256: "1".repeat(64),
  bytes: 100
};
const adapterTreeSha256 = hash(Buffer.from(`${adapterFile.path}\0${adapterFile.sha256}\0${adapterFile.bytes}`));
const adapterReceipt = {
  id: "hc-cortex-002-adapter",
  path: adapterFile.path,
  sha256: adapterFile.sha256,
  interface: "hc-cortex-002/v1",
  runtimeId: "python-3.12",
  treeSha256: adapterTreeSha256,
  treeFiles: [adapterFile]
};
const runnerFile = { path: "scripts/workload-ladder-runner-lib.mjs", sha256: "2".repeat(64), bytes: 200 };
const runnerInputs = {
  sha256: hash(Buffer.from(`${runnerFile.path}\0${runnerFile.sha256}\0${runnerFile.bytes}`)),
  files: [runnerFile]
};
const runtimeInventoryPayload = {
  distributions: [],
  psycopg: { implementation: "python", libpq_version: 170000, version: "3.2.0" },
  python: { implementation: "CPython", version: "3.12.0" },
  sqlite: { compile_options: [], library_version: "3.45.0", module_version: "2.6.0" }
};
const runtimeEnvironmentIdentity = {
  schemaVersion: "python-runtime-environment/v1",
  sha256: hash(Buffer.from(stable(runtimeInventoryPayload))),
  ...runtimeInventoryPayload
};
const virtualEnvironment = {
  pyvenvCfgSha256: "3".repeat(64),
  pyvenvCfgBytes: 64,
  invocationIdentitySha256: "4".repeat(64),
  targetSha256: runtimeSha256
};

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceReceipt(sourceId) {
  const corpus = protocol.corpora.find((entry) => entry.id === sourceId);
  return {
    id: sourceId,
    revision: corpus.revision,
    checkoutIdentitySha256: hash(Buffer.from(`checkout:${sourceId}`)),
    locks: [{ path: "pyproject.toml", sha256: hash(Buffer.from(`lock:${sourceId}`)), bytes: 10 }],
    sourceFiles: [{
      path: "mcp_server/__init__.py",
      sha256: hash(Buffer.from(`init:${sourceId}`)),
      bytes: 20
    }]
  };
}

function runtimeObservation(sourceId) {
  const source = sourceReceipt(sourceId);
  return {
    cortex_commit: source.revision,
    cortex_checkout_identity_sha256: source.checkoutIdentitySha256,
    cortex_tree_dirty: false,
    mcp_server_init_sha256: source.sourceFiles[0].sha256,
    distribution_version: null,
    python_executable_name: "python",
    python_executable_identity_sha256: virtualEnvironment.invocationIdentitySha256,
    python_version: runtimeEnvironmentIdentity.python.version,
    platform: "fixture-platform"
  };
}

function ensure(path) {
  mkdirSync(path, { recursive: true });
}

function json(path, value) {
  ensure(join(path, ".."));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function chained(records, identity) {
  let previous = "0".repeat(64);
  return records.map((record, index) => {
    const payload = {
      schema: "hc-cortex-002-ledger/v1",
      sequence: index + 1,
      event: record.event,
      recorded_at: fixedTime,
      monotonic_ns: String(10_000_000_000_000_000n + BigInt(index)),
      prev_sha256: previous,
      ...identity,
      ...Object.fromEntries(Object.entries(record).filter(([key]) => key !== "event"))
    };
    const lineSha256 = hash(Buffer.from(stable(payload)));
    previous = lineSha256;
    return { ...payload, line_sha256: lineSha256 };
  });
}

function writeLedger(path, records, identity) {
  const lines = chained(records, identity);
  const bytes = Buffer.from(`${lines.map(stable).join("\n")}\n`);
  ensure(join(path, ".."));
  writeFileSync(path, bytes);
  return { lines, bytes, sha256: hash(bytes) };
}

function metric(completed, throughput, outcomes, errorEvents = 0, retryEvents = 0) {
  return {
    completed_operations: completed,
    elapsed_ns: 40,
    throughput_operations_per_second: throughput,
    throughput_denominator: "common measured load wall time",
    latency_quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
    total_latency_ns: { p50: 10, p95: 10, p99: 10 },
    service_latency_ns: { p50: 8, p95: 8, p99: 8 },
    queue_latency_ns: { p50: 1, p95: 1, p99: 1 },
    outcomes,
    error_events: errorEvents,
    retry_events: retryEvents
  };
}

function measurements() {
  return {
    load: {
      ...metric(4, 100_000_000, { acknowledged: 3, rejected: 1 }, 1, 1),
      throughput_denominator: "common measured load wall time",
      latency_quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
      max_queue_depth: 0,
      queue_boundary: "Cortex safe_handler source admission semaphore",
      max_dispatcher_inflight: 1,
      per_operation_type: {
        faulted_supersede: metric(1, 25_000_000, { rejected: 1 }, 1, 0),
        forget: metric(1, 25_000_000, { acknowledged: 1 }),
        remember: metric(1, 25_000_000, { acknowledged: 1 }, 0, 1),
        supersede_atomic: metric(1, 25_000_000, { acknowledged: 1 })
      }
    },
    recovery: {
      outcome: "acknowledged",
      timing: { pre_admission_ns: 1, queue_ns: 1, service_ns: 8, total_ns: 10 },
      result: {
        memory_count: 4,
        fts_count: 4,
        vector_count: 4,
        vector_available: true,
        sqlite_integrity: [{ integrity_check: "ok" }],
        sqlite_foreign_key_violations: []
      },
      state_change: "none; read-only count observation"
    },
    resources: {
      user_seconds: 0.1,
      system_seconds: 0.1,
      max_rss_bytes: 1024,
      max_rss_observation: "observed via fixture"
    },
    storage_bytes: { database: 4096, wal: 0, shm: 0 },
    connections: { method: "fixture", open_after_load: 1, peak_open: 2 },
    model_tool_cost: {
      model_calls: 0,
      remote_tool_calls: 0,
      attributable_cost: null,
      unit: "not-applicable"
    }
  };
}

// Row identities created by this fixture's operation mix (operationsPerType=1):
// setup_seed(supersede_target)=1, setup_seed(delete_target)=2, setup_seed(fault_target)=3,
// remember=4, supersede_atomic(target=1)=5 (row1 superseded_by row5); forget deletes row2;
// faulted_supersede(target=3) is rejected and must leave row3 untouched.
const operationPlans = [
  { operation: "setup_seed", role: "supersede_target", index: 0, targetId: null, newId: 1, marker: true },
  { operation: "setup_seed", role: "delete_target", index: 0, targetId: null, newId: 2, marker: true },
  { operation: "setup_seed", role: "fault_target", index: 0, targetId: null, newId: 3, marker: true },
  { operation: "faulted_supersede", role: null, index: 0, targetId: 3, newId: null, marker: true },
  { operation: "remember", role: null, index: 0, targetId: null, newId: 4, marker: true },
  { operation: "supersede_atomic", role: null, index: 0, targetId: 1, newId: 5, marker: true },
  { operation: "forget", role: null, index: 0, targetId: 2, newId: null, marker: false },
  { operation: "recovery_health", role: null, index: 0, targetId: null, newId: null, marker: false }
];

function operationId(runId, plan) {
  return `${runId}:${plan.operation}:${plan.role ?? "normal"}:${plan.index}`;
}

function operationEvents(runId) {
  const events = [];
  for (const plan of operationPlans) {
    const { operation, role, index, targetId, newId, marker } = plan;
    const id = operationId(runId, plan);
    const phase = operation === "setup_seed" ? "setup" : operation === "recovery_health" ? "recovery" : "load";
    events.push({
      event: "operation_intent",
      operation_id: id,
      operation,
      phase,
      marker: marker ? `marker-${id}` : null,
      target_id: targetId,
      role,
      index,
      fsync_before_operation: true
    });
    const acknowledged = operation !== "faulted_supersede";
    const result = !acknowledged ? null : operation === "recovery_health"
      ? {
          memory_count: 4,
          fts_count: 4,
          vector_count: 4,
          vector_available: true,
          sqlite_integrity: [{ integrity_check: "ok" }],
          sqlite_foreign_key_violations: []
        }
      : operation === "forget"
        ? { acknowledged: true, target_id: targetId }
        : { acknowledged: true, memory_id: newId, head_id: operation === "supersede_atomic" ? targetId : newId };
    events.push({
      event: "operation_outcome",
      operation_id: id,
      operation,
      phase,
      outcome: acknowledged ? "acknowledged" : "rejected",
      timing: { pre_admission_ns: 1, queue_ns: 1, service_ns: 8, total_ns: 10 },
      admission: {
        observed: true,
        tool_name: operation === "forget" ? "forget" : "remember",
        budget: 4,
        entered_monotonic_ns: "10000000000000001",
        acquired_monotonic_ns: "10000000000000002",
        released_monotonic_ns: "10000000000000009",
        queued: false
      },
      result,
      error: acknowledged ? null : { type: "InjectedFault", message: "fault-after-cas" }
    });
  }
  events.push({
    event: "operation_retry",
    operation_id: `${runId}:remember:normal:0`,
    operation: "remember",
    phase: "load",
    attempt: 1,
    reason: "database-locked-after-fault"
  });
  return events;
}

function persistedStateObservations(runId, blocked) {
  const rows = [
    {
      id: 1,
      content: `marker-${runId}:setup_seed:supersede_target:0`,
      supersedes_id: null,
      superseded_by_id: 5,
      fts_populated: true,
      vector_populated: true
    },
    {
      // Fault target (row 3). In the blocked-baseline control, the store has raw causal
      // corruption: the fault target is linked to itself as though it were both superseded
      // and its own successor, even though the fault operation was rejected. This is real
      // row-level corruption, not merely a false oracle check.
      id: 3,
      content: `marker-${runId}:setup_seed:fault_target:0`,
      supersedes_id: blocked ? 3 : null,
      superseded_by_id: blocked ? 3 : null,
      fts_populated: true,
      vector_populated: true
    },
    {
      id: 4,
      content: `marker-${runId}:remember:normal:0`,
      supersedes_id: null,
      superseded_by_id: null,
      fts_populated: true,
      vector_populated: true
    },
    {
      id: 5,
      content: `marker-${runId}:supersede_atomic:normal:0`,
      supersedes_id: 1,
      superseded_by_id: null,
      fts_populated: true,
      vector_populated: true
    }
  ];
  return {
    persisted_state_schema: "hc-cortex-002/persisted-state/v1",
    backend: "sqlite",
    scope: { domain: "hc-cortex-002", agent_context: runId },
    rows,
    memory_count: rows.length,
    fts_count: rows.filter((row) => row.fts_populated).length,
    vector_count: rows.filter((row) => row.vector_populated).length,
    vector_available: true,
    postgresql_constraints: "not_applicable"
  };
}

function check(passed, observed, expected) {
  return { passed, observed, expected };
}

function oracleChecks(workloadStart, oracleStart, freshness, blocked) {
  const expectedCounts = {
    faulted_supersede: 1,
    forget: 1,
    recovery_health: 1,
    remember: 1,
    setup_seed: 3,
    supersede_atomic: 1
  };
  const checks = {
    workload_terminal: check(true, { terminal_count: 1, last_event: "terminal" }, { terminal_count: 1, last_event: "terminal", state: "complete" }),
    release_protocol_cell_attempt_binding: check(true, {
      release_id: workloadStart.release_id,
      protocol_id: workloadStart.protocol_id,
      protocol_sha256: workloadStart.protocol_sha256,
      cell_id: workloadStart.cell_id,
      attempt_id: workloadStart.attempt_id
    }, {
      release_id: oracleStart.release_id,
      protocol_id: oracleStart.protocol_id,
      protocol_sha256: oracleStart.protocol_sha256,
      cell_id: oracleStart.cell_id,
      attempt_id: oracleStart.attempt_id
    }),
    configuration_binding: check(true, {
      process_start_count: 1,
      backend: "sqlite",
      concurrency: 2,
      operations_per_type: 1,
      database_identity_sha256: workloadStart.database_identity_sha256
      ,postgresql_service: null
    }, {
      process_start_count: 1,
      backend: "sqlite",
      concurrency: 2,
      operations_per_type: 1,
      database_identity_sha256: workloadStart.database_identity_sha256
      ,postgresql_service: null
    }),
    fresh_process_restart: check(true, {
      workload_boot_nonce: workloadStart.boot_nonce,
      oracle_boot_nonce: oracleStart.boot_nonce,
      workload_process_instance_id: workloadStart.process_instance_id,
      oracle_process_instance_id: oracleStart.process_instance_id
    }, "distinct boot nonce and process-instance identity"),
    fresh_empty_database_preflight: check(true, { preflight_count: 1, observation: freshness }, "one pre-store check proving zero user relations"),
    planned_operation_counts: check(true, expectedCounts, expectedCounts),
    one_outcome_per_intent: check(true, { intents: 8, unique_intents: 8, outcomes: 8, duplicate_or_missing: [] }, "one terminal outcome for each unique intent and no orphan outcomes"),
    acknowledged_and_rejected_contract: check(true, [], "every non-fault operation acknowledged; faulted supersede rejected; no indeterminate"),
    post_load_health_is_read_only: check(true, {
      intent_count: 1,
      marker: null,
      target_id: null,
      result: {
        memory_count: 4,
        fts_count: 4,
        vector_count: 4,
        vector_available: true,
        sqlite_integrity: [{ integrity_check: "ok" }],
        sqlite_foreign_key_violations: []
      }
    }, { marker: null, target_id: null, memory_fts_vector_count: 4, integrity: "backend-valid" }),
    fault_retry_choreography: check(true, 1, 1),
    marker_exactly_once_and_rejected_zero: check(true, { differences: {}, unexpected: [] }, "each expected live marker once; deleted and rejected markers zero"),
    supersession_state: check(true, [], "old head points to new row and new row points back to old head"),
    delete_state: check(true, [], []),
    fault_rollback_state: check(!blocked, blocked ? [{ target_id: 3 }] : [], "fault target remains the open head and rejected row is absent"),
    final_live_count_formula: check(true, 4, 4),
    memory_count: check(true, { count: 4, available: true }, 4),
    fts_count: check(true, { count: 4, available: true }, 4),
    vector_count: check(true, { count: 4, available: true }, 4),
    sqlite_integrity: check(true, [{ integrity_check: "ok" }], [{ integrity_check: "ok" }]),
    sqlite_foreign_keys: check(true, [], []),
    load_telemetry_scope_and_types: check(true, {
      summary_count: 1,
      completed_operations: 4,
      per_operation_completed: { remember: 1, supersede_atomic: 1, forget: 1, faulted_supersede: 1 },
      quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
      throughput_denominator: "common measured load wall time"
    }, {
      completed_operations: 4,
      per_operation_completed: { remember: 1, supersede_atomic: 1, forget: 1, faulted_supersede: 1 },
      quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
      throughput_denominator: "common measured load wall time"
    }),
    load_window_exact: check(true, {
      event_count: 1,
      start_monotonic_ns: "10000000000000000",
      end_monotonic_ns: "10000000000000040",
      elapsed_ns: "40",
      summary_elapsed_ns: 40,
      load_intent_count: 4,
      load_outcome_count: 4
    }, "one canonical decimal window enclosing every measured intent/outcome; " +
      "elapsed=end-start and equals measurement summary elapsed_ns"),
    zero_model_remote_tool_boundary: check(
      true,
      { model_calls: 0, remote_tool_calls: 0, attributable_cost: null, unit: "not-applicable" },
      { model_calls: 0, remote_tool_calls: 0, attributable_cost: null, unit: "not-applicable" }
    ),
    connection_telemetry_shape: check(true, { method: "fixture", open_after_load: 1, peak_open: 2 }, "method plus open_after_load and peak_open, or explicit unavailable values")
  };
  return checks;
}

function processRecord(mode, processId, cell, envelope, ledger, ordinal) {
  const root = `cells/${String(ordinal).padStart(4, "0")}/${mode}`;
  const exitCode = mode === "oracle" && envelope.verdict === "blocked" ? 1 : 0;
  return {
    schemaVersion: "workload-process-record/v1",
    mode,
    processInstanceId: processId,
    command: {
      runtimeId: "python-3.12",
      runtimeSha256,
      adapterId: "hc-cortex-002-adapter",
      adapterPath: "adapters/hc-cortex-002/adapter.py",
      adapterTreeSha256,
      interface: "hc-cortex-002/v1",
      logicalArguments: {
        mode,
        releaseId,
        protocolId: protocol.protocolId,
        protocolSha256,
        cellId: cell.id,
        attemptId: cell.attemptId,
        processInstanceId: processId,
        backend: "sqlite",
        concurrency: 2,
        operationsPerType: 1,
        runId: cell.runId,
        database: {
          strategy: "release-cell-local",
          databaseIdentitySha256: cell.database.databaseIdentitySha256
        },
        postgresqlService: cell.postgresqlService
      }
    },
    stdoutPath: `${root}/stdout.json`,
    stderrPath: `${root}/stderr.txt`,
    pid: mode === "workload" ? 101 + ordinal : 201 + ordinal,
    status: "complete",
    exit: { code: exitCode, signal: null },
    spawnError: null,
    closeAfterStdio: true,
    events: [
      { event: "spawn", at: fixedTime, monotonicNs: "1", pid: mode === "workload" ? 101 + ordinal : 201 + ordinal },
      { event: "stdout-end", at: fixedTime, monotonicNs: "2" },
      { event: "stderr-end", at: fixedTime, monotonicNs: "3" },
      { event: "exit", at: fixedTime, monotonicNs: "4", code: exitCode, signal: null },
      { event: "close", at: fixedTime, monotonicNs: "5", code: exitCode, signal: null, stdoutEnded: true, stderrEnded: true }
    ],
    environmentBefore: { memory: { totalBytes: 16_000_000_000 } },
    environmentAfter: { memory: { totalBytes: 16_000_000_000 } },
    adapterEnvelope: envelope,
    ledger: { path: `cells/${String(ordinal).padStart(4, "0")}/adapter/${ledger.name}`, sha256: ledger.sha256, bytes: ledger.bytes.length },
    orchestrationError: null
  };
}

function writeProcess(release, mode, processId, cell, envelope, ledger, ordinal) {
  const record = processRecord(mode, processId, cell, envelope, ledger, ordinal);
  const directory = join(release, "cells", String(ordinal).padStart(4, "0"), mode);
  ensure(directory);
  json(join(directory, "process.json"), record);
  writeFileSync(join(directory, "stdout.json"), `${JSON.stringify(envelope)}\n`);
  writeFileSync(join(directory, "stderr.txt"), "");
  return record;
}

function writeCell(release, planned, ordinal, blocked) {
  const cellRoot = join(release, "cells", String(ordinal).padStart(4, "0"));
  const adapterRoot = join(cellRoot, "adapter");
  ensure(adapterRoot);
  ensure(join(cellRoot, "database"));
  writeFileSync(join(cellRoot, "database", "cortex.sqlite3"), Buffer.from([0, 1, 2, ordinal]));
  const attemptId = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
  const runId = `run-${String(ordinal).padStart(4, "0")}-fixture`;
  const cell = {
    schemaVersion: "workload-cell-input/v1",
    protocolId: protocol.protocolId,
    protocolSha256,
    runAttemptId,
    attemptId,
    runId,
    ordinal,
    id: planned.id,
    expectedVerdict: planned.expectedVerdict,
    parameters: planned.parameters,
    source: { id: planned.parameters.sourceId, revision: protocol.corpora.find((entry) => entry.id === planned.parameters.sourceId).revision },
    database: { path: "database/cortex.sqlite3", databaseIdentitySha256: null },
    postgresqlService: null
  };
  const workloadProcessId = `00000000-0000-4000-9000-${String(ordinal).padStart(12, "0")}`;
  const oracleProcessId = `00000000-0000-4000-a000-${String(ordinal).padStart(12, "0")}`;
  const databaseIdentity = hash(Buffer.from(`database-${ordinal}`));
  cell.database.databaseIdentitySha256 = databaseIdentity;
  json(join(cellRoot, "cell.json"), cell);
  const common = { release_id: releaseId, protocol_id: protocol.protocolId, protocol_sha256: protocolSha256, cell_id: planned.id, attempt_id: attemptId };
  const workloadIdentity = { ...common, process_instance_id: workloadProcessId };
  const oracleIdentity = { ...common, process_instance_id: oracleProcessId };
  const workloadStart = {
    event: "process_start",
    mode: "workload",
    pid: 101 + ordinal,
    boot_nonce: `workload-boot-${ordinal}`,
    backend: "sqlite",
    database_identity_sha256: databaseIdentity,
    concurrency: 2,
    operations_per_type: 1,
    run_id: runId,
    runtime: runtimeObservation(cell.source.id)
    ,postgresql_service: null
  };
  const freshness = { checked_before_store_initialization: true, method: "fixture", empty: true, user_relation_count: 0 };
  const workloadEvents = [
    workloadStart,
    { event: "backend_preflight", observation: freshness },
    ...operationEvents(runId),
    {
      event: "load_window",
      start_monotonic_ns: "10000000000000000",
      end_monotonic_ns: "10000000000000040",
      elapsed_ns: "40"
    },
    { event: "measurement_summary", observations: measurements() },
    { event: "terminal", state: "complete", resolution: "pending_oracle", store_closed: true }
  ];
  const workloadName = `${runId}.workload.jsonl`;
  const workload = writeLedger(join(adapterRoot, workloadName), workloadEvents, workloadIdentity);
  workload.name = workloadName;
  const oracleStart = {
    event: "process_start",
    mode: "oracle",
    pid: 201 + ordinal,
    boot_nonce: `oracle-boot-${ordinal}`,
    backend: "sqlite",
    database_identity_sha256: databaseIdentity,
    concurrency: 2,
    operations_per_type: 1,
    run_id: runId,
    runtime: runtimeObservation(cell.source.id)
    ,postgresql_service: null
  };
  const checks = oracleChecks({ ...workloadStart, ...workloadIdentity }, { ...oracleStart, ...oracleIdentity }, freshness, blocked);
  const verdict = blocked ? "blocked" : "proven";
  const oracleEvents = [
    oracleStart,
    { event: "workload_ledger_verified", workload_sha256: workload.sha256, workload_records: workload.lines.length },
    {
      event: "oracle_result",
      verdict,
      checks,
      observations: {
        ...persistedStateObservations(runId, blocked),
        sqlite_integrity: [{ integrity_check: "ok" }],
        sqlite_foreign_key_violations: [],
        storage_bytes: { database: 4096 },
        connections: { method: "fixture", open_after_load: 1, peak_open: 2 },
        model_tool_cost: {
          model_calls: 0,
          remote_tool_calls: 0,
          attributable_cost: null,
          unit: "not-applicable"
        }
      }
    },
    { event: "terminal", state: "complete", verdict, store_closed: true }
  ];
  const oracleName = `${runId}.oracle.jsonl`;
  const oracle = writeLedger(join(adapterRoot, oracleName), oracleEvents, oracleIdentity);
  oracle.name = oracleName;
  const workloadEnvelope = { interface: "hc-cortex-002/v1", mode: "workload", status: "complete", ledger_path: workloadName, verdict: "pending" };
  const oracleEnvelope = { interface: "hc-cortex-002/v1", mode: "oracle", status: "complete", ledger_path: oracleName, verdict };
  const workloadRecord = writeProcess(release, "workload", workloadProcessId, cell, workloadEnvelope, workload, ordinal);
  const oracleRecord = writeProcess(release, "oracle", oracleProcessId, cell, oracleEnvelope, oracle, ordinal);
  const result = {
    schemaVersion: "workload-cell-result/v1",
    id: planned.id,
    ordinal,
    expectedVerdict: planned.expectedVerdict,
    attemptId,
    verdict,
    status: "passed",
    reason: blocked ? "expected-negative-control" : null,
    failureScope: null,
    startedAt: "2026-08-30T23:59:58Z",
    endedAt: "2026-08-30T23:59:59Z",
    workloadProcessPath: `cells/${String(ordinal).padStart(4, "0")}/workload/process.json`,
    oracleProcessPath: `cells/${String(ordinal).padStart(4, "0")}/oracle/process.json`
  };
  json(join(cellRoot, "cell-result.json"), result);
  return { cell, result, workload, oracle, workloadRecord, oracleRecord };
}

function rewriteWorkloadEvidence(release, cellFixture, ordinal, mutate) {
  const path = join(release, cellFixture.workloadRecord.ledger.path);
  const records = cellFixture.workload.lines.map((entry) => {
    const copy = structuredClone(entry);
    for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
      "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
    return copy;
  });
  mutate(records);
  const updated = writeLedger(path, records, {
    release_id: releaseId,
    protocol_id: protocol.protocolId,
    protocol_sha256: protocolSha256,
    cell_id: cellFixture.cell.id,
    attempt_id: cellFixture.cell.attemptId,
    process_instance_id: cellFixture.workloadRecord.processInstanceId
  });
  const processPath = join(release, `cells/${String(ordinal).padStart(4, "0")}/workload/process.json`);
  const receipt = JSON.parse(readFileSync(processPath));
  receipt.ledger.sha256 = updated.sha256;
  receipt.ledger.bytes = updated.bytes.length;
  json(processPath, receipt);

  const oraclePath = join(release, cellFixture.oracleRecord.ledger.path);
  const oracleRecords = cellFixture.oracle.lines.map((entry) => {
    const copy = structuredClone(entry);
    for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
      "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
    if (copy.event === "workload_ledger_verified") copy.workload_sha256 = updated.sha256;
    return copy;
  });
  const updatedOracle = writeLedger(oraclePath, oracleRecords, {
    release_id: releaseId,
    protocol_id: protocol.protocolId,
    protocol_sha256: protocolSha256,
    cell_id: cellFixture.cell.id,
    attempt_id: cellFixture.cell.attemptId,
    process_instance_id: cellFixture.oracleRecord.processInstanceId
  });
  const oracleProcessPath = join(release, `cells/${String(ordinal).padStart(4, "0")}/oracle/process.json`);
  const oracleReceipt = JSON.parse(readFileSync(oracleProcessPath));
  oracleReceipt.ledger.sha256 = updatedOracle.sha256;
  oracleReceipt.ledger.bytes = updatedOracle.bytes.length;
  json(oracleProcessPath, oracleReceipt);
}

// Rewrites only the oracle ledger (unlike rewriteWorkloadEvidence, which recomputes the
// workload ledger and re-binds the oracle's workload_sha256 reference to it). Used to forge
// the oracle's own reported observations/checks while leaving the workload ledger untouched,
// so adversarial tests can prove Node never accepts a producer's self-reported verdict.
function rewriteOracleEvidence(release, cellFixture, ordinal, mutate) {
  const oraclePath = join(release, cellFixture.oracleRecord.ledger.path);
  const oracleRecords = cellFixture.oracle.lines.map((entry) => {
    const copy = structuredClone(entry);
    for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
      "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
    return copy;
  });
  mutate(oracleRecords);
  const updatedOracle = writeLedger(oraclePath, oracleRecords, {
    release_id: releaseId,
    protocol_id: protocol.protocolId,
    protocol_sha256: protocolSha256,
    cell_id: cellFixture.cell.id,
    attempt_id: cellFixture.cell.attemptId,
    process_instance_id: cellFixture.oracleRecord.processInstanceId
  });
  const oracleProcessPath = join(release, `cells/${String(ordinal).padStart(4, "0")}/oracle/process.json`);
  const oracleReceipt = JSON.parse(readFileSync(oracleProcessPath));
  oracleReceipt.ledger.sha256 = updatedOracle.sha256;
  oracleReceipt.ledger.bytes = updatedOracle.bytes.length;
  json(oracleProcessPath, oracleReceipt);
}

function createRelease(options = {}) {
  const requestedTemporary = mkdtempSync(join(tmpdir(), "hc-cortex-002-analysis-"));
  const temporary = realpathSync(requestedTemporary);
  const requestedRelease = join(requestedTemporary, releaseId);
  ensure(requestedRelease);
  const realRelease = realpathSync(requestedRelease);
  writeFileSync(join(realRelease, "protocol.json"), protocolBytes);
  json(join(realRelease, "protocol-lock.json"), {
    schemaVersion: "workload-protocol-lock/v1",
    runAttemptId,
    createdAt: fixedTime,
    protocolId: protocol.protocolId,
    protocolSha256,
    protocolBytes: protocolBytes.length,
    copiedProtocolPath: "protocol.json",
    registration: {
      repository: "https://github.com/cdeust/harness-comparison.git",
      revision: "c".repeat(40),
      path: "protocols/2026-08-30-hc-cortex-002-v1.json"
    },
    runnerInputs,
    adapters: [adapterReceipt]
  });
  json(join(realRelease, "environment.json"), {
    schemaVersion: "workload-environment/v1",
    capturedAt: fixedTime,
    sources: protocol.corpora.map(({ id }) => sourceReceipt(id)),
    runtimes: [{
      id: "python-3.12",
      sha256: runtimeSha256,
      version: "Python 3.12.0",
      environmentIdentity: runtimeEnvironmentIdentity,
      virtualEnvironment
    }],
    adapters: [adapterReceipt],
    memory: { totalBytes: 16_000_000_000 },
    host: {
      platform: "linux",
      release: "fixture",
      architecture: "x64",
      node: process.version,
      cpus: [{ model: "fixture-cpu", speedMHz: 1000 }]
    },
    childEnvironmentPolicy: "fixture"
  });
  const cells = [];
  const baseline = writeCell(realRelease, protocol.plannedCells[0], 1, options.baselineBlocked !== false);
  const candidate = writeCell(realRelease, protocol.plannedCells[1], 2, options.candidateBlocked === true);
  cells.push(baseline.result, candidate.result);
  for (let index = 2; index < protocol.plannedCells.length; index += 1) {
    cells.push({
      id: protocol.plannedCells[index].id,
      ordinal: index + 1,
      expectedVerdict: protocol.plannedCells[index].expectedVerdict,
      verdict: null,
      status: "not-run",
      reason: "excluded-by-explicit-cell-selection"
    });
  }
  json(join(realRelease, "run-summary.json"), {
    schemaVersion: "workload-run-summary/v1",
    releaseId,
    protocolId: protocol.protocolId,
    protocolSha256,
    runAttemptId,
    status: "completed",
    cancellationSignal: null,
    stopCellId: null,
    failureCellIds: [],
    cells
  });
  const negative = cells.filter((entry) => entry.status !== "passed" || entry.verdict === "blocked").map((entry) => ({
    schemaVersion: "workload-negative-log/v1",
    cellId: entry.id,
    status: entry.status,
    verdict: entry.verdict,
    reason: entry.reason
  }));
  writeFileSync(join(realRelease, "negative-log.jsonl"), `${negative.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  return { temporary, release: realRelease, requestedRelease, baseline, candidate };
}

function writePostgresqlReceipt(release, mutate = (value) => value, bind = true) {
  const pgCells = protocol.plannedCells.filter((cell) => cell.parameters.backend === "postgresql");
  const receipt = mutate({
    schemaVersion: "hc-cortex-002-postgresql-service-receipt/v1",
    protocolId: protocol.protocolId,
    protocolSha256,
    serviceInstanceId: "00000000-0000-4000-c000-000000000001",
    startedAt: fixedTime,
    postgresVersion: "PostgreSQL 17.9",
    processId: 300,
    configuration: {
      listenAddresses: "",
      unixSocketMode: "0700",
      socketDirectoryMode: "0700",
      socketDirectoryIdentitySha256: "e".repeat(64),
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
    cells: pgCells.map((cell, index) => ({
      cellId: cell.id,
      databaseIdentitySha256: hash(Buffer.from(`pg-database-${index}`)),
      createdFrom: "template0",
      fresh: true
    }))
  });
  const receiptPath = join(release, "postgresql-service-receipt.json");
  json(receiptPath, receipt);
  if (bind) {
    const bytes = readFileSync(receiptPath);
    const lockPath = join(release, "protocol-lock.json");
    const lock = JSON.parse(readFileSync(lockPath));
    lock.postgresqlServiceReceipt = {
      path: "postgresql-service-receipt.json",
      sha256: hash(bytes),
      bytes: bytes.length,
      schemaVersion: receipt.schemaVersion,
      serviceInstanceId: receipt.serviceInstanceId
    };
    json(lockPath, lock);
  }
}

function cleanup(fixture) {
  if (process.env.HC_CORTEX_002_KEEP_FIXTURE === "1") {
    process.stderr.write(`retained HC-CORTEX-002 fixture: ${fixture.release}\n`);
    return;
  }
  rmSync(fixture.temporary, { recursive: true, force: true });
}

test("baseline RED accepts the preregistration-smoke causal consequence set only", () => {
  const observedBaselineFailures = [
    "fault_retry_choreography",
    "fault_rollback_state",
    "fts_count",
    "marker_exactly_once_and_rejected_zero",
    "memory_count",
    "post_load_health_is_read_only",
    "vector_count"
  ];
  assert.equal(isCausalBaselineFailureSet(observedBaselineFailures), true);
  assert.equal(isCausalBaselineFailureSet([...observedBaselineFailures, "configuration_binding"]), false);
  assert.equal(isCausalBaselineFailureSet([]), false);
});

function expectCode(call, code) {
  assert.throws(call, (error) => error instanceof EvidenceError && error.code === code);
}

test("blocked baseline is a required RED control and a partial matrix seals only as PILOT", () => {
  const fixture = createRelease();
  try {
    const result = analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    assert.equal(result.scoring.causalContrast.label, "PASS");
    assert.equal(result.scoring.causalContrast.exactChange, "blocked (RED) -> proven (GREEN)");
    assert.equal(result.scoring.studyVerdict.label, "INDETERMINATE");
    assert.equal(result.analysis.cells[0].correctnessLabel, "FAIL");
    assert.equal(result.analysis.cells[0].expectationMatch, true);
    assert.equal(result.analysis.saturation[0].status, "INDETERMINATE");
    const manifest = sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(manifest.cells.length, 2);
    assert.equal(manifest.cells[0].verdict, "blocked");
    assert.equal(manifest.artifacts.some((artifact) => artifact.path === "execution-manifest.json"), false);
    assert.notEqual(manifest.cells[0].attemptId, manifest.cells[1].attemptId);
    assert.equal(manifest.environment.processes.every((process_) =>
      process_.host === "same-user local host; no operating-system sandbox claimed" &&
      Array.isArray(process_.declaredEndpoints)), true);
    const gate = validateBenchmarkRelease(fixture.release, { sourceRepositoryRoot: repositoryRoot });
    const permittedProvenanceErrors = new Set(["GIT_COMMIT_MISSING"]);
    assert.equal(gate.valid, false);
    assert.equal(gate.errors.every((error) => permittedProvenanceErrors.has(error.code)), true, JSON.stringify(gate.errors));
    expectCode(() => sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT" }), "MANIFEST_ALREADY_EXISTS");
  } finally {
    cleanup(fixture);
  }
});

test("a static operating-system parent alias does not invalidate a real release root", () => {
  const fixture = createRelease();
  try {
    const result = analyzeHcCortex002Release(fixture.requestedRelease, { write: false, generatedAt: fixedTime });
    assert.equal(result.scoring.causalContrast.label, "PASS");
  } finally {
    cleanup(fixture);
  }
});

test("a changed workload line fails its canonical SHA-256 chain", () => {
  const fixture = createRelease();
  try {
    const path = join(fixture.release, fixture.baseline.workloadRecord.ledger.path);
    const text = readFileSync(path, "utf8");
    writeFileSync(path, text.replace("fault-after-cas", "fault-after-cax"));
    expectCode(() => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }), "LEDGER_RECEIPT_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("negative evidence cannot omit a skipped or blocked cell", () => {
  const fixture = createRelease();
  try {
    const path = join(fixture.release, "negative-log.jsonl");
    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    writeFileSync(path, `${lines.slice(1).join("\n")}\n`);
    expectCode(() => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }), "NEGATIVE_LOG_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("a recomputed chain with a different process identity still fails receipt binding", () => {
  const fixture = createRelease();
  try {
    const path = join(fixture.release, fixture.baseline.workloadRecord.ledger.path);
    const records = fixture.baseline.workload.lines.map((entry) => {
      const copy = { ...entry };
      for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
        "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
      return copy;
    });
    writeLedger(path, records, {
      release_id: releaseId,
      protocol_id: protocol.protocolId,
      protocol_sha256: protocolSha256,
      cell_id: protocol.plannedCells[0].id,
      attempt_id: fixture.baseline.cell.attemptId,
      process_instance_id: "00000000-0000-4000-b000-000000000001"
    });
    const ledgerBytes = readFileSync(path);
    const processPath = join(fixture.release, "cells/0001/workload/process.json");
    const receipt = JSON.parse(readFileSync(processPath));
    receipt.ledger.sha256 = hash(ledgerBytes);
    receipt.ledger.bytes = ledgerBytes.length;
    json(processPath, receipt);
    expectCode(() => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }), "LEDGER_IDENTITY_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("missing descriptive metrics remain explicit and prevent evidence completeness", () => {
  const fixture = createRelease();
  try {
    const path = join(fixture.release, fixture.candidate.workloadRecord.ledger.path);
    const records = fixture.candidate.workload.lines.map((entry) => {
      const copy = structuredClone(entry);
      for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
        "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
      if (copy.event === "measurement_summary") delete copy.observations.resources;
      return copy;
    });
    const updated = writeLedger(path, records, {
      release_id: releaseId,
      protocol_id: protocol.protocolId,
      protocol_sha256: protocolSha256,
      cell_id: protocol.plannedCells[1].id,
      attempt_id: fixture.candidate.cell.attemptId,
      process_instance_id: fixture.candidate.workloadRecord.processInstanceId
    });
    const processPath = join(fixture.release, "cells/0002/workload/process.json");
    const receipt = JSON.parse(readFileSync(processPath));
    receipt.ledger.sha256 = updated.sha256;
    receipt.ledger.bytes = updated.bytes.length;
    json(processPath, receipt);
    const oraclePath = join(fixture.release, fixture.candidate.oracleRecord.ledger.path);
    const oracleRecords = fixture.candidate.oracle.lines.map((entry) => {
      const copy = structuredClone(entry);
      for (const field of ["schema", "sequence", "recorded_at", "monotonic_ns", "prev_sha256", "line_sha256",
        "release_id", "protocol_id", "protocol_sha256", "cell_id", "attempt_id", "process_instance_id"]) delete copy[field];
      if (copy.event === "workload_ledger_verified") copy.workload_sha256 = updated.sha256;
      return copy;
    });
    const updatedOracle = writeLedger(oraclePath, oracleRecords, {
      release_id: releaseId,
      protocol_id: protocol.protocolId,
      protocol_sha256: protocolSha256,
      cell_id: protocol.plannedCells[1].id,
      attempt_id: fixture.candidate.cell.attemptId,
      process_instance_id: fixture.candidate.oracleRecord.processInstanceId
    });
    const oracleProcessPath = join(fixture.release, "cells/0002/oracle/process.json");
    const oracleReceipt = JSON.parse(readFileSync(oracleProcessPath));
    oracleReceipt.ledger.sha256 = updatedOracle.sha256;
    oracleReceipt.ledger.bytes = updatedOracle.bytes.length;
    json(oracleProcessPath, oracleReceipt);
    const result = analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime });
    const candidate = result.analysis.cells.find((cell) => cell.id === protocol.plannedCells[1].id);
    assert.deepEqual(candidate.metrics.missing, ["cpu-memory"]);
    assert.equal(candidate.evidenceComplete, false);
  } finally {
    cleanup(fixture);
  }
});

test("load metrics are independently recomputed from raw operation evidence", () => {
  const mutations = [
    (summary) => { summary.throughput_operations_per_second += 1; },
    (summary) => { summary.total_latency_ns.p95 += 1; },
    (summary) => { summary.per_operation_type.remember.completed_operations += 1; },
    (summary) => { summary.max_queue_depth += 1; },
    (summary) => { summary.max_dispatcher_inflight += 1; }
  ];
  for (const mutate of mutations) {
    const fixture = createRelease();
    try {
      rewriteWorkloadEvidence(fixture.release, fixture.candidate, 2, (records) => {
        const measurement = records.find((entry) => entry.event === "measurement_summary");
        mutate(measurement.observations.load);
      });
      expectCode(
        () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
        "LOAD_METRICS_RECOMPUTATION_MISMATCH"
      );
    } finally {
      cleanup(fixture);
    }
  }
});

test("source, runtime, adapter, and process provenance mutations fail closed", () => {
  const receiptMutations = [
    {
      code: "SOURCE_PROVENANCE_INVALID",
      apply(fixture) {
        const path = join(fixture.release, "environment.json");
        const value = JSON.parse(readFileSync(path));
        value.sources[0].revision = "0".repeat(40);
        json(path, value);
      }
    },
    {
      code: "RUNTIME_PROVENANCE_INVALID",
      apply(fixture) {
        const path = join(fixture.release, "environment.json");
        const value = JSON.parse(readFileSync(path));
        value.runtimes[0].environmentIdentity.python.version = "3.13.0";
        json(path, value);
      }
    },
    {
      code: "PROCESS_BINDING_INVALID",
      apply(fixture) {
        const path = join(fixture.release, "cells/0001/workload/process.json");
        const value = JSON.parse(readFileSync(path));
        value.command.runtimeSha256 = "f".repeat(64);
        json(path, value);
      }
    }
  ];
  for (const mutation of receiptMutations) {
    const fixture = createRelease();
    try {
      mutation.apply(fixture);
      expectCode(
        () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
        mutation.code
      );
    } finally {
      cleanup(fixture);
    }
  }

  const fixture = createRelease();
  try {
    rewriteWorkloadEvidence(fixture.release, fixture.baseline, 1, (records) => {
      records.find((entry) => entry.event === "process_start").runtime.cortex_commit = "f".repeat(40);
    });
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "PROCESS_RUNTIME_PROVENANCE_MISMATCH"
    );
  } finally {
    cleanup(fixture);
  }
});

test("unexpected regression outcomes fail the exact RED to GREEN contrast", () => {
  for (const options of [{ baselineBlocked: false }, { candidateBlocked: true }]) {
    const fixture = createRelease(options);
    try {
      const result = analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
      assert.equal(result.scoring.causalContrast.label, "FAIL");
      assert.equal(result.scoring.studyVerdict.label, "FAIL");
      const manifest = sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
      const unexpected = manifest.cells.find((cell) => cell.verdict !== cell.expectedVerdict);
      assert(unexpected);
      assert.equal(unexpected.status, "completed");
      assert.equal(unexpected.resolution.state, "resolved");
      const gate = validateBenchmarkRelease(fixture.release, { sourceRepositoryRoot: repositoryRoot });
      assert.equal(gate.errors.every((error) => error.code === "GIT_COMMIT_MISSING"), true, JSON.stringify(gate.errors));
    } finally {
      cleanup(fixture);
    }
  }
});

test("private paths and PostgreSQL connection strings are rejected before publication", () => {
  for (const secret of ["/Users/alice/private/db.sqlite3", "postgresql://alice:secret@localhost/bench"]) {
    const fixture = createRelease();
    try {
      appendFileSync(join(fixture.release, "cells/0001/workload/stderr.txt"), secret);
      expectCode(() => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }), "PRIVATE_DATA_DISCLOSED");
    } finally {
      cleanup(fixture);
    }
  }
});

test("attempted PostgreSQL cells fail closed without the preregistered local-service receipt", () => {
  const fixture = createRelease();
  try {
    const summaryPath = join(fixture.release, "run-summary.json");
    const summary = JSON.parse(readFileSync(summaryPath));
    const pg = protocol.plannedCells.findIndex((cell) => cell.parameters.backend === "postgresql");
    summary.cells[pg] = {
      id: protocol.plannedCells[pg].id,
      ordinal: pg + 1,
      expectedVerdict: protocol.plannedCells[pg].expectedVerdict,
      verdict: null,
      status: "failed",
      reason: "fixture-postgresql-attempt"
    };
    summary.status = "failed";
    summary.failureCellIds = [protocol.plannedCells[pg].id];
    summary.stopCellId = protocol.plannedCells[pg].id;
    json(summaryPath, summary);
    const negative = summary.cells.filter((entry) => entry.status !== "passed" || entry.verdict === "blocked").map((entry) => ({
      schemaVersion: "workload-negative-log/v1",
      cellId: entry.id,
      status: entry.status,
      verdict: entry.verdict,
      reason: entry.reason
    }));
    writeFileSync(join(fixture.release, "negative-log.jsonl"), `${negative.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "POSTGRESQL_SERVICE_RECEIPT_MISSING"
    );
  } finally {
    cleanup(fixture);
  }
});

test("an immutable PostgreSQL receipt covers the full matrix and marks unused cells explicitly", () => {
  const fixture = createRelease();
  try {
    writePostgresqlReceipt(fixture.release);
    const result = analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    assert.equal(result.analysis.postgresqlService.cells.length, 8);
    assert.equal(result.analysis.postgresqlService.cells.every((cell) =>
      cell.executionState === "provisioned-not-attempted"), true);
    const manifest = sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    const service = manifest.environment.processes.find((process_) => process_.id === "postgresql-private-service");
    assert.deepEqual(service.declaredEndpoints, [{
      transport: "unix-domain-socket",
      portSuffix: 5432,
      binding: "private owner-controlled socket directory; PostgreSQL socket filename suffix only",
      evidence: "configuration-receipt",
      networkScanPerformed: false
    }]);
  } finally {
    cleanup(fixture);
  }
});

test("PostgreSQL receipt database identities must be unique in protocol order", () => {
  const fixture = createRelease();
  try {
    writePostgresqlReceipt(fixture.release, (receipt) => {
      receipt.cells[1].databaseIdentitySha256 = receipt.cells[0].databaseIdentitySha256;
      return receipt;
    });
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "POSTGRESQL_SERVICE_CELL_SET_INVALID"
    );
  } finally {
    cleanup(fixture);
  }
});

test("a PostgreSQL receipt injected after the execution lock is rejected", () => {
  const fixture = createRelease();
  try {
    writePostgresqlReceipt(fixture.release, (receipt) => receipt, false);
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "POSTGRESQL_SERVICE_LOCK_MISMATCH"
    );
  } finally {
    cleanup(fixture);
  }
});

test("analysis is deterministic when the caller fixes its only timestamp", () => {
  const left = createRelease();
  const right = createRelease();
  try {
    const first = analyzeHcCortex002Release(left.release, { write: false, generatedAt: fixedTime });
    const second = analyzeHcCortex002Release(right.release, { write: false, generatedAt: fixedTime });
    assert.equal(JSON.stringify(first.analysis), JSON.stringify(second.analysis));
    assert.equal(JSON.stringify(first.scoring), JSON.stringify(second.scoring));
    assert.equal(JSON.stringify([...first.documents]), JSON.stringify([...second.documents]));
  } finally {
    cleanup(left);
    cleanup(right);
  }
});

test("sealing fails closed when raw bytes mutate after analysis", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    appendFileSync(join(fixture.release, "negative-log.jsonl"), "{}\n");
    expectCode(() => sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime }), "RAW_INPUT_SET_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("read-only release verification recomputes derived claims instead of trusting rehashed bytes", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(verifyHcCortex002Release(fixture.release).valid, true);

    const scoringPath = join(fixture.release, "scoring/scoring.json");
    const scoring = JSON.parse(readFileSync(scoringPath));
    scoring.studyVerdict.label = "PASS";
    json(scoringPath, scoring);
    const scoringBytes = readFileSync(scoringPath);
    const manifestPath = join(fixture.release, "execution-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath));
    const artifact = manifest.artifacts.find((entry) => entry.path === "scoring/scoring.json");
    artifact.sha256 = hash(scoringBytes);
    artifact.bytes = scoringBytes.length;
    json(manifestPath, manifest);

    expectCode(() => verifyHcCortex002Release(fixture.release), "DERIVED_ARTIFACT_RECOMPUTATION_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("VERIFIED cannot hide an incomplete PILOT matrix", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    expectCode(() => sealHcCortex002Release(fixture.release, { releaseStatus: "VERIFIED", generatedAt: fixedTime }), "RELEASE_NOT_VERIFIED");
  } finally {
    cleanup(fixture);
  }
});

test("analysis and sealing CLIs fail closed with machine-readable errors", () => {
  const analyzer = spawnSync(process.execPath, [join(repositoryRoot, "scripts/analyze-hc-cortex-002.mjs"), "--bad"], {
    encoding: "utf8"
  });
  assert.equal(analyzer.status, 1);
  assert.equal(JSON.parse(analyzer.stderr).error.code, "INVALID_ARGUMENT");
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    const sealer = spawnSync(process.execPath, [
      join(repositoryRoot, "scripts/seal-hc-cortex-002.mjs"), "--status", "BROKEN", fixture.release
    ], { encoding: "utf8" });
    assert.equal(sealer.status, 1);
    assert.equal(JSON.parse(sealer.stderr).error.code, "RELEASE_STATUS_INVALID");
  } finally {
    cleanup(fixture);
  }
});

test("privacy scanning parses JSON and JSONL secret keys and absolute paths structurally", () => {
  const cases = [
    ["secret.json", { nested: { password: "topsecret" } }, "SECRET_KEY_MATERIAL"],
    ["token.jsonl", { api_token: "ghp_fixture" }, "SECRET_KEY_MATERIAL"],
    ["root.json", { path: "/root/private/db.sqlite3" }, "PRIVATE_POSIX_PATH"],
    ["opt.json", { path: "/opt/benchmark/private.sqlite3" }, "PRIVATE_POSIX_PATH"],
    ["volume.json", { path: "/Volumes/private/db.sqlite3" }, "PRIVATE_POSIX_PATH"],
    ["workspace.json", { path: "/workspace/private/db.sqlite3" }, "PRIVATE_POSIX_PATH"],
    ["windows.json", { path: "C:\\Users\\alice\\private.sqlite3" }, "PRIVATE_WINDOWS_PATH"],
    ["file-url.json", { path: "file:///root/private/db.sqlite3" }, "PRIVATE_FILE_URL"]
  ];
  for (const [path, value, code] of cases) {
    const text = path.endsWith(".jsonl") ? `${JSON.stringify(value)}\n` : JSON.stringify(value);
    assert.ok(privacyFindings(path, Buffer.from(text)).some((finding) => finding.code === code), `${path} must report ${code}`);
  }

  const safe = {
    citation: "https://example.com/research/path",
    password: "<redacted>",
    passwordMaterialRecorded: false,
    postgresql: "postgresql://<redacted>",
    secretMaterialRecorded: false
  };
  assert.deepEqual(privacyFindings("safe.json", Buffer.from(JSON.stringify(safe))), []);
});

test("a producer that reports proven while persisted-state row content is forged is rejected", () => {
  const fixture = createRelease();
  try {
    rewriteOracleEvidence(fixture.release, fixture.candidate, 2, (records) => {
      const result = records.find((entry) => entry.event === "oracle_result");
      const forgedRow = result.observations.rows.find((entry) => entry.id === 5);
      // The producer still reports every check as passing ("proven"), but the normalized
      // row it published no longer carries the marker its own supersede_atomic intent wrote.
      forgedRow.content = "forged-content-not-a-registered-marker";
    });
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "ORACLE_CHECK_VERDICT_MISMATCH"
    );
  } finally {
    cleanup(fixture);
  }
});

test("a producer that reports proven while a supersession edge is forged is rejected", () => {
  const fixture = createRelease();
  try {
    rewriteOracleEvidence(fixture.release, fixture.candidate, 2, (records) => {
      const result = records.find((entry) => entry.event === "oracle_result");
      const forgedRow = result.observations.rows.find((entry) => entry.id === 1);
      // Forge the reciprocal edge: row 1 (supersede_atomic's target) claims to have been
      // superseded by row 4 (the unrelated "remember" row) instead of row 5, while every
      // reported check -- including supersession_state -- still claims "proven".
      forgedRow.superseded_by_id = 4;
    });
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "ORACLE_CHECK_VERDICT_MISMATCH"
    );
  } finally {
    cleanup(fixture);
  }
});

test("load_window_exact truth never rests on the producer's descriptive expected prose", () => {
  const fixture = createRelease();
  try {
    rewriteOracleEvidence(fixture.release, fixture.candidate, 2, (records) => {
      const result = records.find((entry) => entry.event === "oracle_result");
      const check = result.checks.load_window_exact;
      // Leave start/end/elapsed self-consistent and equal to the workload's own reported
      // load-window fields (the field-equality checks alone would not catch this), and leave
      // the descriptive "expected" prose untouched and correct-looking. Only forge the
      // producer-supplied summary_elapsed_ns cross-reference, which Node must independently
      // recompute against the raw measurement-summary evidence rather than trust as reported.
      check.observed.summary_elapsed_ns = 41;
    });
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "ORACLE_CHECK_VERDICT_MISMATCH"
    );
  } finally {
    cleanup(fixture);
  }
});
