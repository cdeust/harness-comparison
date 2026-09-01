import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  appendFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadBenchmarkProtocol,
  validateBenchmarkProtocol,
  validateBenchmarkRelease,
  validationSchemaVersion
} from "./benchmark-release-lib.mjs";

const cliPath = fileURLToPath(new URL("validate-benchmark-release.mjs", import.meta.url));
const corpusRevision = "1".repeat(40);
const evidenceSourceIds = ["source-1"];
const requiredRoles = ["analysis", "scoring", "negative-log", "review", "reproduction", "change-log"];

function json(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command, arguments_, cwd) {
  const execution = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
  assert.equal(
    execution.status,
    0,
    `${command} ${arguments_.join(" ")} failed\n${execution.stdout}\n${execution.stderr}`
  );
  return execution.stdout.trim();
}

function git(cwd, ...arguments_) {
  return run("git", arguments_, cwd);
}

function observed(path) {
  const bytes = readFileSync(path);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length
  };
}

function artifact(root, path, role, immutable = true) {
  return { path, ...observed(join(root, path)), role, immutable };
}

function sourced(description) {
  return { description, evidenceSourceIds };
}

function value(value_, unit, rationale) {
  return { value: value_, unit, rationale, evidenceSourceIds };
}

function protocolFixture(cellCount = 1, protocolId = "fixture-protocol-v1") {
  const phases = Array.from({ length: cellCount }, (_, index) => `phase-${index + 1}`);
  const plannedCells = phases.map((phase, index) => ({
    id: `cell-${index + 1}`,
    populationId: "fixture-population",
    experimentalUnitId: "fixture-unit",
    corpusId: "fixture-corpus",
    adapterId: "fixture-adapter/v1",
    expectedVerdict: "proven",
    parameters: {
      sourceId: "fixture-unit",
      backend: "fixture",
      concurrency: 1,
      operationsPerType: 1,
      repetition: 1,
      phase,
      callRate: "closed-loop",
      callCount: 1,
      duration: null
    }
  }));
  return {
    schemaVersion: "benchmark-protocol/v1",
    protocolId,
    title: "Validator fixture protocol",
    registeredAt: "2020-01-01T00:00:00Z",
    researchQuestion: "Does the release gate reject unanchored or incomplete evidence?",
    systemBoundary: "The deterministic fixture release and its declared artifacts.",
    evidenceSources: [{
      id: "source-1",
      citation: "RESEARCH-PROCESS.md",
      claim: "Preregistration and content-addressed artifacts precede publication."
    }],
    hypotheses: [{
      id: "H1",
      statement: "A complete, anchored fixture validates.",
      falsifier: "The complete fixture produces a validation error."
    }],
    nonClaims: ["The fixture does not measure product performance."],
    populations: [{
      id: "fixture-population",
      description: "Deterministic fixture tasks.",
      inclusion: "The declared cells.",
      exclusion: "External workloads."
    }],
    experimentalUnits: [{
      id: "fixture-unit",
      description: "The validator fixture adapter.",
      components: ["fixture-adapter"]
    }],
    adapters: [{
      id: "fixture-adapter/v1",
      path: "adapters/fixture-adapter.mjs",
      runtimeId: "node",
      interface: "benchmark-workload-adapter/v1"
    }],
    corpora: [{
      id: "fixture-corpus",
      repository: "https://example.invalid/fixture.git",
      revision: corpusRevision,
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
      description: "Single local Node process.",
      limits: {
        processIsolation: value("fixture", "mode", "A fresh directory isolates each fixture.")
      },
      evidenceSourceIds
    },
    operationPolicy: {
      adapterId: "fixture-adapter/v1",
      orderedOperations: [{
        id: "write-ledger",
        description: "Write the deterministic raw ledger.",
        parameters: [{
          id: "payload",
          ...value("fixture", "label", "The fixture has one named payload.")
        }]
      }],
      retryPolicy: sourced("No retry is performed."),
      interruptionPolicy: sourced("An interrupted attempt remains indeterminate.")
    },
    workload: {
      concurrencyLevels: value([1], "processes", "One process isolates validator behavior."),
      callRate: value(["closed-loop"], "mode", "Each operation completes before the next starts."),
      callCount: value([1], "operations", "Each cell emits one operation."),
      duration: value([null], "not-applicable", "Completion, not elapsed time, ends a cell."),
      completionCondition: sourced("The operation and raw ledger are present."),
      warmColdPolicy: sourced("Each cell starts from a new directory."),
      faultSchedule: [],
      quantileMethod: sourced("No latency quantile is computed by this integrity fixture."),
      parameterSpace: {
        sourceId: value(["fixture-unit"], "identifier", "One experimental unit is in scope."),
        backend: value(["fixture"], "identifier", "One backend is in scope."),
        concurrency: value([1], "processes", "The declared concurrency is executable."),
        operationsPerType: value([1], "operations", "Each cell has one operation."),
        repetition: value([1], "ordinal", "The deterministic fixture has one repetition."),
        phase: value(phases, "identifier", "Each planned phase is represented once."),
        callRate: value(["closed-loop"], "mode", "The workload call-rate policy is bound."),
        callCount: value([1], "operations", "The workload call count is bound."),
        duration: value([null], "not-applicable", "The workload duration is bound.")
      },
      cellOrder: plannedCells.map((cell) => cell.id)
    },
    metrics: [{
      id: "validation-errors",
      definition: "Number of validation errors.",
      unit: "errors",
      summary: "Exact count."
    }],
    repetitions: {
      count: 1,
      unit: "fixture release",
      rationale: "One deterministic conformance repetition.",
      evidenceSourceIds
    },
    stopRule: {
      description: "Stop a failed stratum and retain evidence; continue independent strata.",
      onSuccess: "Preserve the validation receipt.",
      onFailure: "Preserve the reason for every skipped cell.",
      evidenceSourceIds
    },
    scoringRubric: {
      procedure: "Compare machine error codes with the expected set.",
      independent: true,
      labels: [{ id: "valid", definition: "No validation errors." }]
    },
    plannedCells,
    declaredDeviations: []
  };
}

function createRegistrationRepository({
  cellCount = 1,
  protocolId = "fixture-protocol-v1",
  protocolArtifactPath = "protocols/fixture.json"
} = {}) {
  const base = mkdtempSync(join(tmpdir(), "benchmark-git-fixture-"));
  const origin = join(base, "origin.git");
  const source = join(base, "source");
  mkdirSync(source, { recursive: true });
  git(base, "init", "--bare", origin);
  git(source, "init");
  git(source, "config", "user.name", "Benchmark Fixture");
  git(source, "config", "user.email", "fixture@example.invalid");
  git(source, "config", "core.autocrlf", "false");
  git(source, "branch", "-M", "main");
  git(source, "remote", "add", "origin", origin);
  const protocolSegments = protocolArtifactPath.split("/");
  mkdirSync(join(source, ...protocolSegments.slice(0, -1)), { recursive: true });
  json(join(source, ...protocolSegments), protocolFixture(cellCount, protocolId));
  git(source, "add", protocolArtifactPath);
  git(source, "commit", "-m", "Register fixture protocol");
  git(source, "push", "-u", "origin", "main");
  git(origin, "symbolic-ref", "HEAD", "refs/heads/main");
  return {
    base,
    origin,
    source,
    protocolPath: join(source, ...protocolSegments),
    protocolArtifactPath,
    registrationRevision: git(source, "rev-parse", "HEAD")
  };
}

function cellRecord(protocol, protocolSha256, id, ordinal) {
  const planned = protocol.plannedCells.find((cell) => cell.id === id);
  const seconds = String(ordinal * 2).padStart(2, "0");
  const endSeconds = String(ordinal * 2 + 1).padStart(2, "0");
  return {
    id,
    startedAt: `2090-01-01T00:00:${seconds}Z`,
    endedAt: `2090-01-01T00:00:${endSeconds}Z`,
    status: "completed",
    expectedVerdict: planned.expectedVerdict,
    verdict: planned.expectedVerdict,
    protocolSha256,
    attemptId: `attempt-${id}`,
    processInstanceId: "fixture-process-1",
    restartReceiptArtifactPath: `raw/${id}/restart-receipt.json`,
    rawLedgerArtifactPath: `raw/${id}/ledger.jsonl`,
    rawArtifactPaths: [`raw/${id}/restart-receipt.json`, `raw/${id}/ledger.jsonl`],
    resolution: { state: "resolved", detail: "The deterministic operation reached its oracle." }
  };
}

function createRelease(registration, {
  status = "VERIFIED",
  executedIds,
  releaseId = "fixture-release-v1"
} = {}) {
  const published = status === "PUBLISHED";
  const root = published
    ? join(registration.source, "artifacts", releaseId)
    : join(registration.base, releaseId);
  const protocolArtifactPath = registration.protocolArtifactPath ?? "protocols/fixture.json";
  const protocolSegments = protocolArtifactPath.split("/");
  mkdirSync(join(root, ...protocolSegments.slice(0, -1)), { recursive: true });
  mkdirSync(join(root, "raw"), { recursive: true });
  mkdirSync(join(root, "reports"), { recursive: true });
  writeFileSync(join(root, ...protocolSegments), readFileSync(registration.protocolPath));
  const protocol = JSON.parse(readFileSync(registration.protocolPath, "utf8"));
  const protocolObserved = observed(join(root, ...protocolSegments));
  const selectedIds = status === "PREREGISTERED"
    ? []
    : executedIds ?? protocol.workload.cellOrder;
  for (const id of selectedIds) {
    mkdirSync(join(root, "raw", id), { recursive: true });
    writeFileSync(join(root, "raw", id, "ledger.jsonl"), `{"cellId":"${id}","event":"complete"}\n`, "utf8");
    json(join(root, "raw", id, "restart-receipt.json"), { cellId: id, freshProcess: true });
  }
  const skipped = protocol.workload.cellOrder.filter((id) => !selectedIds.includes(id));
  const skipReason = "stopped-after-negative-evidence-in-backend-repetition";
  const summaryCells = protocol.plannedCells.map((cell) => selectedIds.includes(cell.id)
    ? {
        id: cell.id,
        expectedVerdict: cell.expectedVerdict,
        verdict: cell.expectedVerdict,
        status: "passed",
        reason: "oracle-complete"
      }
    : {
        id: cell.id,
        expectedVerdict: cell.expectedVerdict,
        verdict: null,
        status: "not-run",
        reason: skipReason
      });
  if (status === "PILOT") {
    json(join(root, "raw", "run-summary.json"), {
      schemaVersion: "workload-run-summary/v1",
      releaseId,
      protocolId: protocol.protocolId,
      protocolSha256: protocolObserved.sha256,
      status: skipped.length > 0 ? "failed" : "completed",
      cells: summaryCells
    });
  }
  const negativeRecords = status === "PILOT"
    ? summaryCells.filter((cell) => cell.status !== "passed" || cell.verdict === "blocked").map((cell) => ({
        schemaVersion: "workload-negative-log/v1",
        cellId: cell.id,
        status: cell.status,
        verdict: cell.verdict,
        reason: cell.reason
      }))
    : [];
  if (negativeRecords.length === 0) negativeRecords.push({
      schemaVersion: "workload-negative-log/v1",
      cellId: null,
      status: "none",
      verdict: null,
      reason: "no-negative-evidence-observed"
    });
  writeFileSync(join(root, "reports", "negative-results.jsonl"),
    `${negativeRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  json(join(root, "reports", "analysis.json"), { method: "deterministic-fixture", complete: true });
  json(join(root, "reports", "score.json"), { errors: 0 });
  writeFileSync(join(root, "reports", "review.md"), "Independent fixture review.\n", "utf8");
  writeFileSync(join(root, "reports", "reproduce.md"), "Run the validator test suite.\n", "utf8");
  writeFileSync(join(root, "reports", "changes.md"), "Initial fixture release.\n", "utf8");

  const artifacts = [artifact(root, protocolArtifactPath, "protocol")];
  for (const id of selectedIds) {
    artifacts.push(artifact(root, `raw/${id}/ledger.jsonl`, "raw"));
    artifacts.push(artifact(root, `raw/${id}/restart-receipt.json`, "raw"));
  }
  if (status === "PILOT") {
    artifacts.push(artifact(root, "raw/run-summary.json", "raw"));
  }
  const reportArtifacts = [
    ["reports/analysis.json", "analysis"],
    ["reports/score.json", "scoring"],
    ["reports/negative-results.jsonl", "negative-log"],
    ["reports/review.md", "review"],
    ["reports/reproduce.md", "reproduction"],
    ["reports/changes.md", "change-log"]
  ];
  for (const [path, role] of reportArtifacts) artifacts.push(artifact(root, path, role));
  const cells = selectedIds.map((id, index) => cellRecord(protocol, protocolObserved.sha256, id, index + 1));
  const manifest = {
    schemaVersion: "benchmark-execution-manifest/v1",
    releaseId,
    releaseStatus: status,
    generatedAt: "2090-01-01T00:01:00Z",
    immutabilityPolicy: {
      scheme: "sha256+bytes+manifest/v1",
      osWriteProtectionClaimed: false,
      externalBinding: published ? "git-commit" : "validation-snapshot"
    },
    protocol: {
      path: protocolArtifactPath,
      sha256: protocolObserved.sha256,
      sourceRegistration: {
        repository: registration.origin,
        revision: registration.registrationRevision,
        path: protocolArtifactPath
      }
    },
    environment: {
      repositories: [{
        id: "fixture-corpus",
        repository: "https://example.invalid/fixture.git",
        revision: corpusRevision,
        dirty: false,
        dirtyPaths: []
      }, {
        id: "protocol-source",
        repository: registration.origin,
        revision: registration.registrationRevision,
        dirty: false,
        dirtyPaths: []
      }],
      host: {
        os: process.platform,
        release: "fixture-release",
        architecture: process.arch,
        cpu: "fixture-cpu",
        logicalCpus: 1,
        memoryBytes: 1
      },
      runtimes: [{ id: "node", version: process.version }],
      tools: [{ id: "benchmark-release-validator", version: "v1" }],
      credentials: [],
      stores: [{
        id: "fixture-store",
        type: "directory",
        location: "raw/",
        isolation: "release-local",
        initialState: "empty"
      }],
      processes: [{
        id: "fixture-process",
        instanceId: "fixture-process-1",
        command: "fixture-adapter",
        pid: 1,
        host: "same-user local fixture host; no sandbox claimed",
        declaredEndpoints: []
      }]
    },
    artifacts,
    cells
  };
  json(join(root, "execution-manifest.json"), manifest);
  if (published) {
    git(registration.source, "add", relative(registration.source, root));
    git(registration.source, "commit", "-m", `Publish ${releaseId}`);
    git(registration.source, "push", "origin", "main");
  }
  return { root, manifest, protocol, skipped };
}

function rewriteManifest(fixture) {
  json(join(fixture.root, "execution-manifest.json"), fixture.manifest);
}

function refreshArtifact(fixture, path) {
  Object.assign(fixture.manifest.artifacts.find((entry) => entry.path === path), observed(join(fixture.root, path)));
  rewriteManifest(fixture);
}

function rewritePilotSummaryCell(fixture, id, update) {
  const summaryPath = join(fixture.root, "raw", "run-summary.json");
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const cell = summary.cells.find((entry) => entry.id === id);
  assert(cell, `Missing summary cell ${id}`);
  Object.assign(cell, update);
  summary.status = summary.cells.some((entry) => entry.status === "indeterminate")
    ? "indeterminate"
    : summary.cells.some((entry) => entry.status === "failed") ? "failed" : "completed";
  json(summaryPath, summary);

  const negative = summary.cells.filter((entry) => entry.status !== "passed" || entry.verdict === "blocked")
    .map((entry) => ({
      schemaVersion: "workload-negative-log/v1",
      cellId: entry.id,
      status: entry.status,
      verdict: entry.verdict,
      reason: entry.reason
    }));
  if (negative.length === 0) negative.push({
    schemaVersion: "workload-negative-log/v1",
    cellId: null,
    status: "none",
    verdict: null,
    reason: "no-negative-evidence-observed"
  });
  const negativePath = join(fixture.root, "reports", "negative-results.jsonl");
  writeFileSync(negativePath, `${negative.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  for (const path of ["raw/run-summary.json", "reports/negative-results.jsonl"]) {
    Object.assign(fixture.manifest.artifacts.find((entry) => entry.path === path), observed(join(fixture.root, path)));
  }
  rewriteManifest(fixture);
}

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function withFixture(callback, options = {}) {
  const registration = createRegistrationRepository(options);
  const fixture = createRelease(registration, options);
  const cleanup = () => rmSync(registration.base, { recursive: true, force: true });
  let returned;
  try {
    returned = callback({ registration, fixture });
  } catch (error) {
    cleanup();
    throw error;
  }
  if (returned && typeof returned.then === "function") return returned.finally(cleanup);
  cleanup();
  return returned;
}

function validate(fixture, registration) {
  return validateBenchmarkRelease(fixture.root, { sourceRepositoryRoot: registration.source });
}

test("real pushed Git registration, full VERIFIED roles, and single-read preflight validate", () => {
  withFixture(({ registration, fixture }) => {
    const releaseResult = validate(fixture, registration);
    assert.deepEqual(releaseResult.errors, []);
    assert.equal(releaseResult.summary.manifestSha256, observed(join(fixture.root, "execution-manifest.json")).sha256);
    assert.deepEqual(new Set(fixture.manifest.artifacts.map((entry) => entry.role)), new Set(["protocol", "raw", ...requiredRoles]));
    const inspection = loadBenchmarkProtocol(registration.protocolPath, { sourceRepositoryRoot: registration.source });
    assert.equal(inspection.validation.valid, true);
    assert(Buffer.isBuffer(inspection.bytes));
    assert.equal(inspection.sha256, observed(registration.protocolPath).sha256);
    assert.equal(inspection.sourceRegistration.revision, registration.registrationRevision);
    assert.deepEqual(inspection.protocol, fixture.protocol);
  });
});

test("PUBLISHED release is committed, pushed, exact, and valid from a clean clone", () => {
  withFixture(({ registration, fixture }) => {
    const publishedRevision = git(registration.source, "rev-parse", "HEAD");
    const result = validate(fixture, registration);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.summary.releaseRegistration.revision, publishedRevision);

    writeFileSync(join(registration.source, "unrelated-after-publication.txt"), "later unrelated commit\n", "utf8");
    git(registration.source, "add", "unrelated-after-publication.txt");
    git(registration.source, "commit", "-m", "Commit unrelated work after publication");
    git(registration.source, "push", "origin", "main");
    const afterUnrelatedCommit = validate(fixture, registration);
    assert.equal(afterUnrelatedCommit.valid, true, JSON.stringify(afterUnrelatedCommit.errors));
    assert.equal(afterUnrelatedCommit.summary.releaseRegistration.revision, publishedRevision);

    const clone = join(registration.base, "clean-clone");
    git(registration.base, "-c", "core.autocrlf=false", "clone", registration.origin, clone);
    const clonedRelease = join(clone, relative(registration.source, fixture.root));
    assert.deepEqual(validateBenchmarkRelease(clonedRelease, { sourceRepositoryRoot: clone }).errors, []);
  }, { status: "PUBLISHED", releaseId: "published-fixture-v1" });
});

test("protocol bytes cannot be rewritten and rehashed after registration", () => {
  withFixture(({ registration, fixture }) => {
    const path = join(fixture.root, "protocols", "fixture.json");
    const changed = JSON.parse(readFileSync(path, "utf8"));
    changed.title = "Post-hoc rewritten protocol";
    json(path, changed);
    const digest = observed(path);
    Object.assign(fixture.manifest.artifacts.find((entry) => entry.path === "protocols/fixture.json"), digest);
    fixture.manifest.protocol.sha256 = digest.sha256;
    fixture.manifest.cells.forEach((cell) => { cell.protocolSha256 = digest.sha256; });
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("GIT_PROTOCOL_BLOB_MISMATCH"));
  });
});

test("registration requires a local commit, matching origin, ancestry, and fetched remote reachability", () => {
  withFixture(({ registration, fixture }) => {
    writeFileSync(join(registration.source, "local-only.txt"), "not pushed\n", "utf8");
    git(registration.source, "add", "local-only.txt");
    git(registration.source, "commit", "-m", "Local-only registration revision");
    const localRevision = git(registration.source, "rev-parse", "HEAD");
    fixture.manifest.protocol.sourceRegistration.revision = localRevision;
    fixture.manifest.environment.repositories[1].revision = localRevision;
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("GIT_REVISION_NOT_REMOTE_REACHABLE"));

    fixture.manifest.protocol.sourceRegistration.revision = "2".repeat(40);
    fixture.manifest.environment.repositories[1].revision = "2".repeat(40);
    rewriteManifest(fixture);
    const missingCommitCodes = codes(validate(fixture, registration));
    assert(missingCommitCodes.has("GIT_COMMIT_MISSING"));
    assert.equal(missingCommitCodes.has("VALIDATION_INTERNAL_ERROR"), false);

    fixture.manifest.protocol.sourceRegistration.revision = registration.registrationRevision;
    fixture.manifest.environment.repositories[1].revision = registration.registrationRevision;
    fixture.manifest.protocol.sourceRegistration.repository = "https://example.invalid/wrong.git";
    fixture.manifest.environment.repositories[1].repository = "https://example.invalid/wrong.git";
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("GIT_REMOTE_MISMATCH"));

    git(registration.source, "remote", "set-url", "origin", "https://example.invalid:8443/harness.git");
    fixture.manifest.protocol.sourceRegistration.repository = "https://example.invalid:9443/harness.git";
    fixture.manifest.environment.repositories[1].repository = "https://example.invalid:9443/harness.git";
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("GIT_REMOTE_MISMATCH"));
  });
});

