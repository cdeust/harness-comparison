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
// Must postdate the registered protocol's frozen registeredAt
// (protocols/2026-08-30-hc-cortex-002-v1.json), which PROTOCOL_REGISTERED_AFTER_CELL
// requires to precede every cell's startedAt.
const fixedTime = "2026-09-02T00:00:00Z";
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

function metric(completed, elapsedNs, outcomes, errorEvents = 0, retryEvents = 0) {
  return {
    completed_operations: completed,
    elapsed_ns: elapsedNs,
    throughput_operations_per_second: completed * 1_000_000_000 / elapsedNs,
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

// Every count the fixture must keep mutually consistent, derived from the planned cell's
// parameters. operationsPerType n yields 2n+1 seeds, one faulted supersede, n remembers,
// n atomic supersedes, n forgets and one recovery health (5n+3 intents, 3n+1 measured load
// operations, 3n+1 live rows). The single permitted retry exists only for the candidate on
// SQLite at concurrency >= 2 (adapters/hc-cortex-002/README.md; the analyzer's
// fault_retry_choreography rule): the shared-handle baseline and every PostgreSQL cell
// record zero retries.
function cellShape(planned, blocked) {
  const n = planned.parameters.operationsPerType;
  const backend = planned.parameters.backend;
  const concurrency = planned.parameters.concurrency;
  const expectedRetries = backend === "sqlite" && concurrency >= 2 ? 1 : 0;
  return {
    n,
    backend,
    concurrency,
    expectedRetries,
    retries: blocked ? 0 : expectedRetries,
    loadOperations: 3 * n + 1,
    liveRows: 3 * n + 1,
    intents: 5 * n + 3,
    faultTargetId: 2 * n + 1,
    elapsedNs: 40 * n
  };
}

const windowStart = "10000000000000000";

function windowEnd(shape) {
  return String(10_000_000_000_000_000n + BigInt(shape.elapsedNs));
}

function healthResult(shape) {
  return {
    memory_count: shape.liveRows,
    fts_count: shape.liveRows,
    vector_count: shape.liveRows,
    vector_available: true,
    ...(shape.backend === "sqlite"
      ? { sqlite_integrity: [{ integrity_check: "ok" }], sqlite_foreign_key_violations: [] }
      : { sqlite_integrity: "not-applicable", sqlite_foreign_key_violations: "not-applicable" })
  };
}

function measurements(shape) {
  const { n, retries, elapsedNs } = shape;
  return {
    load: {
      ...metric(shape.loadOperations, elapsedNs, { acknowledged: 3 * n, rejected: 1 }, 1, retries),
      throughput_denominator: "common measured load wall time",
      latency_quantile_method: "Hyndman-Fan type 1 (inverse empirical distribution function)",
      max_queue_depth: 0,
      queue_boundary: "Cortex safe_handler source admission semaphore",
      max_dispatcher_inflight: 1,
      per_operation_type: {
        faulted_supersede: metric(1, elapsedNs, { rejected: 1 }, 1, 0),
        forget: metric(n, elapsedNs, { acknowledged: n }),
        remember: metric(n, elapsedNs, { acknowledged: n }, 0, retries),
        supersede_atomic: metric(n, elapsedNs, { acknowledged: n })
      }
    },
    recovery: {
      outcome: "acknowledged",
      timing: { pre_admission_ns: 1, queue_ns: 1, service_ns: 8, total_ns: 10 },
      result: healthResult(shape),
      state_change: "none; read-only count observation"
    },
    resources: {
      user_seconds: 0.1,
      system_seconds: 0.1,
      max_rss_bytes: 1024,
      max_rss_observation: "observed via fixture"
    },
    storage_bytes: shape.backend === "sqlite" ? { database: 4096, wal: 0, shm: 0 } : { database: 4096 },
    connections: { method: "fixture", open_after_load: 1, peak_open: 2 },
    model_tool_cost: {
      model_calls: 0,
      remote_tool_calls: 0,
      attributable_cost: null,
      unit: "not-applicable"
    }
  };
}

// Row identities created by this fixture's operation mix for operationsPerType n:
// setup_seed(supersede_target i)=i+1, setup_seed(delete_target i)=n+i+1,
// setup_seed(fault_target)=2n+1, remember i=2n+2+i, supersede_atomic i (target i+1)=3n+2+i
// (row i+1 superseded_by row 3n+2+i); forget i deletes row n+i+1; the single
// faulted_supersede (target 2n+1) is rejected and must leave row 2n+1 untouched.
function operationPlans(n) {
  const plans = [];
  for (let i = 0; i < n; i += 1) {
    plans.push({ operation: "setup_seed", role: "supersede_target", index: i, targetId: null, newId: i + 1, marker: true });
  }
  for (let i = 0; i < n; i += 1) {
    plans.push({ operation: "setup_seed", role: "delete_target", index: i, targetId: null, newId: n + i + 1, marker: true });
  }
  plans.push({ operation: "setup_seed", role: "fault_target", index: 0, targetId: null, newId: 2 * n + 1, marker: true });
  plans.push({ operation: "faulted_supersede", role: null, index: 0, targetId: 2 * n + 1, newId: null, marker: true });
  for (let i = 0; i < n; i += 1) {
    plans.push({ operation: "remember", role: null, index: i, targetId: null, newId: 2 * n + 2 + i, marker: true });
  }
  for (let i = 0; i < n; i += 1) {
    plans.push({ operation: "supersede_atomic", role: null, index: i, targetId: i + 1, newId: 3 * n + 2 + i, marker: true });
  }
  for (let i = 0; i < n; i += 1) {
    plans.push({ operation: "forget", role: null, index: i, targetId: n + i + 1, newId: null, marker: false });
  }
  plans.push({ operation: "recovery_health", role: null, index: 0, targetId: null, newId: null, marker: false });
  return plans;
}

function operationId(runId, plan) {
  return `${runId}:${plan.operation}:${plan.role ?? "normal"}:${plan.index}`;
}

function operationEvents(runId, shape) {
  const events = [];
  for (const plan of operationPlans(shape.n)) {
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
      ? healthResult(shape)
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
  // The candidate peer remember observes one database-locked error inside the fault
  // window and retries once; the shared-handle baseline never observes the lock, so the
  // blocked control legitimately records zero retries (adapters/hc-cortex-002/README.md).
  if (shape.retries === 1) {
    events.push({
      event: "operation_retry",
      operation_id: `${runId}:remember:normal:0`,
      operation: "remember",
      phase: "load",
      attempt: 1,
      reason: "database-locked-after-fault"
    });
  }
  return events;
}

// Constraint evidence a PostgreSQL oracle publishes: uniquely sorted by schema, table and
// name, every constraint validated, and both memory supersession foreign keys present
// (the analyzer's postgresql_constraints_validated rule).
function postgresqlConstraints() {
  const keyword = { primary_key: "PRIMARY KEY", foreign_key: "FOREIGN KEY" };
  const constraint = (name, type, columns, referencesMemories) => ({
    columns,
    definition: `${keyword[type]} (${columns.join(", ")})`,
    name,
    referenced_columns: referencesMemories ? ["id"] : [],
    referenced_schema: referencesMemories ? "public" : null,
    referenced_table: referencesMemories ? "memories" : null,
    schema: "public",
    table: "memories",
    type,
    validated: true
  });
  return [
    constraint("memories_pkey", "primary_key", ["id"], false),
    constraint("memories_superseded_by_id_fkey", "foreign_key", ["superseded_by_id"], true),
    constraint("memories_supersedes_id_fkey", "foreign_key", ["supersedes_id"], true)
  ];
}

function persistedStateObservations(runId, shape, blocked) {
  const { n, faultTargetId } = shape;
  const row = (id, content, supersedesId, supersededById) => ({
    id,
    content,
    supersedes_id: supersedesId,
    superseded_by_id: supersededById,
    fts_populated: true,
    vector_populated: true
  });
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push(row(i + 1, `marker-${runId}:setup_seed:supersede_target:${i}`, null, 3 * n + 2 + i));
  }
  // Fault target. In the blocked-baseline control, the store has raw causal corruption:
  // the fault target is linked to itself as though it were both superseded and its own
  // successor, even though the fault operation was rejected. This is real row-level
  // corruption, not merely a false oracle check.
  rows.push(row(faultTargetId, `marker-${runId}:setup_seed:fault_target:0`,
    blocked ? faultTargetId : null, blocked ? faultTargetId : null));
  for (let i = 0; i < n; i += 1) {
    rows.push(row(2 * n + 2 + i, `marker-${runId}:remember:normal:${i}`, null, null));
  }
  for (let i = 0; i < n; i += 1) {
    rows.push(row(3 * n + 2 + i, `marker-${runId}:supersede_atomic:normal:${i}`, i + 1, null));
  }
  return {
    persisted_state_schema: "hc-cortex-002/persisted-state/v1",
    backend: shape.backend,
    scope: { domain: "hc-cortex-002", agent_context: runId },
    rows,
    memory_count: rows.length,
    fts_count: rows.filter((entry) => entry.fts_populated).length,
    vector_count: rows.filter((entry) => entry.vector_populated).length,
    vector_available: true,
    postgresql_constraints: shape.backend === "sqlite" ? "not_applicable" : postgresqlConstraints()
  };
}

function check(passed, observed, expected) {
  return { passed, observed, expected };
}

function oracleChecks(workloadStart, oracleStart, freshness, blocked, shape) {
  const { n, liveRows, elapsedNs } = shape;
  const expectedCounts = {
    faulted_supersede: 1,
    forget: n,
    recovery_health: 1,
    remember: n,
    setup_seed: 2 * n + 1,
    supersede_atomic: n
  };
  const configuration = (start) => ({
    process_start_count: 1,
    backend: start.backend,
    concurrency: start.concurrency,
    operations_per_type: start.operations_per_type,
    database_identity_sha256: start.database_identity_sha256,
    postgresql_service: start.postgresql_service
  });
  const perOperationCompleted = { remember: n, supersede_atomic: n, forget: n, faulted_supersede: 1 };
  const quantileMethod = "Hyndman-Fan type 1 (inverse empirical distribution function)";
  const constraintsValidated = { missing_required_memory_foreign_keys: [], unvalidated: [] };
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
    configuration_binding: check(true, configuration(workloadStart), configuration(oracleStart)),
    fresh_process_restart: check(true, {
      workload_boot_nonce: workloadStart.boot_nonce,
      oracle_boot_nonce: oracleStart.boot_nonce,
      workload_process_instance_id: workloadStart.process_instance_id,
      oracle_process_instance_id: oracleStart.process_instance_id
    }, "distinct boot nonce and process-instance identity"),
    fresh_empty_database_preflight: check(true, { preflight_count: 1, observation: freshness }, "one pre-store check proving zero user relations"),
    planned_operation_counts: check(true, expectedCounts, expectedCounts),
    one_outcome_per_intent: check(true, {
      intents: shape.intents,
      unique_intents: shape.intents,
      outcomes: shape.intents,
      duplicate_or_missing: []
    }, "one terminal outcome for each unique intent and no orphan outcomes"),
    acknowledged_and_rejected_contract: check(true, [], "every non-fault operation acknowledged; faulted supersede rejected; no indeterminate"),
    post_load_health_is_read_only: check(true, {
      intent_count: 1,
      marker: null,
      target_id: null,
      result: healthResult(shape)
    }, { marker: null, target_id: null, memory_fts_vector_count: liveRows, integrity: "backend-valid" }),
    fault_retry_choreography: check(shape.retries === shape.expectedRetries, shape.retries, shape.expectedRetries),
    marker_exactly_once_and_rejected_zero: check(true, { differences: {}, unexpected: [] }, "each expected live marker once; deleted and rejected markers zero"),
    supersession_state: check(true, [], "old head points to new row and new row points back to old head"),
    delete_state: check(true, [], []),
    fault_rollback_state: check(!blocked, blocked ? [{ target_id: shape.faultTargetId }] : [], "fault target remains the open head and rejected row is absent"),
    final_live_count_formula: check(true, liveRows, liveRows),
    memory_count: check(true, { count: liveRows, available: true }, liveRows),
    fts_count: check(true, { count: liveRows, available: true }, liveRows),
    vector_count: check(true, { count: liveRows, available: true }, liveRows),
    ...(shape.backend === "sqlite"
      ? {
          sqlite_integrity: check(true, [{ integrity_check: "ok" }], [{ integrity_check: "ok" }]),
          sqlite_foreign_keys: check(true, [], [])
        }
      : { postgresql_constraints_validated: check(true, constraintsValidated, constraintsValidated) }),
    load_telemetry_scope_and_types: check(true, {
      summary_count: 1,
      completed_operations: shape.loadOperations,
      per_operation_completed: perOperationCompleted,
      quantile_method: quantileMethod,
      throughput_denominator: "common measured load wall time"
    }, {
      completed_operations: shape.loadOperations,
      per_operation_completed: perOperationCompleted,
      quantile_method: quantileMethod,
      throughput_denominator: "common measured load wall time"
    }),
    load_window_exact: check(true, {
      event_count: 1,
      start_monotonic_ns: windowStart,
      end_monotonic_ns: windowEnd(shape),
      elapsed_ns: String(elapsedNs),
      summary_elapsed_ns: elapsedNs,
      load_intent_count: shape.loadOperations,
      load_outcome_count: shape.loadOperations
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
        backend: cell.parameters.backend,
        concurrency: cell.parameters.concurrency,
        operationsPerType: cell.parameters.operationsPerType,
        runId: cell.runId,
        database: cell.parameters.backend === "sqlite"
          ? { strategy: "release-cell-local", databaseIdentitySha256: cell.database.databaseIdentitySha256 }
          : cell.database,
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

function writeCell(release, planned, ordinal, blocked, postgresql = null) {
  const cellRoot = join(release, "cells", String(ordinal).padStart(4, "0"));
  const adapterRoot = join(cellRoot, "adapter");
  ensure(adapterRoot);
  const shape = cellShape(planned, blocked);
  const attemptId = `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
  const runId = `run-${String(ordinal).padStart(4, "0")}-fixture`;
  let database;
  let databaseIdentity;
  if (shape.backend === "sqlite") {
    ensure(join(cellRoot, "database"));
    writeFileSync(join(cellRoot, "database", "cortex.sqlite3"), Buffer.from([0, 1, 2, ordinal]));
    databaseIdentity = hash(Buffer.from(`database-${ordinal}`));
    database = { path: "database/cortex.sqlite3", databaseIdentitySha256: databaseIdentity };
  } else {
    databaseIdentity = postgresql.cell.databaseIdentitySha256;
    database = { strategy: "caller-supplied-per-cell", databaseIdentitySha256: databaseIdentity, redacted: true };
  }
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
    database,
    postgresqlService: postgresql ? {
      serviceInstanceId: postgresql.receipt.serviceInstanceId,
      startedAt: postgresql.receipt.startedAt,
      processId: postgresql.receipt.processId
    } : null
  };
  const workloadProcessId = `00000000-0000-4000-9000-${String(ordinal).padStart(12, "0")}`;
  const oracleProcessId = `00000000-0000-4000-a000-${String(ordinal).padStart(12, "0")}`;
  json(join(cellRoot, "cell.json"), cell);
  const common = { release_id: releaseId, protocol_id: protocol.protocolId, protocol_sha256: protocolSha256, cell_id: planned.id, attempt_id: attemptId };
  const workloadIdentity = { ...common, process_instance_id: workloadProcessId };
  const oracleIdentity = { ...common, process_instance_id: oracleProcessId };
  const ledgerService = postgresql ? {
    service_instance_id: postgresql.receipt.serviceInstanceId,
    started_at: postgresql.receipt.startedAt,
    server_inet_address: null
  } : null;
  const processStart = (mode, pid, bootNonce) => ({
    event: "process_start",
    mode,
    pid,
    boot_nonce: bootNonce,
    backend: shape.backend,
    database_identity_sha256: databaseIdentity,
    concurrency: shape.concurrency,
    operations_per_type: shape.n,
    run_id: runId,
    runtime: runtimeObservation(cell.source.id),
    postgresql_service: ledgerService
  });
  const workloadStart = processStart("workload", 101 + ordinal, `workload-boot-${ordinal}`);
  const freshness = {
    checked_before_store_initialization: true,
    method: shape.backend === "sqlite" ? "fixture" : "pg_catalog_non_system_non_extension_relations",
    empty: true,
    user_relation_count: 0
  };
  const workloadEvents = [
    workloadStart,
    { event: "backend_preflight", observation: freshness },
    ...operationEvents(runId, shape),
    {
      event: "load_window",
      start_monotonic_ns: windowStart,
      end_monotonic_ns: windowEnd(shape),
      elapsed_ns: String(shape.elapsedNs)
    },
    { event: "measurement_summary", observations: measurements(shape) },
    { event: "terminal", state: "complete", resolution: "pending_oracle", store_closed: true }
  ];
  const workloadName = `${runId}.workload.jsonl`;
  const workload = writeLedger(join(adapterRoot, workloadName), workloadEvents, workloadIdentity);
  workload.name = workloadName;
  const oracleStart = processStart("oracle", 201 + ordinal, `oracle-boot-${ordinal}`);
  const checks = oracleChecks({ ...workloadStart, ...workloadIdentity }, { ...oracleStart, ...oracleIdentity }, freshness, blocked, shape);
  const verdict = blocked ? "blocked" : "proven";
  const oracleEvents = [
    oracleStart,
    { event: "workload_ledger_verified", workload_sha256: workload.sha256, workload_records: workload.lines.length },
    {
      event: "oracle_result",
      verdict,
      checks,
      observations: {
        ...persistedStateObservations(runId, shape, blocked),
        sqlite_integrity: shape.backend === "sqlite" ? [{ integrity_check: "ok" }] : "not_applicable",
        sqlite_foreign_key_violations: shape.backend === "sqlite" ? [] : "not_applicable",
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
    startedAt: "2026-09-01T23:59:58Z",
    endedAt: "2026-09-01T23:59:59Z",
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
  const temporary = realpathSync.native(requestedTemporary);
  const requestedRelease = join(requestedTemporary, releaseId);
  ensure(requestedRelease);
  const realRelease = realpathSync.native(requestedRelease);
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
  // Optionally attempt the first preregistered PostgreSQL main cell against a bound
  // service receipt, so the analyzer's PostgreSQL-attempted path (structured service
  // binding through cell input, process receipts and both ledgers) is exercised by
  // fixture evidence and not only by a live run.
  let postgresql = null;
  if (options.attemptPostgresql) {
    const receipt = writePostgresqlReceipt(realRelease);
    const index = protocol.plannedCells.findIndex((cell) => cell.parameters.backend === "postgresql");
    const planned = protocol.plannedCells[index];
    const serviceCell = receipt.cells.find((entry) => entry.cellId === planned.id);
    postgresql = writeCell(realRelease, planned, index + 1, false, { receipt, cell: serviceCell });
  }
  for (let index = 2; index < protocol.plannedCells.length; index += 1) {
    if (postgresql && postgresql.cell.ordinal === index + 1) {
      cells.push(postgresql.result);
      continue;
    }
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
  return { temporary, release: realRelease, requestedRelease, baseline, candidate, postgresql };
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
  return receipt;
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

// Forges a derived JSON artifact and rewrites the manifest's own digest for it, so a consumer
// trusting the manifest's recorded sha256 (instead of independently recomputing the artifact
// from raw evidence, as verifyHcCortex002Release does) would see a self-consistent forgery.
function forgeArtifactAndRehashManifest(fixture, artifactPath, mutate) {
  const artifactFsPath = join(fixture.release, ...artifactPath.split("/"));
  const value = JSON.parse(readFileSync(artifactFsPath));
  mutate(value);
  json(artifactFsPath, value);
  const bytes = readFileSync(artifactFsPath);
  const manifestPath = join(fixture.release, "execution-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath));
  const artifact = manifest.artifacts.find((entry) => entry.path === artifactPath);
  artifact.sha256 = hash(bytes);
  artifact.bytes = bytes.length;
  json(manifestPath, manifest);
}

test("read-only release verification recomputes derived claims instead of trusting rehashed bytes", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(verifyHcCortex002Release(fixture.release).valid, true);
    forgeArtifactAndRehashManifest(fixture, "scoring/scoring.json", (scoring) => {
      scoring.studyVerdict.label = "PASS";
    });
    expectCode(() => verifyHcCortex002Release(fixture.release), "DERIVED_ARTIFACT_RECOMPUTATION_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("read-only release verification rejects a rehashed but forged analysis document", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(verifyHcCortex002Release(fixture.release).valid, true);
    forgeArtifactAndRehashManifest(fixture, "analysis/analysis.json", (analysis) => {
      analysis.cells[0].correctnessLabel = analysis.cells[0].correctnessLabel === "PASS" ? "FAIL" : "PASS";
    });
    expectCode(() => verifyHcCortex002Release(fixture.release), "DERIVED_ARTIFACT_RECOMPUTATION_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("read-only release verification rejects a rehashed but forged negative-evidence document", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(verifyHcCortex002Release(fixture.release).valid, true);
    forgeArtifactAndRehashManifest(fixture, "analysis/negative-evidence.json", (negative) => {
      assert.ok(negative.entries.length > 1, "fixture must carry more than one negative-evidence entry to forge one away");
      negative.entries = negative.entries.slice(0, -1);
    });
    expectCode(() => verifyHcCortex002Release(fixture.release), "DERIVED_ARTIFACT_RECOMPUTATION_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("read-only release verification rejects a forged manifest projection with no separate artifact to rehash", () => {
  const fixture = createRelease();
  try {
    analyzeHcCortex002Release(fixture.release, { generatedAt: fixedTime });
    sealHcCortex002Release(fixture.release, { releaseStatus: "PILOT", generatedAt: fixedTime });
    assert.equal(verifyHcCortex002Release(fixture.release).valid, true);
    const manifestPath = join(fixture.release, "execution-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath));
    // The manifest's own cell verdict is a projection derived from raw evidence, not a
    // separately hashed artifact -- there is nothing to "rehash" here, unlike the artifact
    // forgeries above. A consumer that trusted the manifest's own bytes instead of rebuilding
    // it fresh from raw evidence would accept this.
    manifest.cells[0].verdict = manifest.cells[0].verdict === "proven" ? "blocked" : "proven";
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

test("the blocked baseline records zero retries and fails only treatment-sensitive checks", () => {
  const fixture = createRelease();
  try {
    const result = analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime });
    const baseline = result.analysis.cells[0];
    assert.equal(baseline.observedVerdict, "blocked");
    assert.equal(baseline.expectationMatch, true);
    assert.deepEqual(baseline.failedChecks, ["fault_retry_choreography", "fault_rollback_state"]);
    assert.equal(baseline.metrics.retries, 0);
    assert.equal(result.analysis.cells[1].metrics.retries, 1);
    assert.equal(result.scoring.causalContrast.label, "PASS");
  } finally {
    cleanup(fixture);
  }
});

test("a second retry or a retry outside the peer remember invalidates the ledger", () => {
  const duplicated = createRelease();
  try {
    rewriteWorkloadEvidence(duplicated.release, duplicated.candidate, 2, (records) => {
      const retry = records.find((record) => record.event === "operation_retry");
      records.splice(records.indexOf(retry) + 1, 0, structuredClone(retry));
    });
    expectCode(() => analyzeHcCortex002Release(duplicated.release, { write: false, generatedAt: fixedTime }), "RETRY_CHOREOGRAPHY_INVALID");
  } finally {
    cleanup(duplicated);
  }
  const misattributed = createRelease();
  try {
    rewriteWorkloadEvidence(misattributed.release, misattributed.candidate, 2, (records) => {
      const retry = records.find((record) => record.event === "operation_retry");
      const forget = records.find((record) => record.event === "operation_intent" && record.operation === "forget");
      retry.operation = "forget";
      retry.operation_id = forget.operation_id;
    });
    expectCode(() => analyzeHcCortex002Release(misattributed.release, { write: false, generatedAt: fixedTime }), "RETRY_CHOREOGRAPHY_INVALID");
  } finally {
    cleanup(misattributed);
  }
});

test("a retry check whose observed count contradicts the workload ledger is rejected", () => {
  const fixture = createRelease();
  try {
    rewriteOracleEvidence(fixture.release, fixture.candidate, 2, (records) => {
      const result = records.find((record) => record.event === "oracle_result");
      result.checks.fault_retry_choreography.observed = 0;
    });
    expectCode(() => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }), "ORACLE_CHECK_VERDICT_MISMATCH");
  } finally {
    cleanup(fixture);
  }
});

test("an attempted PostgreSQL cell binds its structured service identity through every receipt", () => {
  const fixture = createRelease({ attemptPostgresql: true });
  try {
    const result = analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime });
    const attempted = result.analysis.postgresqlService.cells.filter((cell) => cell.executionState === "attempted");
    assert.deepEqual(attempted.map((cell) => cell.cellId), [fixture.postgresql.cell.id]);
    const cell = result.analysis.cells.find((entry) => entry.id === fixture.postgresql.cell.id);
    assert.equal(cell.backend, "postgresql");
    assert.equal(cell.observedVerdict, "proven");
    assert.equal(cell.expectationMatch, true);
    assert.deepEqual(cell.failedChecks, []);
    assert.equal(cell.metrics.retries, 0);
  } finally {
    cleanup(fixture);
  }
});

test("a PostgreSQL process receipt whose service binding drifts from its cell is rejected", () => {
  const fixture = createRelease({ attemptPostgresql: true });
  try {
    const ordinal = fixture.postgresql.cell.ordinal;
    const path = join(fixture.release, `cells/${String(ordinal).padStart(4, "0")}/workload/process.json`);
    const record = JSON.parse(readFileSync(path));
    record.command.logicalArguments.postgresqlService.processId += 1;
    json(path, record);
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "PROCESS_BINDING_INVALID"
    );
  } finally {
    cleanup(fixture);
  }
});

test("a process receipt whose logical service argument is absent rather than null is rejected", () => {
  const fixture = createRelease();
  try {
    const ordinal = fixture.candidate.cell.ordinal;
    const path = join(fixture.release, `cells/${String(ordinal).padStart(4, "0")}/workload/process.json`);
    const record = JSON.parse(readFileSync(path));
    assert.equal(record.command.logicalArguments.postgresqlService, null);
    delete record.command.logicalArguments.postgresqlService;
    json(path, record);
    expectCode(
      () => analyzeHcCortex002Release(fixture.release, { write: false, generatedAt: fixedTime }),
      "PROCESS_BINDING_INVALID"
    );
  } finally {
    cleanup(fixture);
  }
});