test("protocol preflight and environment receipts require clean source states", () => {
  const registration = createRegistrationRepository();
  try {
    writeFileSync(join(registration.source, "untracked-after-registration.txt"), "dirty\n", "utf8");
    assert(codes(validateBenchmarkProtocol(registration.protocolPath, {
      sourceRepositoryRoot: registration.source
    })).has("PROTOCOL_CHECKOUT_NOT_CLEAN"));
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }

  withFixture(({ registration: source, fixture }) => {
    fixture.manifest.environment.repositories[0].dirty = true;
    fixture.manifest.environment.repositories[0].dirtyPaths = ["corpus-change.txt"];
    fixture.manifest.environment.repositories[1].dirty = true;
    fixture.manifest.environment.repositories[1].dirtyPaths = ["protocol-change.txt"];
    rewriteManifest(fixture);
    const resultCodes = codes(validate(fixture, source));
    assert(resultCodes.has("CORPUS_DIRTY_STATE_MISMATCH"));
    assert(resultCodes.has("PROTOCOL_SOURCE_DIRTY"));
  });
});

test("repository credentials are rejected and never echoed", () => {
  withFixture(({ registration, fixture }) => {
    const credentialedUrl = new URL("https://example.invalid/harness.git");
    credentialedUrl.username = "fixture-user";
    credentialedUrl.password = "fixture-credential";
    const credentialed = credentialedUrl.toString();
    git(registration.source, "remote", "set-url", "origin", credentialed);
    fixture.manifest.protocol.sourceRegistration.repository = credentialed;
    fixture.manifest.environment.repositories[1].repository = credentialed;
    rewriteManifest(fixture);
    const result = validate(fixture, registration);
    assert(codes(result).has("REPOSITORY_CREDENTIALS_FORBIDDEN"));
    assert.equal(JSON.stringify(result).includes(credentialedUrl.username), false);
    assert.equal(JSON.stringify(result).includes(credentialedUrl.password), false);

    const queryCredentialUrl = new URL("https://example.invalid/harness.git");
    queryCredentialUrl.searchParams.set("access_token", "fixture-query-credential");
    const queryCredentialed = queryCredentialUrl.toString();
    git(registration.source, "remote", "set-url", "origin", queryCredentialed);
    fixture.manifest.protocol.sourceRegistration.repository = queryCredentialed;
    fixture.manifest.environment.repositories[1].repository = queryCredentialed;
    rewriteManifest(fixture);
    const queryResult = validate(fixture, registration);
    assert(codes(queryResult).has("REPOSITORY_CREDENTIALS_FORBIDDEN"));
    assert.equal(JSON.stringify(queryResult).includes("fixture-query-credential"), false);
  });
});

test("PILOT accepts a non-prefix ordered subsequence only with sealed skip evidence", () => {
  withFixture(({ registration, fixture }) => {
    assert.deepEqual(fixture.manifest.cells.map((cell) => cell.id), ["cell-1", "cell-3"]);
    assert.deepEqual(validate(fixture, registration).errors, []);

    const summaryPath = join(fixture.root, "raw", "run-summary.json");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    summary.cells.find((entry) => entry.id === "cell-2").reason = "TBD";
    json(summaryPath, summary);
    refreshArtifact(fixture, "raw/run-summary.json");
    assert(codes(validate(fixture, registration)).has("PILOT_SKIPPED_CELL_REASON_MISSING"));

    summary.cells.find((entry) => entry.id === "cell-2").reason = "stopped-after-negative-evidence-in-backend-repetition";
    json(summaryPath, summary);
    refreshArtifact(fixture, "raw/run-summary.json");

    summary.cells.reverse();
    json(summaryPath, summary);
    refreshArtifact(fixture, "raw/run-summary.json");
    assert(codes(validate(fixture, registration)).has("PILOT_RUN_SUMMARY_MATRIX_INVALID"));
    summary.cells.reverse();
    json(summaryPath, summary);
    refreshArtifact(fixture, "raw/run-summary.json");

    const negativePath = join(fixture.root, "reports", "negative-results.jsonl");
    const negative = JSON.parse(readFileSync(negativePath, "utf8"));
    negative.cellId = "cell-20";
    writeFileSync(negativePath, `${JSON.stringify(negative)}\n`, "utf8");
    refreshArtifact(fixture, "reports/negative-results.jsonl");
    assert(codes(validate(fixture, registration)).has("PILOT_NEGATIVE_LOG_INCOMPLETE"));

    fixture.manifest.artifacts = fixture.manifest.artifacts.filter((entry) => entry.role !== "negative-log");
    rmSync(negativePath);
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("PILOT_NEGATIVE_LOG_REQUIRED"));
  }, { status: "PILOT", cellCount: 3, executedIds: ["cell-1", "cell-3"] });
});

test("PILOT rejects out-of-order or duplicate execution cells", () => {
  withFixture(({ registration, fixture }) => {
    fixture.manifest.cells.reverse();
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("CELL_EXECUTION_ORDER_MISMATCH"));
  }, { status: "PILOT", cellCount: 3, executedIds: ["cell-1", "cell-3"] });
});

test("PREREGISTERED has no cells; VERIFIED requires exact resolved matrix and all evidence roles", () => {
  withFixture(({ registration, fixture }) => {
    assert.deepEqual(validate(fixture, registration).errors, []);
  }, { status: "PREREGISTERED" });

  withFixture(({ registration, fixture }) => {
    fixture.manifest.cells.pop();
    fixture.manifest.artifacts = fixture.manifest.artifacts.filter((entry) => entry.role !== "review");
    rmSync(join(fixture.root, "reports", "review.md"));
    rewriteManifest(fixture);
    const resultCodes = codes(validate(fixture, registration));
    assert(resultCodes.has("INCOMPLETE_RELEASE_MATRIX"));
    assert(resultCodes.has("REQUIRED_ARTIFACT_ROLE_MISSING"));
  }, { status: "VERIFIED", cellCount: 3 });

  withFixture(({ registration, fixture }) => {
    fixture.manifest.releaseStatus = "PREREGISTERED";
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("PREREGISTERED_RELEASE_HAS_CELLS"));
  });
});

test("unexpected negative verdict remains publishable, but expected verdict cannot be rewritten", () => {
  withFixture(({ registration, fixture }) => {
    fixture.manifest.cells[0].verdict = "blocked";
    rewriteManifest(fixture);
    assert.deepEqual(validate(fixture, registration).errors, []);
    fixture.manifest.cells[0].expectedVerdict = "blocked";
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("CELL_EXPECTATION_MISMATCH"));
  });
});

test("VERIFIED rejects indeterminate or unresolved cells while PILOT preserves them explicitly", () => {
  withFixture(({ registration, fixture }) => {
    Object.assign(fixture.manifest.cells[0], {
      status: "indeterminate",
      verdict: "indeterminate",
      resolution: { state: "unresolved", detail: "Cancellation prevented oracle observation." }
    });
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("NONTERMINAL_RELEASE_CELL"));
  });
  withFixture(({ registration, fixture }) => {
    Object.assign(fixture.manifest.cells[0], {
      status: "indeterminate",
      verdict: "indeterminate",
      resolution: { state: "unresolved", detail: "Cancellation prevented oracle observation." }
    });
    rewritePilotSummaryCell(fixture, "cell-1", {
      status: "indeterminate",
      verdict: "indeterminate",
      reason: "cancellation"
    });
    assert.deepEqual(validate(fixture, registration).errors, []);
  }, { status: "PILOT" });
});

test("PILOT preserves a failed cell whose workload ran but oracle never started", () => {
  withFixture(({ registration, fixture }) => {
    const cell = fixture.manifest.cells[0];
    const restartPath = cell.restartReceiptArtifactPath;
    Object.assign(cell, {
      status: "failed",
      verdict: "indeterminate",
      restartReceiptArtifactPath: null,
      rawArtifactPaths: [cell.rawLedgerArtifactPath],
      resolution: { state: "unresolved", detail: "The workload ran, but no restart oracle verdict exists." }
    });
    fixture.manifest.artifacts = fixture.manifest.artifacts.filter((entry) => entry.path !== restartPath);
    rmSync(join(fixture.root, restartPath));
    rewritePilotSummaryCell(fixture, "cell-1", {
      status: "failed",
      verdict: null,
      reason: "oracle-process-did-not-start"
    });
    assert.deepEqual(validate(fixture, registration).errors, []);
  }, { status: "PILOT", cellCount: 2, executedIds: ["cell-1"] });
});

test("PILOT preserves a pre-spawn failure with null bindings and empty or global raw paths", () => {
  withFixture(({ registration, fixture }) => {
    const cell = fixture.manifest.cells[0];
    const cellArtifacts = [...cell.rawArtifactPaths];
    Object.assign(cell, {
      startedAt: null,
      endedAt: null,
      status: "failed",
      verdict: "indeterminate",
      attemptId: null,
      processInstanceId: null,
      restartReceiptArtifactPath: null,
      rawLedgerArtifactPath: null,
      rawArtifactPaths: [],
      resolution: { state: "unresolved", detail: "The attempt failed before a child process was spawned." }
    });
    fixture.manifest.environment.processes = [];
    fixture.manifest.environment.stores = [];
    for (const path of cellArtifacts) {
      fixture.manifest.artifacts = fixture.manifest.artifacts.filter((entry) => entry.path !== path);
      rmSync(join(fixture.root, path));
    }
    rewritePilotSummaryCell(fixture, "cell-1", {
      status: "failed",
      verdict: null,
      reason: "process-spawn-failed"
    });
    assert.deepEqual(validate(fixture, registration).errors, []);

    cell.rawArtifactPaths = ["raw/run-summary.json"];
    rewriteManifest(fixture);
    assert.deepEqual(validate(fixture, registration).errors, []);
  }, { status: "PILOT", cellCount: 2, executedIds: ["cell-1"] });
});

test("VERIFIED and PUBLISHED reject nullable or incomplete completed-cell bindings", () => {
  for (const status of ["VERIFIED", "PUBLISHED"]) {
    withFixture(({ registration, fixture }) => {
      Object.assign(fixture.manifest.cells[0], {
        startedAt: null,
        endedAt: null,
        attemptId: null,
        processInstanceId: null,
        restartReceiptArtifactPath: null,
        rawLedgerArtifactPath: null,
        rawArtifactPaths: []
      });
      rewriteManifest(fixture);
      const resultCodes = codes(validate(fixture, registration));
      assert(resultCodes.has("COMPLETED_CELL_EVIDENCE_INCOMPLETE"));
      assert(resultCodes.has("NONTERMINAL_RELEASE_CELL"));
    }, { status, releaseId: `incomplete-${status.toLowerCase()}-fixture-v1` });
  }
});

test("protocol semantic gate rejects placeholders, workload-domain drift, and call-count incoherence", () => {
  const registration = createRegistrationRepository();
  try {
    const protocol = JSON.parse(readFileSync(registration.protocolPath, "utf8"));
    protocol.workload.parameterSpace.backend.value = ["TBD"];
    protocol.workload.parameterSpace.concurrency.value = [2];
    protocol.plannedCells[0].parameters.callCount = 2;
    json(registration.protocolPath, protocol);
    const resultCodes = codes(validateBenchmarkProtocol(registration.protocolPath, {
      sourceRepositoryRoot: registration.source
    }));
    assert(resultCodes.has("UNRESOLVED_WORKLOAD_VALUE"));
    assert(resultCodes.has("WORKLOAD_PARAMETER_DOMAIN_MISMATCH"));
    assert(resultCodes.has("CELL_CALL_COUNT_MISMATCH"));
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }
});

test("hostile __proto__ and constructor fields are rejected structurally without a crash", () => {
  const registration = createRegistrationRepository();
  try {
    const protocol = JSON.parse(readFileSync(registration.protocolPath, "utf8"));
    Object.defineProperty(protocol, "__proto__", { enumerable: true, value: { polluted: true } });
    protocol.constructor = { polluted: true };
    json(registration.protocolPath, protocol);
    const result = validateBenchmarkProtocol(registration.protocolPath, {
      sourceRepositoryRoot: registration.source
    });
    assert.equal(result.valid, false);
    assert.equal(result.errors.filter((error) => error.code === "UNKNOWN_FIELD").length, 2);
    assert.equal({}.polluted, undefined);
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }
});

test("malformed manifest is structurally gated and CLI emits exact machine JSON on stderr", () => {
  withFixture(({ registration, fixture }) => {
    fixture.manifest.cells = {};
    rewriteManifest(fixture);
    const expected = {
      schemaVersion: validationSchemaVersion,
      valid: false,
      errors: [{ code: "INVALID_FIELD_TYPE", path: "$.cells", message: "Expected array" }],
      summary: null
    };
    assert.deepEqual(validate(fixture, registration), expected);
    const cli = spawnSync(process.execPath, [
      cliPath,
      "--source-repo",
      registration.source,
      fixture.root
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout, "");
    assert.equal(cli.stderr, `${JSON.stringify(expected, null, 2)}\n`);
  });
});

test("malformed protocol CLI has exact nonzero behavior and no semantic cascade", () => {
  const registration = createRegistrationRepository();
  try {
    const protocol = JSON.parse(readFileSync(registration.protocolPath, "utf8"));
    protocol.plannedCells = {};
    json(registration.protocolPath, protocol);
    const expected = {
      schemaVersion: validationSchemaVersion,
      valid: false,
      errors: [{ code: "INVALID_FIELD_TYPE", path: "$.protocol.plannedCells", message: "Expected array" }],
      summary: null
    };
    const cli = spawnSync(process.execPath, [
      cliPath,
      "--phase",
      "protocol",
      "--source-repo",
      registration.source,
      registration.protocolPath
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout, "");
    assert.equal(cli.stderr, `${JSON.stringify(expected, null, 2)}\n`);
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }
});

test("malformed JSON has a version-independent machine error", () => {
  withFixture(({ registration, fixture }) => {
    writeFileSync(join(fixture.root, "execution-manifest.json"), "{", "utf8");
    const expected = {
      schemaVersion: validationSchemaVersion,
      valid: false,
      errors: [{ code: "INVALID_JSON", path: "$manifest", message: "File is not valid UTF-8 JSON" }],
      summary: null
    };
    assert.deepEqual(validate(fixture, registration), expected);
    const cli = spawnSync(process.execPath, [cliPath, fixture.root], {
      encoding: "utf8",
      windowsHide: true
    });
    assert.equal(cli.status, 1);
    assert.equal(cli.stdout, "");
    assert.equal(cli.stderr, `${JSON.stringify(expected, null, 2)}\n`);
  });
});

test("CLI invalid arguments and missing paths return stable JSON and exit one", () => {
  const invalid = spawnSync(process.execPath, [cliPath, "--phase", "wrong", "x"], {
    encoding: "utf8",
    windowsHide: true
  });
  const invalidExpected = {
    schemaVersion: validationSchemaVersion,
    valid: false,
    errors: [{
      code: "INVALID_ARGUMENT",
      path: "$",
      message: "Usage: validate-benchmark-release.mjs [--phase protocol|release|discover] [--source-repo <git-root>] <path>"
    }],
    summary: null
  };
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.equal(invalid.stderr, `${JSON.stringify(invalidExpected, null, 2)}\n`);

  const missingPath = join(tmpdir(), `missing-benchmark-release-${process.pid}`);
  const missing = spawnSync(process.execPath, [cliPath, missingPath], { encoding: "utf8", windowsHide: true });
  const missingExpected = {
    schemaVersion: validationSchemaVersion,
    valid: false,
    errors: [{ code: "RELEASE_ROOT_MISSING", path: "$", message: "Release root is not a directory" }],
    summary: null
  };
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.equal(missing.stderr, `${JSON.stringify(missingExpected, null, 2)}\n`);
});

test("unlisted files, digest drift, nonimmutable evidence, and unsafe portable paths fail closed", () => {
  withFixture(({ registration, fixture }) => {
    writeFileSync(join(fixture.root, "unlisted.txt"), "unknown\n", "utf8");
    const raw = fixture.manifest.artifacts.find((entry) => entry.role === "raw");
    raw.sha256 = "0".repeat(64);
    raw.bytes += 1;
    raw.immutable = false;
    fixture.manifest.artifacts.push({
      path: "raw/stream:name",
      sha256: "0".repeat(64),
      bytes: 0,
      role: "other",
      immutable: true
    });
    const review = fixture.manifest.artifacts.find((entry) => entry.path === "reports/review.md");
    fixture.manifest.artifacts.push({ ...review, path: "reports/REVIEW.md" });
    rewriteManifest(fixture);
    const resultCodes = codes(validate(fixture, registration));
    for (const code of [
      "UNLISTED_ARTIFACT",
      "ARTIFACT_DIGEST_MISMATCH",
      "ARTIFACT_SIZE_MISMATCH",
      "RAW_ARTIFACT_NOT_IMMUTABLE",
      "RELEASE_ARTIFACT_NOT_IMMUTABLE",
      "UNSAFE_ARTIFACT_PATH",
      "PORTABLE_PATH_COLLISION"
    ]) assert(resultCodes.has(code), code);
  });
});

test("symlink and hardlink artifacts are rejected", (context) => {
  withFixture(({ registration, fixture }) => {
    try {
      symlinkSync("cell-1/ledger.jsonl", join(fixture.root, "raw", "ledger-link.jsonl"));
      symlinkSync("../reports", join(fixture.root, "raw", "reports-link"), "dir");
      symlinkSync(fixture.root, join(registration.base, "release-root-link"), "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS"].includes(error?.code)) return context.skip("Symbolic links unavailable");
      throw error;
    }
    fixture.manifest.artifacts.push({
      path: "raw/reports-link/review.md",
      ...observed(join(fixture.root, "reports", "review.md")),
      role: "other",
      immutable: true
    });
    rewriteManifest(fixture);
    const resultCodes = codes(validate(fixture, registration));
    assert(resultCodes.has("UNSAFE_SYMLINK_PATH"));
    assert(codes(validateBenchmarkRelease(join(registration.base, "release-root-link"), {
      sourceRepositoryRoot: registration.source
    })).has("UNSAFE_SYMLINK_PATH"));
  });

  withFixture(({ registration, fixture }) => {
    try {
      linkSync(join(fixture.root, "raw", "cell-1", "ledger.jsonl"), join(fixture.root, "raw", "ledger-hardlink.jsonl"));
    } catch (error) {
      if (["EPERM", "EACCES", "ENOSYS", "EXDEV"].includes(error?.code)) return context.skip("Hard links unavailable");
      throw error;
    }
    const resultCodes = codes(validate(fixture, registration));
    assert(resultCodes.has("UNSAFE_HARDLINK_PATH"));
    assert(resultCodes.has("UNLISTED_ARTIFACT"));
  });
});

test("concurrent release-tree mutation is detected by artifact or quiescence checks", async () => {
  await withFixture(async ({ registration, fixture }) => {
    const mutator = spawn(process.execPath, [
      "-e",
      "const fs=require('node:fs');const p=process.argv[1];let i=0;fs.writeFileSync(p+'/race-'+i+'.txt','race');i++;process.stdout.write('ready\\n');const t=setInterval(()=>{try{fs.writeFileSync(p+'/race-'+i+'.txt','race');i++}catch{}},1);setTimeout(()=>{clearInterval(t);process.exit(0)},1500)",
      fixture.root
    ], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let result;
    try {
      await once(mutator.stdout, "data");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        result = validate(fixture, registration);
        if (!result.valid) break;
        await new Promise((resolve_) => setTimeout(resolve_, 10));
      }
    } finally {
      mutator.kill();
      if (mutator.exitCode === null) await once(mutator, "exit");
    }
    assert.equal(result.valid, false);
    const resultCodes = codes(result);
    assert(
      resultCodes.has("UNLISTED_ARTIFACT") || resultCodes.has("RELEASE_CHANGED_DURING_VALIDATION"),
      JSON.stringify(result.errors)
    );
  });
});

test("PUBLISHED release fails if any manifest or artifact byte is uncommitted", () => {
  withFixture(({ registration, fixture }) => {
    const ledgerPath = fixture.manifest.cells[0].rawLedgerArtifactPath;
    appendFileSync(join(fixture.root, ledgerPath), "{\"event\":\"post-publication-mutation\"}\n", "utf8");
    refreshArtifact(fixture, ledgerPath);
    const resultCodes = codes(validate(fixture, registration));
    assert(resultCodes.has("PUBLISHED_RELEASE_NOT_COMMITTED"));
    assert(resultCodes.has("PUBLISHED_ARTIFACT_BLOB_MISMATCH"));
  }, { status: "PUBLISHED", releaseId: "dirty-published-fixture-v1" });
});

test("PUBLISHED release cannot claim Git binding outside its source repository", () => {
  withFixture(({ registration, fixture }) => {
    fixture.manifest.releaseStatus = "PUBLISHED";
    fixture.manifest.immutabilityPolicy.externalBinding = "git-commit";
    rewriteManifest(fixture);
    assert(codes(validate(fixture, registration)).has("GIT_REPOSITORY_REQUIRED"));
  });
});

test("discovery validates every nested release root and fails the set when one member is malformed", () => {
  const registration = createRegistrationRepository();
  try {
    const first = createRelease(registration, { releaseId: "discovered-release-a" });
    const second = createRelease(registration, { releaseId: "discovered-release-b" });
    const arguments_ = [
      cliPath,
      "--phase",
      "discover",
      "--source-repo",
      registration.source,
      registration.base
    ];
    const valid = spawnSync(process.execPath, arguments_, { encoding: "utf8", windowsHide: true });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stderr, "");
    const validResult = JSON.parse(valid.stdout);
    assert.equal(validResult.schemaVersion, "benchmark-release-set-validation/v1");
    assert.equal(validResult.valid, true);
    assert.equal(validResult.summary.releaseCount, 2);
    assert.deepEqual(validResult.summary.releases.map((entry) => entry.path), [
      first.root.slice(registration.base.length + 1),
      second.root.slice(registration.base.length + 1)
    ]);

    appendFileSync(join(second.root, "execution-manifest.json"), "not-json\n", "utf8");
    const invalid = spawnSync(process.execPath, arguments_, { encoding: "utf8", windowsHide: true });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, "");
    const invalidResult = JSON.parse(invalid.stderr);
    assert.equal(invalidResult.valid, false);
    assert(codes(invalidResult).has("RELEASE_SET_MEMBER_INVALID"));
    assert.equal(invalidResult.summary.releases.find((entry) => entry.path.endsWith("discovered-release-b"))
      .validation.errors[0].code, "INVALID_JSON");
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }
});

test("discovery locates an HC-CORTEX-002-identified protocol at a nonstandard manifest-declared path, not a hardcoded protocol.json", () => {
  // The real HC-CORTEX-002 pipeline (scripts/hc-cortex-002-seal-lib.mjs) always names its own
  // protocol snapshot "protocol.json" -- that is its own internal contract, not the generic
  // manifest contract's. The generic contract (schemas/execution-manifest-v1.schema.json)
  // only guarantees a `protocol.path` field pointing SOMEWHERE inside the release; the fixture
  // here deliberately registers it at a nested, nonstandard path to prove
  // withIssueSpecificVerification derives the location from that manifest field, the way
  // it now does after the protocol.json-hardcoding fix, rather than assuming the literal name.
  const registration = createRegistrationRepository({
    protocolId: "2026-08-30-hc-cortex-002-v1",
    protocolArtifactPath: "protocols/nested/hc-cortex-002-snapshot.json"
  });
  try {
    const release = createRelease(registration, { releaseId: "hc-cortex-002-nonstandard-path" });
    const expectedReleasePath = release.root.slice(registration.base.length + 1);
    const arguments_ = [cliPath, "--phase", "discover", "--source-repo", registration.source, registration.base];
    const execution = spawnSync(process.execPath, arguments_, { encoding: "utf8", windowsHide: true });
    // This fixture is a generic-shaped release, not real HC-CORTEX-002 raw evidence, so
    // verifyHcCortex002Release must still reject it on the evidentiary merits -- proving
    // discovery is not merely made permissive. The regression under test is specifically
    // that this rejection happens for the RIGHT reason (found the protocol, dispatched to
    // the HC-CORTEX-002 verifier, which then correctly found the evidence wanting) and not
    // the WRONG reason (protocol.json missing at the release root, a plumbing failure).
    assert.equal(execution.status, 1, execution.stdout);
    const result = JSON.parse(execution.stderr);
    assert.equal(result.valid, false);
    const releaseEntry = result.summary.releases.find((entry) => entry.path === expectedReleasePath);
    assert(releaseEntry, JSON.stringify(result.summary.releases));
    assert.equal(releaseEntry.validation.valid, true, JSON.stringify(releaseEntry.validation.errors));
    const resultCodes = codes(result);
    assert(resultCodes.has("HC_CORTEX_002_DERIVED_EVIDENCE_INVALID"), JSON.stringify(result.errors));
    assert(!resultCodes.has("ISSUE_SPECIFIC_VERIFICATION_FAILED"), JSON.stringify(result.errors));
    assert.deepEqual(result.summary.issueSpecificVerification.hcCortex002, []);
  } finally {
    rmSync(registration.base, { recursive: true, force: true });
  }
});
