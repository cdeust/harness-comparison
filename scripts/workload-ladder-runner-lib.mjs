import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  statfsSync,
  writeSync
} from "node:fs";
import { arch, cpus, freemem, loadavg, platform, release, totalmem, uptime } from "node:os";
import { basename, dirname, isAbsolute, join, parse, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchmarkProtocol } from "./benchmark-release-lib.mjs";
import { statusPostgresReference } from "./hc-cortex-002-postgresql-lib.mjs";

const repositoryRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const adapterInterface = "hc-cortex-002/v1";
const parameterNames = [
  "backend",
  "callCount",
  "callRate",
  "concurrency",
  "duration",
  "faultIds",
  "operationsPerType",
  "phase",
  "repetition",
  "sourceId",
  "warmCold"
].sort();
const shaPattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const safeIdentifierPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const codeUnitCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class LadderRunnerError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "LadderRunnerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new LadderRunnerError(code, message, details);
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function rejectSymlinkComponents(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let cursor = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) {
      fail("UNSAFE_SYMLINK_PATH", `Path traverses a symbolic link: ${path}`);
    }
  }
}

function rejectSymlinkParents(path) {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  rejectSymlinkComponents(parent);
}

function hashFile(path) {
  rejectSymlinkComponents(path);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) fail("NOT_REGULAR_FILE", `${path} is not a regular file`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs
    ) {
      fail("FILE_CHANGED_DURING_READ", `${path} changed while it was read`);
    }
    return { bytes, sha256: hashBytes(bytes), size: Number(before.size) };
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusiveBytes(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeExclusiveJson(path, value) {
  writeExclusiveBytes(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeExclusiveJsonLines(path, values) {
  writeExclusiveBytes(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

// See portablePath()'s comment below: git-reported and Node-realpathSync'd paths to the
// identical directory can disagree in segment casing on Windows. Every "is this git root the
// same directory as that Node-resolved root" check must tolerate that, or it fails closed
// with a false root-mismatch error on an otherwise-correct Windows checkout.
function sameHostPath(left, right) {
  if (left === right) return true;
  return process.platform === "win32" && typeof left === "string" && typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase();
}

function portablePath(root, absolutePath) {
  // Windows filesystems are case-insensitive, and git's own path reporting (e.g.
  // `git rev-parse --show-toplevel`) can disagree in segment casing with Node's independent
  // realpathSync of the identical on-disk directory -- observed directly on GitHub Actions
  // windows-latest, where this produced a spurious ".." climb (UNSAFE_ARTIFACT_PATH,
  // "dot-segment") even after separator normalization alone. Find the longest common
  // path-segment prefix comparing case-insensitively on win32 (case-sensitively elsewhere,
  // where this is a no-op), then return the remaining segments using their ORIGINAL casing
  // from absolutePath -- never lowercased in the result. If root is not actually a
  // (case-insensitive) prefix of absolutePath, fall back to a plain POSIX-relative
  // computation, which correctly yields an escaping/unsafe path for a genuine mismatch.
  const rootSegments = root.split(sep).filter(Boolean);
  const pathSegments = absolutePath.split(sep).filter(Boolean);
  const caseFold = process.platform === "win32" ? (value) => value.toLowerCase() : (value) => value;
  let common = 0;
  while (
    common < rootSegments.length && common < pathSegments.length &&
    caseFold(rootSegments[common]) === caseFold(pathSegments[common])
  ) common += 1;
  if (common !== rootSegments.length) {
    return posix.relative(root.split(sep).join("/"), absolutePath.split(sep).join("/"));
  }
  return pathSegments.slice(common).join("/");
}

function normalizedRelativePath(value) {
  if (
    typeof value !== "string" || value.length === 0 || value.includes("\\") ||
    value.includes("\0") || isAbsolute(value) || win32.isAbsolute(value)
  ) return false;
  const segments = value.split("/");
  return !segments.some((entry) => entry === "" || entry === "." || entry === "..") &&
    posix.normalize(value) === value;
}

function repositoryFile(path, registration) {
  if (!normalizedRelativePath(path)) {
    fail("UNSAFE_ADAPTER_PATH", "Adapter path must be normalized and repository-relative");
  }
  let cursor = repositoryRoot;
  for (const segment of path.split("/")) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) fail("ADAPTER_MISSING", `Adapter does not exist: ${path}`);
    if (lstatSync(cursor).isSymbolicLink()) {
      fail("UNSAFE_ADAPTER_PATH", `Adapter path traverses a symbolic link: ${path}`);
    }
  }
  if (!lstatSync(cursor).isFile()) fail("ADAPTER_NOT_REGULAR", `Adapter is not a regular file: ${path}`);
  boundGitFile(cursor, registration);
  const tree = hashTree(dirname(cursor), registration);
  return { path: cursor, sha256: hashFile(cursor).sha256, treeRoot: dirname(cursor), ...tree };
}

function hashTree(root, registration) {
  rejectSymlinkComponents(root);
  const treePath = portablePath(registration.root, root);
  const output = gitRaw(registration.root, ["ls-tree", "-r", "--name-only", "-z", registration.revision, "--", treePath]);
  const names = output.toString("utf8").split("\0").filter(Boolean).sort(codeUnitCompare);
  const files = names.map((name) => boundGitFile(join(registration.root, ...name.split("/")), registration));
  if (files.length === 0) fail("EMPTY_BOUND_TREE", `No files are bound under ${root}`);
  const canonical = files.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n");
  return { treeSha256: hashBytes(Buffer.from(canonical, "utf8")), treeFiles: files };
}

function runnerInputs(registration) {
  const paths = [
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
  const files = paths.map((path) => boundGitFile(join(repositoryRoot, path), registration));
  const canonical = files.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n");
  return { sha256: hashBytes(Buffer.from(canonical, "utf8")), files };
}

function stableProtocolRead(protocolPath) {
  const absolute = resolve(protocolPath);
  const inspection = loadBenchmarkProtocol(absolute);
  if (!inspection.validation.valid) {
    fail("INVALID_PROTOCOL", "Protocol validation or Git registration failed", inspection.validation.errors);
  }
  return {
    absolute,
    protocol: inspection.protocol,
    bytes: inspection.bytes,
    sha256: inspection.sha256,
    sourceRegistration: inspection.sourceRegistration
  };
}

function parseBindings(values, label) {
  const result = new Map();
  for (const value of values ?? []) {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
      fail("INVALID_BINDING", `${label} must use a non-empty id=value binding`);
    }
    const id = value.slice(0, separator);
    const binding = value.slice(separator + 1);
    if (result.has(id)) fail("DUPLICATE_BINDING", `${label} was supplied twice for ${id}`);
    result.set(id, binding);
  }
  return result;
}

// Git's own stderr routinely echoes back the invocation's cwd/path arguments verbatim
// (e.g. "fatal: cannot change to '<path>': No such file or directory"), so it is never
// forwarded in details -- only the OS-level error code / exit status / signal, mirroring
// gitFailure()'s existing safe summary pattern in benchmark-release-lib.mjs. subcommand is
// the git subcommand only (e.g. "rev-parse", "status"), never the full argument vector,
// which can itself carry a path in some call sites.
function gitFailureDetails(subcommand, result) {
  return { subcommand, status: result.status, signal: result.signal, errorCode: result.error?.code ?? null };
}

function git(checkout, arguments_) {
  const result = spawnSync("git", ["-C", checkout, ...arguments_], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail("GIT_INSPECTION_FAILED", `Git inspection failed for ${checkout}`, gitFailureDetails(arguments_[0], result));
  }
  return result.stdout.trim();
}

function gitRaw(checkout, arguments_) {
  const result = spawnSync("git", ["-C", checkout, ...arguments_], { maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0 || result.signal) {
    fail("GIT_INSPECTION_FAILED", `Git inspection failed for ${checkout}`, gitFailureDetails(arguments_[0], result));
  }
  return result.stdout;
}

function harnessRegistration(protocolPath, sourceRegistration) {
  const root = realpathSync(git(dirname(protocolPath), ["rev-parse", "--show-toplevel"]));
  if (!sameHostPath(root, repositoryRoot)) fail("HARNESS_ROOT_MISMATCH", "Protocol and workload runner are not in one registered checkout");
  const revision = git(root, ["rev-parse", "HEAD"]);
  if (revision !== sourceRegistration?.revision) {
    fail("HARNESS_REVISION_MISMATCH", "Protocol registration and runner checkout revisions differ");
  }
  const dirty = git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]);
  if (dirty !== "") fail("HARNESS_CHECKOUT_DIRTY", "Harness checkout is not clean at its registered revision");
  return { root, revision, protocolPath: sourceRegistration.path };
}

function boundGitFile(path, registration) {
  rejectSymlinkComponents(path);
  const relativePath = portablePath(registration.root, resolve(path));
  if (!normalizedRelativePath(relativePath)) fail("UNREGISTERED_BOUND_FILE", "Bound file is outside the harness checkout");
  git(registration.root, ["ls-files", "--error-unmatch", "--", relativePath]);
  const blob = git(registration.root, ["rev-parse", `${registration.revision}:${relativePath}`]);
  const registeredBytes = gitRaw(registration.root, ["show", `${registration.revision}:${relativePath}`]);
  const observed = hashFile(path);
  if (!registeredBytes.equals(observed.bytes)) {
    fail("REGISTERED_FILE_MISMATCH", `Working file differs from registered blob: ${relativePath}`);
  }
  return { path: relativePath, gitBlob: blob, sha256: observed.sha256, bytes: observed.size };
}

function verifyHarnessRegistration(registration, allowedOutput = null) {
  if (git(registration.root, ["rev-parse", "HEAD"]) !== registration.revision) {
    fail("HARNESS_REVISION_CHANGED", "Harness HEAD changed after plan creation");
  }
  const arguments_ = ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"];
  if (allowedOutput) {
    const outputPath = portablePath(registration.root, allowedOutput);
    if (normalizedRelativePath(outputPath)) {
      arguments_.push("--", ".", `:(exclude)${outputPath}`, `:(exclude)${outputPath}/**`);
    }
  }
  const dirty = git(registration.root, arguments_);
  if (dirty !== "") fail("HARNESS_CHECKOUT_DIRTY", "Harness checkout changed after plan creation");
}

function inspectCheckout(requestedPath, revision) {
  const checkout = realpathSync(resolve(requestedPath));
  if (!lstatSync(checkout).isDirectory()) fail("SOURCE_NOT_DIRECTORY", `${requestedPath} is not a directory`);
  const head = git(checkout, ["rev-parse", "HEAD"]);
  if (!shaPattern.test(head) || !shaPattern.test(revision) || head !== revision) {
    fail("SOURCE_REVISION_MISMATCH", `Checkout HEAD does not match declared revision ${revision}`, { head });
  }
  const objectType = git(checkout, ["cat-file", "-t", revision]);
  if (objectType !== "commit") fail("SOURCE_REVISION_NOT_COMMIT", `${revision} is not a commit`);
  const dirty = git(checkout, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"]);
  if (dirty !== "") fail("SOURCE_CHECKOUT_DIRTY", `Checkout is dirty: ${checkout}`, { dirtyPaths: dirty.split("\n") });
  const locks = [];
  for (const lockPath of ["pyproject.toml", "uv.lock"]) {
    const listed = gitRaw(checkout, ["ls-tree", "--name-only", "-z", revision, "--", lockPath]);
    if (listed.length === 0) continue;
    const bytes = gitRaw(checkout, ["show", `${revision}:${lockPath}`]);
    if (!hashFile(join(checkout, lockPath)).bytes.equals(bytes)) {
      fail("SOURCE_LOCK_MISMATCH", `Tracked environment lock differs from ${revision}: ${lockPath}`);
    }
    locks.push({ path: lockPath, sha256: hashBytes(bytes), bytes: bytes.length });
  }
  const sourceFiles = [];
  for (const sourcePath of ["mcp_server/__init__.py"]) {
    const listed = gitRaw(checkout, ["ls-tree", "--name-only", "-z", revision, "--", sourcePath]);
    if (listed.length === 0) continue;
    const bytes = gitRaw(checkout, ["show", `${revision}:${sourcePath}`]);
    if (!hashFile(join(checkout, sourcePath)).bytes.equals(bytes)) {
      fail("SOURCE_FILE_MISMATCH", `Tracked source file differs from ${revision}: ${sourcePath}`);
    }
    sourceFiles.push({ path: sourcePath, sha256: hashBytes(bytes), bytes: bytes.length });
  }
  return {
    path: checkout,
    revision,
    checkoutIdentitySha256: hashBytes(Buffer.from(checkout, "utf8")),
    locks,
    sourceFiles
  };
}

function pythonEnvironmentProbe(path) {
  const code = [
    "import hashlib, importlib.metadata, json, platform, re, sqlite3, sys",
    "packages=[]",
    "for d in importlib.metadata.distributions():",
    " n=d.metadata.get('Name')",
    " if n: packages.append({'name':re.sub(r'[-_.]+','-',n).lower(),'version':d.version})",
    "packages.sort(key=lambda x:(x['name'],x['version']))",
    "compile_options=sorted(r[0] for r in sqlite3.connect(':memory:').execute('pragma compile_options'))",
    "psycopg_info=None",
    "try:",
    " import psycopg, psycopg.pq",
    " psycopg_info={'version':psycopg.__version__,'libpq_version':psycopg.pq.version(),'implementation':psycopg.pq.__impl__}",
    "except ImportError: pass",
    "value={'python':{'implementation':platform.python_implementation(),'version':platform.python_version()},'sqlite':{'module_version':sqlite3.version,'library_version':sqlite3.sqlite_version,'compile_options':compile_options},'psycopg':psycopg_info,'distributions':packages}",
    "print(json.dumps(value,sort_keys=True,separators=(',',':')))"
  ].join("\n");
  const result = spawnSync(path, ["-I", "-c", code], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0 || result.signal) {
    fail("RUNTIME_ENVIRONMENT_PROBE_FAILED", "Python dependency and native-library inventory failed");
  }
  try {
    const value = JSON.parse(result.stdout.trim());
    const canonical = JSON.stringify(value);
    return { schemaVersion: "python-runtime-environment/v1", sha256: hashBytes(Buffer.from(canonical)), ...value };
  } catch {
    fail("RUNTIME_ENVIRONMENT_PROBE_FAILED", "Python environment probe returned invalid JSON");
  }
}

function inspectRuntime(requestedPath, runtimeId) {
  const path = resolve(requestedPath);
  rejectSymlinkParents(path);
  const requestedStatus = lstatSync(path);
  const target = realpathSync(path);
  const targetStatus = statSync(target);
  if ((!requestedStatus.isFile() && !requestedStatus.isSymbolicLink()) || !targetStatus.isFile()) {
    fail("RUNTIME_NOT_REGULAR", `${requestedPath} is not a regular file or terminal executable link`);
  }
  if (platform() !== "win32") accessSync(path, constants.X_OK);
  const versionResult = spawnSync(path, ["--version"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (versionResult.error || versionResult.status !== 0 || versionResult.signal) {
    fail("RUNTIME_VERSION_FAILED", `Runtime version probe failed for ${requestedPath}`);
  }
  let environmentIdentity = { schemaVersion: "generic-runtime-environment/v1", sha256: null };
  let virtualEnvironment = null;
  if (runtimeId === "python-3.12") {
    const pyvenvPath = join(dirname(dirname(path)), "pyvenv.cfg");
    let pyvenv;
    try {
      pyvenv = hashFile(pyvenvPath);
    } catch {
      fail("PYTHON_VIRTUAL_ENVIRONMENT_UNBOUND", "The Python runtime must belong to a bound virtual environment");
    }
    virtualEnvironment = {
      pyvenvCfgSha256: pyvenv.sha256,
      pyvenvCfgBytes: pyvenv.size,
      invocationIdentitySha256: hashBytes(Buffer.from(path, "utf8")),
      targetSha256: hashFile(target).sha256
    };
    environmentIdentity = pythonEnvironmentProbe(path);
    if (!/^3\.12(?:\.|$)/u.test(environmentIdentity.python?.version ?? "")) {
      fail("PYTHON_RUNTIME_VERSION_MISMATCH", "The python-3.12 binding does not execute Python 3.12");
    }
  }
  return {
    path,
    sha256: hashFile(target).sha256,
    version: `${versionResult.stdout ?? ""}${versionResult.stderr ?? ""}`.trim(),
    environmentIdentity,
    virtualEnvironment
  };
}

function exactKeys(value, expected) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function utcTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function validateCellParameters(parameters, protocol, cellId) {
  if (!exactKeys(parameters, parameterNames)) {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} does not have the exact HC-CORTEX-002 parameter set`);
  }
  if (!positiveInteger(parameters.concurrency) || !positiveInteger(parameters.operationsPerType) ||
      !Number.isSafeInteger(parameters.repetition) || parameters.repetition < 0) {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} has an invalid integer workload parameter`);
  }
  if (parameters.backend !== "sqlite" && parameters.backend !== "postgresql") {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} has an unsupported backend`);
  }
  if (typeof parameters.sourceId !== "string" || parameters.sourceId.length === 0 ||
      typeof parameters.phase !== "string" || parameters.phase.length === 0) {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} has an unresolved source or phase`);
  }
  if (parameters.callCount !== parameters.operationsPerType || parameters.callRate !== "closed-loop" ||
      parameters.duration !== null || parameters.warmCold !== "cold") {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} contradicts the preregistered closed-loop cold-cell contract`);
  }
  if ((parameters.repetition === 0) !== (parameters.phase === "regression") ||
      (parameters.repetition > 0) !== (parameters.phase === "main")) {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} phase and repetition do not identify the same study stratum`);
  }
  const declaredFaults = (protocol.workload?.faultSchedule ?? []).map((entry) => entry.id).sort();
  const cellFaults = Array.isArray(parameters.faultIds) ? [...parameters.faultIds].sort() : [];
  if (new Set(cellFaults).size !== cellFaults.length || JSON.stringify(cellFaults) !== JSON.stringify(declaredFaults)) {
    fail("CELL_PARAMETER_CONTRACT", `${cellId} does not include exactly the declared fault schedule`);
  }
}

function declaredRevision(protocol, cell) {
  const sourceId = cell.parameters.sourceId;
  const corpus = protocol.corpora.find((entry) => entry.id === sourceId);
  if (!corpus || corpus.dirty !== false || !shaPattern.test(corpus.revision)) {
    fail("SOURCE_REVISION_UNRESOLVED", `${cell.id} sourceId does not resolve to a clean, exact corpus revision`);
  }
  return corpus.revision;
}

function selectCells(protocol, cellId) {
  const byId = new Map(protocol.plannedCells.map((cell) => [cell.id, cell]));
  const ordered = protocol.workload.cellOrder.map((id) => byId.get(id));
  if (ordered.some((cell) => !cell)) fail("UNRESOLVED_CELL", "Cell order contains an unknown cell");
  if (!cellId) return ordered;
  const selected = byId.get(cellId);
  if (!selected) fail("UNKNOWN_CELL", `Unknown cell: ${cellId}`);
  return [selected];
}

function protocolCellUniverse(plan) {
  const byId = new Map(plan._protocol.plannedCells.map((cell) => [cell.id, cell]));
  return plan._protocol.workload.cellOrder.map((id, index) => ({
    id,
    ordinal: index + 1,
    expectedVerdict: byId.get(id).expectedVerdict
  }));
}

function preflightReleaseRoot(requestedRoot) {
  const absolute = resolve(requestedRoot);
  if (existsSync(absolute)) fail("RELEASE_ALREADY_EXISTS", `Release root already exists: ${absolute}`);
  const parent = dirname(absolute);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory()) {
    fail("RELEASE_PARENT_MISSING", `Release parent does not exist: ${parent}`);
  }
  return join(realpathSync(parent), basename(absolute));
}

function redactDatabase(value, expectedPort) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("POSTGRESQL_DATABASE_INVALID", "PostgreSQL database bindings must be absolute connection URLs");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    fail("POSTGRESQL_DATABASE_INVALID", "PostgreSQL database binding has an unsupported URL scheme");
  }
  if (parsed.password !== "" || parsed.hash !== "") {
    fail("POSTGRESQL_DATABASE_SECRET", "PostgreSQL benchmark URLs must not contain passwords or fragments");
  }
  const permittedParameters = new Set(["host", "port", "sslmode"]);
  if ([...parsed.searchParams.keys()].some((name) => !permittedParameters.has(name))) {
    fail("POSTGRESQL_DATABASE_SECRET", "PostgreSQL benchmark URLs may contain only host, port, and sslmode parameters");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const host = parsed.hostname || parsed.searchParams.get("host");
  if (!host || !database) {
    fail("POSTGRESQL_DATABASE_INVALID", "PostgreSQL database binding must identify a host and database");
  }
  if (parsed.hostname !== "" || !isAbsolute(host)) {
    fail("POSTGRESQL_DATABASE_NOT_LOCAL", "PostgreSQL reference bindings must use an absolute private Unix socket directory");
  }
  if ([...permittedParameters].some((name) => parsed.searchParams.getAll(name).length !== 1) || parsed.port !== "") {
    fail("POSTGRESQL_DATABASE_IDENTITY_AMBIGUOUS", "PostgreSQL benchmark URLs require exactly one host, port, and sslmode parameter");
  }
  if (parsed.username !== "" || parsed.searchParams.get("sslmode") !== "disable") {
    fail("POSTGRESQL_DATABASE_IDENTITY_AMBIGUOUS", "PostgreSQL benchmark URLs must omit user identity and set sslmode=disable");
  }
  let socketRoot;
  let socketStatus;
  try {
    rejectSymlinkComponents(host);
    socketRoot = realpathSync(host);
    socketStatus = statSync(socketRoot);
  } catch {
    fail("POSTGRESQL_SOCKET_UNAVAILABLE", "PostgreSQL Unix socket directory is unavailable or traverses a symbolic link");
  }
  if (!socketStatus.isDirectory() || (platform() !== "win32" && (socketStatus.mode & 0o777) !== 0o700) ||
      (typeof process.getuid === "function" && socketStatus.uid !== process.getuid())) {
    fail("POSTGRESQL_SOCKET_NOT_PRIVATE", "PostgreSQL Unix socket directory must be owner-controlled with mode 0700");
  }
  const port = parsed.searchParams.get("port");
  if (String(expectedPort) !== port) {
    fail("POSTGRESQL_PORT_MISMATCH", "PostgreSQL binding port must equal the preregistered Unix socket suffix");
  }
  const identity = `${socketRoot}:${port}/${database}`;
  return {
    databaseIdentitySha256: hashBytes(Buffer.from(identity, "utf8")),
    redacted: true
  };
}

function parsePostgresqlServiceReceipt(path, protocol, protocolSha256, databaseBindings, expectedPort) {
  const observed = hashFile(resolve(path));
  let receipt;
  try {
    receipt = JSON.parse(observed.bytes.toString("utf8"));
  } catch {
    fail("POSTGRESQL_SERVICE_RECEIPT_INVALID", "PostgreSQL service receipt must be one JSON object");
  }
  if (!exactKeys(receipt, [
    "cells", "configuration", "hostAuthentication", "postgresVersion", "processId", "protocolId",
    "protocolSha256", "schemaVersion", "serviceInstanceId", "startedAt"
  ].sort()) || receipt.schemaVersion !== "hc-cortex-002-postgresql-service-receipt/v1" ||
      receipt.protocolId !== protocol.protocolId || receipt.protocolSha256 !== protocolSha256 ||
      typeof receipt.serviceInstanceId !== "string" || !safeIdentifierPattern.test(receipt.serviceInstanceId) ||
      !utcTimestamp(receipt.startedAt) || typeof receipt.postgresVersion !== "string" ||
      receipt.postgresVersion.length === 0 || !positiveInteger(receipt.processId)) {
    fail("POSTGRESQL_SERVICE_RECEIPT_INVALID", "PostgreSQL service receipt identity or protocol binding is invalid");
  }
  const configuration = receipt.configuration;
  if (!exactKeys(configuration, [
    "connectedViaUnixSocket", "listenAddresses", "port", "serverInetAddress", "socketDirectoryIdentitySha256",
    "socketDirectoryMode", "socketDirectoryOwnerMatchesProcessUser", "socketOwnerMatchesProcessUser", "unixSocketMode"
  ].sort()) || configuration.listenAddresses !== "" || configuration.unixSocketMode !== "0700" ||
      configuration.socketDirectoryMode !== "0700" ||
      !sha256Pattern.test(configuration.socketDirectoryIdentitySha256 ?? "") ||
      configuration.socketDirectoryOwnerMatchesProcessUser !== true ||
      configuration.socketOwnerMatchesProcessUser !== true || configuration.port !== expectedPort ||
      configuration.connectedViaUnixSocket !== true || configuration.serverInetAddress !== null) {
    fail("POSTGRESQL_SERVICE_CONFIGURATION_INVALID", "PostgreSQL receipt contradicts the Unix-socket-only policy");
  }
  const authentication = receipt.hostAuthentication;
  if (!exactKeys(authentication, [
    "hostRuleMethods", "localRuleMethods", "parseErrorCount", "passwordMaterialRecorded"
  ].sort()) || JSON.stringify(authentication.localRuleMethods) !== JSON.stringify(["trust"]) ||
      JSON.stringify(authentication.hostRuleMethods) !== JSON.stringify(["reject"]) ||
      authentication.parseErrorCount !== 0 || authentication.passwordMaterialRecorded !== false) {
    fail("POSTGRESQL_SERVICE_AUTHENTICATION_INVALID", "PostgreSQL receipt contradicts the registered access rules");
  }
  const byId = new Map(protocol.plannedCells.map((cell) => [cell.id, cell]));
  const postgresqlCells = protocol.workload.cellOrder
    .map((id) => byId.get(id))
    .filter((cell) => cell?.parameters?.backend === "postgresql");
  if (!Array.isArray(receipt.cells) || receipt.cells.length !== postgresqlCells.length) {
    fail("POSTGRESQL_SERVICE_CELL_SET_INVALID", "PostgreSQL receipt must cover the full preregistered matrix");
  }
  const identities = new Set();
  for (const [index, serviceCell] of receipt.cells.entries()) {
    if (!exactKeys(serviceCell, ["cellId", "createdFrom", "databaseIdentitySha256", "fresh"].sort()) ||
        serviceCell.cellId !== postgresqlCells[index].id || serviceCell.createdFrom !== "template0" ||
        serviceCell.fresh !== true || !sha256Pattern.test(serviceCell.databaseIdentitySha256 ?? "") ||
        identities.has(serviceCell.databaseIdentitySha256)) {
      fail("POSTGRESQL_SERVICE_CELL_SET_INVALID", "PostgreSQL receipt matrix, order, or database identity is invalid");
    }
    identities.add(serviceCell.databaseIdentitySha256);
    if (databaseBindings.has(serviceCell.cellId)) {
      const binding = redactDatabase(databaseBindings.get(serviceCell.cellId), expectedPort);
      if (binding.databaseIdentitySha256 !== serviceCell.databaseIdentitySha256) {
        fail("POSTGRESQL_SERVICE_CELL_BINDING_INVALID", `Database binding contradicts the receipt for ${serviceCell.cellId}`);
      }
    }
  }
  return {
    path: resolve(path),
    serviceRoot: dirname(resolve(path)),
    bytes: observed.bytes,
    sha256: observed.sha256,
    size: observed.size,
    schemaVersion: receipt.schemaVersion,
    protocolId: receipt.protocolId,
    protocolSha256: receipt.protocolSha256,
    serviceInstanceId: receipt.serviceInstanceId,
    startedAt: receipt.startedAt,
    processId: receipt.processId
  };
}

function verifyPrivatePostgresqlService(receipt) {
  if (!receipt) return;
  let rootStatus;
  let state;
  let postmasterPid;
  try {
    rejectSymlinkComponents(receipt.serviceRoot);
    rootStatus = statSync(receipt.serviceRoot);
    const statePath = join(receipt.serviceRoot, "provisioner-state.json");
    const stateStatus = lstatSync(statePath);
    if (!stateStatus.isFile() || stateStatus.isSymbolicLink() || stateStatus.nlink !== 1) throw new Error("state");
    state = JSON.parse(hashFile(statePath).bytes.toString("utf8"));
    const pidPath = join(receipt.serviceRoot, "cluster", "postmaster.pid");
    const pidStatus = lstatSync(pidPath);
    if (!pidStatus.isFile() || pidStatus.isSymbolicLink() || pidStatus.nlink !== 1) throw new Error("pid");
    postmasterPid = hashFile(pidPath).bytes.toString("utf8").split("\n", 1)[0];
  } catch {
    fail("POSTGRESQL_SERVICE_PRIVATE_STATE_INVALID", "PostgreSQL private service state is unavailable or unsafe");
  }
  if (!rootStatus.isDirectory() || (platform() !== "win32" && (rootStatus.mode & 0o777) !== 0o700) ||
      (typeof process.getuid === "function" && rootStatus.uid !== process.getuid()) ||
      state?.schemaVersion !== "hc-cortex-002-postgresql-state/v1" || state.status !== "ready" ||
      state.protocol?.id !== receipt.protocolId || state.protocol?.sha256 !== receipt.protocolSha256 ||
      state.serviceInstanceId !== receipt.serviceInstanceId || state.startedAt !== receipt.startedAt ||
      state.pid !== receipt.processId || postmasterPid !== String(receipt.processId)) {
    fail("POSTGRESQL_SERVICE_PRIVATE_STATE_INVALID", "PostgreSQL private service state contradicts its immutable receipt");
  }
  try {
    process.kill(receipt.processId, 0);
  } catch {
    fail("POSTGRESQL_SERVICE_NOT_RUNNING", "PostgreSQL receipt process is not running");
  }
}

function verifyLivePostgresqlService(receipt) {
  if (!receipt) return;
  let observed;
  try {
    observed = statusPostgresReference({ root: receipt.serviceRoot });
  } catch {
    fail("POSTGRESQL_SERVICE_LIVE_VERIFICATION_FAILED", "PostgreSQL live service verification failed");
  }
  if (observed.status !== "running" || observed.isolationConfigurationVerified !== true ||
      observed.serviceInstanceId !== receipt.serviceInstanceId || observed.processId !== receipt.processId ||
      observed.startedAt !== receipt.startedAt) {
    fail("POSTGRESQL_SERVICE_LIVE_IDENTITY_MISMATCH", "PostgreSQL live service contradicts its immutable receipt");
  }
}

export function buildWorkloadPlan(options) {
  const snapshot = stableProtocolRead(options.protocol);
  const registration = harnessRegistration(snapshot.absolute, snapshot.sourceRegistration);
  const releaseRoot = preflightReleaseRoot(options.releaseRoot);
  const sourceBindings = parseBindings(options.sources, "--source");
  const runtimeBindings = parseBindings(options.runtimes, "--runtime");
  const databaseBindings = parseBindings(options.databases, "--database");
  const postgresPort = snapshot.protocol.resourcePolicy?.limits?.postgresqlSocketPort?.value;
  if (!Number.isSafeInteger(postgresPort) || postgresPort < 1) {
    fail("POSTGRESQL_PORT_UNRESOLVED", "Protocol does not declare a positive PostgreSQL Unix socket port");
  }
  const cells = selectCells(snapshot.protocol, options.cell);
  const adapters = new Map(snapshot.protocol.adapters.map((entry) => [entry.id, entry]));
  const inspectedAdapters = new Map();
  const inspectedSources = new Map();
  const inspectedRuntimes = new Map();
  const planned = [];

  for (const cell of cells) {
    validateCellParameters(cell.parameters, snapshot.protocol, cell.id);
    if (cell.expectedVerdict !== "proven" && cell.expectedVerdict !== "blocked") {
      fail("CELL_EXPECTED_VERDICT_MISSING", `${cell.id} has no preregistered expected verdict`);
    }
    const adapter = adapters.get(cell.adapterId);
    if (!adapter || adapter.interface !== adapterInterface) {
      fail("UNSUPPORTED_ADAPTER", `${cell.id} does not resolve to ${adapterInterface}`);
    }
    if (!inspectedAdapters.has(adapter.id)) {
      inspectedAdapters.set(adapter.id, { ...adapter, ...repositoryFile(adapter.path, registration) });
    }
    const sourceId = cell.parameters.sourceId;
    const revision = declaredRevision(snapshot.protocol, cell);
    if (!sourceBindings.has(sourceId)) fail("SOURCE_BINDING_MISSING", `Missing --source ${sourceId}=checkout`);
    if (!inspectedSources.has(sourceId)) {
      inspectedSources.set(sourceId, { id: sourceId, ...inspectCheckout(sourceBindings.get(sourceId), revision) });
    }
    if (!runtimeBindings.has(adapter.runtimeId)) {
      fail("RUNTIME_BINDING_MISSING", `Missing --runtime ${adapter.runtimeId}=executable`);
    }
    if (!inspectedRuntimes.has(adapter.runtimeId)) {
      inspectedRuntimes.set(adapter.runtimeId, {
        id: adapter.runtimeId,
        ...inspectRuntime(runtimeBindings.get(adapter.runtimeId), adapter.runtimeId)
      });
    }
    let database;
    if (cell.parameters.backend === "postgresql") {
      if (!databaseBindings.has(cell.id)) {
        if (!options.plan) fail("POSTGRESQL_DATABASE_MISSING", `Missing --database ${cell.id}=value`);
        database = { strategy: "required-at-execution" };
      } else {
        database = { strategy: "caller-supplied-per-cell", ...redactDatabase(databaseBindings.get(cell.id), postgresPort) };
      }
    } else {
      if (databaseBindings.has(cell.id)) fail("SQLITE_DATABASE_OVERRIDE", `SQLite database is runner-owned for ${cell.id}`);
      database = { strategy: "release-cell-local" };
    }
    const globalOrdinal = snapshot.protocol.workload.cellOrder.indexOf(cell.id) + 1;
    planned.push({
      ordinal: globalOrdinal,
      id: cell.id,
      expectedVerdict: cell.expectedVerdict,
      parameters: cell.parameters,
      adapterId: adapter.id,
      runtimeId: adapter.runtimeId,
      sourceId,
      revision,
      database
    });
  }

  const corpora = new Map(snapshot.protocol.corpora.map((entry) => [entry.id, entry]));
  for (const [id, checkout] of sourceBindings) {
    if (inspectedSources.has(id)) continue;
    const corpus = corpora.get(id);
    if (!corpus || corpus.dirty !== false || !shaPattern.test(corpus.revision)) {
      fail("UNKNOWN_SOURCE_BINDING", `Source binding is not a declared clean corpus: ${id}`);
    }
    inspectedSources.set(id, { id, ...inspectCheckout(checkout, corpus.revision) });
  }
  const declaredRuntimeIds = new Set(snapshot.protocol.adapters.map((entry) => entry.runtimeId));
  for (const [id, executable] of runtimeBindings) {
    if (inspectedRuntimes.has(id)) continue;
    if (!declaredRuntimeIds.has(id)) fail("UNKNOWN_RUNTIME_BINDING", `Runtime binding is not declared: ${id}`);
    inspectedRuntimes.set(id, { id, ...inspectRuntime(executable, id) });
  }
  const allCells = new Map(snapshot.protocol.plannedCells.map((entry) => [entry.id, entry]));
  const pgFingerprints = [];
  for (const [id, binding] of databaseBindings) {
    const declaredCell = allCells.get(id);
    if (!declaredCell || declaredCell.parameters.backend !== "postgresql") {
      fail("UNKNOWN_DATABASE_BINDING", `Database binding is not a declared PostgreSQL cell: ${id}`);
    }
    pgFingerprints.push(redactDatabase(binding, postgresPort).databaseIdentitySha256);
  }
  if (new Set(pgFingerprints).size !== pgFingerprints.length) {
    fail("POSTGRESQL_DATABASE_REUSED", "Each PostgreSQL cell requires a distinct caller-supplied database binding");
  }
  const selectedPostgresql = planned.filter((cell) => cell.parameters.backend === "postgresql");
  let postgresqlServiceReceipt = null;
  if (selectedPostgresql.length === 0 && options.postgresqlServiceReceipt) {
    fail("POSTGRESQL_SERVICE_RECEIPT_UNEXPECTED", "A PostgreSQL receipt was supplied for a SQLite-only selection");
  }
  if (selectedPostgresql.length > 0 && !options.postgresqlServiceReceipt && !options.plan) {
    fail("POSTGRESQL_SERVICE_RECEIPT_MISSING", "PostgreSQL execution requires --postgresql-service-receipt");
  }
  if (options.postgresqlServiceReceipt) {
    postgresqlServiceReceipt = parsePostgresqlServiceReceipt(
      options.postgresqlServiceReceipt,
      snapshot.protocol,
      snapshot.sha256,
      databaseBindings,
      postgresPort
    );
    verifyPrivatePostgresqlService(postgresqlServiceReceipt);
  }

  return {
    schemaVersion: "workload-ladder-plan/v1",
    protocolId: snapshot.protocol.protocolId,
    protocolSha256: snapshot.sha256,
    protocolBytes: snapshot.bytes.length,
    releaseRoot,
    releaseId: basename(releaseRoot),
    adapters: [...inspectedAdapters.values()].sort((left, right) => codeUnitCompare(left.id, right.id)),
    sources: [...inspectedSources.values()].sort((left, right) => codeUnitCompare(left.id, right.id)),
    runtimes: [...inspectedRuntimes.values()].sort((left, right) => codeUnitCompare(left.id, right.id)),
    cells: planned,
    runnerInputs: runnerInputs(registration),
    registration: {
      repository: snapshot.sourceRegistration.repository,
      revision: snapshot.sourceRegistration.revision,
      path: snapshot.sourceRegistration.path
    },
    _registration: registration,
    _protocolPath: snapshot.absolute,
    _protocol: snapshot.protocol,
    _protocolBytes: snapshot.bytes,
    _databaseBindings: databaseBindings,
    _postgresqlServiceReceipt: postgresqlServiceReceipt
  };
}

export function publicPlan(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    protocolId: plan.protocolId,
    protocolSha256: plan.protocolSha256,
    protocolBytes: plan.protocolBytes,
    registration: plan.registration,
    releaseId: plan.releaseId,
    runnerInputs: plan.runnerInputs,
    adapters: plan.adapters.map((adapter) => ({
      id: adapter.id,
      path: portablePath(repositoryRoot, adapter.path),
      runtimeId: adapter.runtimeId,
      interface: adapter.interface,
      sha256: adapter.sha256,
      treeSha256: adapter.treeSha256,
      treeFiles: adapter.treeFiles
    })),
    sources: plan.sources.map(({ id, revision, locks }) => ({ id, revision, locks })),
    runtimes: plan.runtimes.map(({ id, sha256, version, environmentIdentity, virtualEnvironment }) => ({
      id, sha256, version, environmentIdentity, virtualEnvironment
    })),
    cells: plan.cells
  };
}

function observed(call) {
  try {
    return call();
  } catch (error) {
    return {
      unavailable: true,
      code: error && typeof error === "object" && "code" in error ? error.code : "OBSERVATION_FAILED"
    };
  }
}

function environmentBracket(root) {
  let filesystem = null;
  try {
    const value = statfsSync(root, { bigint: true });
    filesystem = {
      availableBytes: (value.bavail * value.bsize).toString(),
      freeBytes: (value.bfree * value.bsize).toString(),
      totalBytes: (value.blocks * value.bsize).toString()
    };
  } catch {
    filesystem = { unavailable: true };
  }
  return {
    capturedAt: new Date().toISOString(),
    monotonicNs: process.hrtime.bigint().toString(),
    host: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      node: process.version,
      cpus: observed(() => cpus().map((entry) => ({ model: entry.model, speedMHz: entry.speed })))
    },
    loadAverage: observed(() => loadavg()),
    memory: {
      freeBytes: observed(() => freemem()),
      totalBytes: observed(() => totalmem()),
      runner: observed(() => process.memoryUsage())
    },
    runnerCpuUsage: observed(() => process.cpuUsage()),
    runnerResourceUsage: observed(() => process.resourceUsage()),
    systemUptimeSeconds: observed(() => uptime()),
    filesystem
  };
}

function childEnvironment(context) {
  const names = [
    "COMSPEC", "LANG", "PATH", "PATHEXT",
    "SSL_CERT_DIR", "SSL_CERT_FILE", "SYSTEMROOT"
  ];
  const environment = {};
  for (const name of names) if (process.env[name] !== undefined) environment[name] = process.env[name];
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("LC_") && value !== undefined) environment[name] = value;
  }
  environment.HOME = context.privateEnvironment.home;
  environment.TEMP = context.privateEnvironment.temporary;
  environment.TMP = context.privateEnvironment.temporary;
  environment.TMPDIR = context.privateEnvironment.temporary;
  environment.XDG_CACHE_HOME = context.privateEnvironment.cache;
  environment.XDG_CONFIG_HOME = context.privateEnvironment.config;
  environment.XDG_DATA_HOME = context.privateEnvironment.data;
  environment.XDG_STATE_HOME = context.privateEnvironment.state;
  environment.PYTHONPATH = context.source.path;
  environment.PYTHONDONTWRITEBYTECODE = "1";
  environment.PYTHONPYCACHEPREFIX = context.privateEnvironment.pycache;
  environment.PYTHONUNBUFFERED = "1";
  return environment;
}

function processArguments(context, mode, instanceId) {
  return [
    context.adapter.path,
    "--mode", mode,
    "--release-id", context.plan.releaseId,
    "--protocol-id", context.plan.protocolId,
    "--protocol-sha256", context.plan.protocolSha256,
    "--cell-id", context.cell.id,
    "--attempt-id", context.attemptId,
    "--process-instance-id", instanceId,
    "--backend", context.cell.parameters.backend,
    "--database", context.database,
    "--postgresql-service-instance-id", context.postgresqlService?.serviceInstanceId ?? "not-applicable",
    "--postgresql-service-started-at", context.postgresqlService?.startedAt ?? "not-applicable",
    "--concurrency", String(context.cell.parameters.concurrency),
    "--operations-per-type", String(context.cell.parameters.operationsPerType),
    "--run-id", context.runId,
    "--output-dir", context.outputDirectory
  ];
}

function appendEvent(events, event, fields = {}) {
  events.push({ event, at: new Date().toISOString(), monotonicNs: process.hrtime.bigint().toString(), ...fields });
}

function writeAll(descriptor, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const written = writeSync(descriptor, chunk, offset, chunk.length - offset);
    if (written < 1) fail("STDIO_SHORT_WRITE", "Raw process stream could not be fully persisted");
    offset += written;
  }
}

async function captureProcess(runtime, arguments_, paths, environment, cancellation) {
  const stdoutFd = openSync(paths.stdout, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  const stderrFd = openSync(paths.stderr, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  const events = [];
  let stdoutEnded = false;
  let stderrEnded = false;
  let spawnError = null;
  let child;
  const before = environmentBracket(paths.root);

  try {
    child = spawn(runtime.path, arguments_, { cwd: paths.cwd, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    cancellation.activeChild = child;
    appendEvent(events, "spawn", { pid: child.pid ?? null });
    const persist = (descriptor, chunk) => {
      try {
        writeAll(descriptor, chunk);
      } catch (error) {
        if (!spawnError) spawnError = error;
        appendEvent(events, "stdio-write-error", {
          code: error instanceof LadderRunnerError ? error.code : "STDIO_WRITE_FAILURE"
        });
        if (!child.killed) child.kill("SIGTERM");
      }
    };
    child.stdout.on("data", (chunk) => persist(stdoutFd, chunk));
    child.stderr.on("data", (chunk) => persist(stderrFd, chunk));
    child.stdout.on("end", () => { stdoutEnded = true; appendEvent(events, "stdout-end"); });
    child.stderr.on("end", () => { stderrEnded = true; appendEvent(events, "stderr-end"); });
    if (cancellation.signal) child.kill(cancellation.signal);
  } catch (error) {
    spawnError = error;
  }

  let code = null;
  let signal = null;
  if (child && !spawnError) {
    await new Promise((resolveProcess) => {
      child.once("error", (error) => {
        spawnError = error;
        appendEvent(events, "spawn-error", {
          code: error && typeof error === "object" && "code" in error ? error.code : "SPAWN_FAILURE"
        });
      });
      child.once("exit", (exitCode, exitSignal) => appendEvent(events, "exit", { code: exitCode, signal: exitSignal }));
      child.once("close", (exitCode, exitSignal) => {
        code = exitCode;
        signal = exitSignal;
        appendEvent(events, "close", { code, signal, stdoutEnded, stderrEnded });
        resolveProcess();
      });
    });
  }
  cancellation.activeChild = null;
  for (const descriptor of [stdoutFd, stderrFd]) {
    try {
      fsyncSync(descriptor);
    } catch (error) {
      spawnError ??= error;
      appendEvent(events, "stdio-fsync-error", {
        code: error && typeof error === "object" && "code" in error ? error.code : "STDIO_FSYNC_FAILURE"
      });
    } finally {
      closeSync(descriptor);
    }
  }
  const after = environmentBracket(paths.root);
  const closeEvent = events.at(-1);
  const closeAfterStdio = closeEvent?.event === "close" && stdoutEnded && stderrEnded;
  const status = signal || cancellation.signal ? "indeterminate" : spawnError || code !== 0 ? "failed" : "complete";
  return {
    pid: child?.pid ?? null,
    status,
    exit: { code, signal },
    spawnError: spawnError
      ? (spawnError && typeof spawnError === "object" && "code" in spawnError ? spawnError.code : "SPAWN_FAILURE")
      : null,
    closeAfterStdio,
    events,
    environmentBefore: before,
    environmentAfter: after
  };
}

function parseEnvelope(stdoutPath, expected, outputDirectory) {
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(stdoutPath, "utf8").trim());
  } catch (error) {
    fail("ADAPTER_ENVELOPE_INVALID", `${expected.mode} did not emit exactly one JSON envelope`, {
      message: error instanceof Error ? error.message : String(error)
    });
  }
  const expectedKeys = ["interface", "ledger_path", "mode", "status", "verdict"].sort();
  if (!exactKeys(envelope, expectedKeys) || envelope.interface !== adapterInterface || envelope.mode !== expected.mode) {
    fail("ADAPTER_ENVELOPE_INVALID", `${expected.mode} envelope violates ${adapterInterface}`);
  }
  if (!["complete", "failed", "indeterminate"].includes(envelope.status)) {
    fail("ADAPTER_ENVELOPE_INVALID", `${expected.mode} emitted an unknown status`);
  }
  const ledgerName = `${expected.runId}.${expected.mode}.jsonl`;
  const expectedLedger = resolve(outputDirectory, ledgerName);
  if (envelope.ledger_path !== ledgerName ||
      !existsSync(expectedLedger) || lstatSync(expectedLedger).isSymbolicLink() || !lstatSync(expectedLedger).isFile()) {
    fail("ADAPTER_LEDGER_INVALID", `${expected.mode} ledger is absent or outside its cell output directory`);
  }
  return { envelope, ledger: { path: expectedLedger, ...hashFile(expectedLedger), bytes: statSync(expectedLedger).size } };
}

async function runAdapter(context, mode, cancellation) {
  verifyExecutionInputs(context);
  if (context.cell.parameters.backend === "postgresql") {
    verifyPostgresqlServiceReceipt(context.plan, context.execution.copiedPostgresqlReceipt);
    verifyLivePostgresqlService(context.plan._postgresqlServiceReceipt);
  }
  const instanceId = randomUUID();
  const processDirectory = join(context.cellDirectory, mode);
  mkdirSync(processDirectory, { mode: 0o700 });
  const paths = {
    root: context.plan.releaseRoot,
    cwd: context.outputDirectory,
    stdout: join(processDirectory, "stdout.json"),
    stderr: join(processDirectory, "stderr.txt")
  };
  const arguments_ = processArguments(context, mode, instanceId);
  const result = await captureProcess(
    context.runtime,
    arguments_,
    paths,
    childEnvironment(context),
    cancellation
  );
  let postExecutionVerificationError = null;
  try {
    verifyExecutionInputs(context);
  } catch (error) {
    postExecutionVerificationError = error instanceof LadderRunnerError
      ? { code: error.code }
      : { code: "EXECUTION_INPUT_POSTCHECK_FAILED" };
  }
  if (context.cell.parameters.backend === "postgresql") {
    try {
      verifyLivePostgresqlService(context.plan._postgresqlServiceReceipt);
    } catch (error) {
      postExecutionVerificationError ??= error instanceof LadderRunnerError
        ? { code: error.code }
        : { code: "POSTGRESQL_SERVICE_POSTCHECK_FAILED" };
    }
  }
  let adapterResult = null;
  let orchestrationError = postExecutionVerificationError;
  if (result.status !== "indeterminate" && orchestrationError === null) {
    try {
      adapterResult = parseEnvelope(paths.stdout, { mode, runId: context.runId }, context.outputDirectory);
    } catch (error) {
      orchestrationError = error instanceof LadderRunnerError
        ? { code: error.code }
        : { code: "ADAPTER_RESULT_FAILURE" };
    }
  }
  const record = {
    schemaVersion: "workload-process-record/v1",
    mode,
    processInstanceId: instanceId,
    command: {
      runtimeId: context.cell.runtimeId,
      runtimeSha256: context.runtime.sha256,
      adapterId: context.adapter.id,
      adapterPath: portablePath(repositoryRoot, context.adapter.path),
      adapterTreeSha256: context.adapter.treeSha256,
      interface: context.adapter.interface,
      logicalArguments: {
        mode,
        releaseId: context.plan.releaseId,
        protocolId: context.plan.protocolId,
        protocolSha256: context.plan.protocolSha256,
        cellId: context.cell.id,
        attemptId: context.attemptId,
        processInstanceId: instanceId,
        backend: context.cell.parameters.backend,
        concurrency: context.cell.parameters.concurrency,
        operationsPerType: context.cell.parameters.operationsPerType,
        runId: context.runId,
        database: context.cell.parameters.backend === "sqlite"
          ? { strategy: "release-cell-local", databaseIdentitySha256: context.databaseIdentitySha256 }
          : context.cell.database,
        postgresqlService: context.postgresqlService
      }
    },
    stdoutPath: portablePath(context.plan.releaseRoot, paths.stdout),
    stderrPath: portablePath(context.plan.releaseRoot, paths.stderr),
    ...result,
    adapterEnvelope: adapterResult?.envelope ?? null,
    ledger: adapterResult ? {
      path: portablePath(context.plan.releaseRoot, adapterResult.ledger.path),
      sha256: adapterResult.ledger.sha256,
      bytes: adapterResult.ledger.bytes
    } : null,
    orchestrationError
  };
  writeExclusiveJson(join(processDirectory, "process.json"), record);
  return record;
}

function verifyProtocolCopy(plan, copiedProtocol) {
  const source = hashFile(plan._protocolPath);
  const copy = hashFile(copiedProtocol);
  if (source.sha256 !== plan.protocolSha256 || copy.sha256 !== plan.protocolSha256 ||
      !source.bytes.equals(plan._protocolBytes) || !copy.bytes.equals(plan._protocolBytes)) {
    fail("PROTOCOL_HASH_MISMATCH", "Protocol bytes changed after the execution lock was created");
  }
}

function verifyPostgresqlServiceReceipt(plan, copiedReceipt = null) {
  const receipt = plan._postgresqlServiceReceipt;
  if (!receipt) return;
  verifyPrivatePostgresqlService(receipt);
  const source = hashFile(receipt.path);
  if (source.sha256 !== receipt.sha256 || source.size !== receipt.size || !source.bytes.equals(receipt.bytes)) {
    fail("POSTGRESQL_SERVICE_RECEIPT_CHANGED", "PostgreSQL service receipt changed after plan creation");
  }
  if (copiedReceipt) {
    const copy = hashFile(copiedReceipt);
    if (copy.sha256 !== receipt.sha256 || copy.size !== receipt.size || !copy.bytes.equals(receipt.bytes)) {
      fail("POSTGRESQL_SERVICE_RECEIPT_COPY_MISMATCH", "Copied PostgreSQL service receipt differs from its pre-run bytes");
    }
  }
}

function verifySource(source) {
  const observed = inspectCheckout(source.path, source.revision);
  if (observed.checkoutIdentitySha256 !== source.checkoutIdentitySha256 ||
      JSON.stringify(observed.locks) !== JSON.stringify(source.locks) ||
      JSON.stringify(observed.sourceFiles) !== JSON.stringify(source.sourceFiles)) {
    fail("SOURCE_PROVENANCE_CHANGED", `Source provenance changed after plan creation: ${source.id}`);
  }
  return observed;
}

function verifyRuntime(runtime) {
  const observed = inspectRuntime(runtime.path, runtime.id);
  if (observed.sha256 !== runtime.sha256 || observed.version !== runtime.version ||
      JSON.stringify(observed.environmentIdentity) !== JSON.stringify(runtime.environmentIdentity) ||
      JSON.stringify(observed.virtualEnvironment) !== JSON.stringify(runtime.virtualEnvironment)) {
    fail("RUNTIME_ENVIRONMENT_CHANGED", `Runtime environment changed after plan creation: ${runtime.id}`);
  }
}

function verifyAdapter(adapter, registration) {
  if (lstatSync(adapter.path).isSymbolicLink() || !lstatSync(adapter.path).isFile() ||
      hashFile(adapter.path).sha256 !== adapter.sha256) {
    fail("ADAPTER_HASH_MISMATCH", `Adapter changed after plan creation: ${adapter.id}`);
  }
  if (hashTree(adapter.treeRoot, registration).treeSha256 !== adapter.treeSha256) {
    fail("ADAPTER_TREE_HASH_MISMATCH", `Adapter module tree changed after plan creation: ${adapter.id}`);
  }
}

function verifyRunnerInputs(expected, registration) {
  if (runnerInputs(registration).sha256 !== expected.sha256) {
    fail("RUNNER_INPUT_HASH_MISMATCH", "Runner or protocol-validator inputs changed after lock creation");
  }
}

function verifyExecutionInputs(context) {
  verifyProtocolCopy(context.plan, context.execution.copiedProtocol);
  verifyPostgresqlServiceReceipt(context.plan, context.execution.copiedPostgresqlReceipt);
  verifyHarnessRegistration(context.plan._registration, context.plan.releaseRoot);
  verifyRunnerInputs(context.execution.runnerInputs, context.plan._registration);
  verifyAdapter(context.adapter, context.plan._registration);
  verifySource(context.source);
  verifyRuntime(context.runtime);
}

function keysAreCanonical(value) {
  if (Array.isArray(value)) return value.every(keysAreCanonical);
  if (value === null || typeof value !== "object") return true;
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(codeUnitCompare))) return false;
  return keys.every((key) => keysAreCanonical(value[key]));
}

function verifiedOracleRecords(record, releaseRoot) {
  const snapshot = hashFile(join(releaseRoot, record.ledger.path));
  if (snapshot.sha256 !== record.ledger.sha256 || snapshot.size !== record.ledger.bytes) {
    fail("ORACLE_LEDGER_CHANGED", "Oracle ledger changed after process capture");
  }
  const text = snapshot.bytes.toString("utf8");
  if (!text.endsWith("\n") || text.includes("\r")) fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger has invalid framing");
  const lines = text.slice(0, -1).split("\n");
  let previous = "0".repeat(64);
  let identity = null;
  const identityFields = ["attempt_id", "cell_id", "process_instance_id", "protocol_id", "protocol_sha256", "release_id"];
  return lines.map((raw, index) => {
    const match = raw.match(/,"line_sha256":"([0-9a-f]{64})"/g);
    if (!match || match.length !== 1) fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger hash field is not canonical");
    const stored = match[0].slice(-65, -1);
    const payload = raw.replace(match[0], "");
    if (hashBytes(Buffer.from(payload, "utf8")) !== stored) {
      fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger line hash failed verification");
    }
    const parsed = JSON.parse(raw);
    if (!keysAreCanonical(parsed) || parsed.schema !== "hc-cortex-002-ledger/v1" ||
        parsed.sequence !== index + 1 || parsed.prev_sha256 !== previous) {
      fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger sequence, schema, or predecessor is invalid");
    }
    const observedIdentity = Object.fromEntries(identityFields.map((field) => [field, parsed[field]]));
    if (identityFields.some((field) => typeof observedIdentity[field] !== "string" || observedIdentity[field] === "")) {
      fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger identity is incomplete");
    }
    if (identity === null) identity = observedIdentity;
    else if (JSON.stringify(identity) !== JSON.stringify(observedIdentity)) {
      fail("ORACLE_LEDGER_CHAIN_INVALID", "Oracle ledger changes its bound identity");
    }
    previous = stored;
    return parsed;
  });
}

function oracleFailureScope(record, releaseRoot) {
  const fixtureChecks = new Set([
    "configuration_binding",
    "final_live_count_formula",
    "fresh_process_restart",
    "one_outcome_per_intent",
    "planned_operation_counts",
    "release_protocol_cell_attempt_binding",
    "workload_terminal"
  ]);
  try {
    const records = verifiedOracleRecords(record, releaseRoot);
    const oracleResults = records.filter((entry) => entry.event === "oracle_result");
    const terminal = records.at(-1);
    if (oracleResults.length !== 1 || terminal?.event !== "terminal" ||
        terminal.state !== "complete" || terminal.verdict !== record.adapterEnvelope.verdict) return "global";
    const oracleResult = oracleResults[0];
    const failed = Object.entries(oracleResult?.checks ?? {})
      .filter(([, check]) => check?.passed !== true)
      .map(([id]) => id);
    if (failed.length === 0 || failed.some((id) => fixtureChecks.has(id))) return "global";
    return "backend-repetition";
  } catch {
    return "global";
  }
}

function processOutcome(record, mode, releaseRoot) {
  if (record.status === "indeterminate") {
    return { status: "indeterminate", verdict: "indeterminate", reason: `${mode}-signal-or-cancellation`, failureScope: "global" };
  }
  if (record.orchestrationError) {
    return { status: "failed", verdict: null, reason: record.orchestrationError.code, failureScope: "global" };
  }
  const envelope = record.adapterEnvelope;
  if (mode === "workload") {
    if (record.exit.code === 0 && envelope.status === "complete" && envelope.verdict === "pending") {
      return { status: "continue", reason: null };
    }
    return envelope.status === "indeterminate"
      ? { status: "indeterminate", verdict: "indeterminate", reason: "workload-indeterminate", failureScope: "global" }
      : { status: "failed", verdict: null, reason: "workload-failed", failureScope: "global" };
  }
  if (record.exit.code === 0 && envelope.status === "complete" && envelope.verdict === "proven") {
    return { status: "observed", verdict: "proven", reason: null, failureScope: null };
  }
  if (record.exit.code === 1 && envelope.status === "complete" && envelope.verdict === "blocked") {
    return {
      status: "observed",
      verdict: "blocked",
      reason: "oracle-blocked",
      failureScope: oracleFailureScope(record, releaseRoot)
    };
  }
  return envelope.status === "indeterminate"
    ? { status: "indeterminate", verdict: "indeterminate", reason: "oracle-indeterminate", failureScope: "global" }
    : { status: "failed", verdict: null, reason: "oracle-failed", failureScope: "global" };
}

function installSignalCapture(cancellation) {
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      if (!cancellation.signal) cancellation.signal = signal;
      if (cancellation.activeChild && !cancellation.activeChild.killed) cancellation.activeChild.kill(signal);
    };
    try {
      process.on(signal, handler);
      handlers.set(signal, handler);
    } catch {
      // The signal is unavailable on this host; the remaining supported signals still record cancellation.
    }
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

function createExecutionLock(plan) {
  let rootCreated = false;
  let runAttemptId = null;
  try {
    verifyHarnessRegistration(plan._registration);
    mkdirSync(plan.releaseRoot, { mode: 0o700 });
    rootCreated = true;
    const copiedProtocol = join(plan.releaseRoot, "protocol.json");
    writeExclusiveBytes(copiedProtocol, plan._protocolBytes);
    let copiedPostgresqlReceipt = null;
    if (plan._postgresqlServiceReceipt) {
      verifyPostgresqlServiceReceipt(plan);
      copiedPostgresqlReceipt = join(plan.releaseRoot, "postgresql-service-receipt.json");
      writeExclusiveBytes(copiedPostgresqlReceipt, plan._postgresqlServiceReceipt.bytes);
      verifyPostgresqlServiceReceipt(plan, copiedPostgresqlReceipt);
    }
    runAttemptId = randomUUID();
    const lock = {
      schemaVersion: "workload-protocol-lock/v1",
      runAttemptId,
      createdAt: new Date().toISOString(),
      protocolId: plan.protocolId,
      protocolSha256: plan.protocolSha256,
      protocolBytes: plan.protocolBytes,
      copiedProtocolPath: "protocol.json",
      registration: plan.registration,
      runnerInputs: plan.runnerInputs,
      postgresqlServiceReceipt: plan._postgresqlServiceReceipt ? {
        path: "postgresql-service-receipt.json",
        sha256: plan._postgresqlServiceReceipt.sha256,
        bytes: plan._postgresqlServiceReceipt.size,
        schemaVersion: plan._postgresqlServiceReceipt.schemaVersion,
        serviceInstanceId: plan._postgresqlServiceReceipt.serviceInstanceId
      } : null,
      adapters: plan.adapters.map(({ id, path, sha256, interface: interfaceName, runtimeId }) => ({
        id,
        path: portablePath(repositoryRoot, path),
        sha256,
        interface: interfaceName,
        runtimeId,
        treeSha256: plan.adapters.find((entry) => entry.id === id).treeSha256,
        treeFiles: plan.adapters.find((entry) => entry.id === id).treeFiles
      }))
    };
    writeExclusiveJson(join(plan.releaseRoot, "protocol-lock.json"), lock);
    verifyProtocolCopy(plan, copiedProtocol);
    mkdirSync(join(plan.releaseRoot, "cells"), { mode: 0o700 });
    const initialEnvironment = environmentBracket(plan.releaseRoot);
    writeExclusiveJson(join(plan.releaseRoot, "environment.json"), {
      schemaVersion: "workload-environment/v1",
      capturedAt: new Date().toISOString(),
      sources: plan.sources.map(({ id, revision, checkoutIdentitySha256, locks, sourceFiles }) => ({
        id, revision, checkoutIdentitySha256, locks, sourceFiles
      })),
      runtimes: plan.runtimes.map(({ id, sha256, version, environmentIdentity, virtualEnvironment }) => ({
        id, sha256, version, environmentIdentity, virtualEnvironment
      })),
      adapters: lock.adapters,
      host: initialEnvironment.host,
      memory: initialEnvironment.memory,
      childEnvironmentPolicy: "minimal locale/PATH/SSL allow-list; cell-private HOME, TMP and XDG roots; exact pinned-source PYTHONPATH"
    });
    return { runAttemptId, copiedProtocol, copiedPostgresqlReceipt, runnerInputs: plan.runnerInputs };
  } catch (error) {
    if (error && typeof error === "object") {
      error.runnerCreatedRelease = rootCreated;
      error.runnerRunAttemptId = runAttemptId;
    }
    throw error;
  }
}

function cellContext(plan, cell, ordinal, execution) {
  const source = plan.sources.find((entry) => entry.id === cell.sourceId);
  const runtime = plan.runtimes.find((entry) => entry.id === cell.runtimeId);
  const adapter = plan.adapters.find((entry) => entry.id === cell.adapterId);
  const cellDirectory = join(plan.releaseRoot, "cells", String(ordinal).padStart(4, "0"));
  mkdirSync(cellDirectory, { mode: 0o700 });
  const outputDirectory = join(cellDirectory, "adapter");
  mkdirSync(outputDirectory, { mode: 0o700 });
  const privateRoot = join(cellDirectory, "private");
  mkdirSync(privateRoot, { mode: 0o700 });
  const privateEnvironment = {};
  for (const name of ["home", "temporary", "cache", "config", "data", "state", "pycache"]) {
    privateEnvironment[name] = join(privateRoot, name);
    mkdirSync(privateEnvironment[name], { mode: 0o700 });
  }
  const databaseDirectory = join(cellDirectory, "database");
  let database;
  let databaseIdentitySha256;
  const postgresqlService = cell.parameters.backend === "postgresql" ? {
    serviceInstanceId: plan._postgresqlServiceReceipt.serviceInstanceId,
    startedAt: plan._postgresqlServiceReceipt.startedAt,
    processId: plan._postgresqlServiceReceipt.processId
  } : null;
  if (cell.parameters.backend === "sqlite") {
    mkdirSync(databaseDirectory, { mode: 0o700 });
    database = join(databaseDirectory, "cortex.sqlite3");
    databaseIdentitySha256 = hashBytes(Buffer.from(resolve(database), "utf8"));
  } else {
    database = plan._databaseBindings.get(cell.id);
    databaseIdentitySha256 = cell.database.databaseIdentitySha256;
  }
  const runId = `run-${String(ordinal).padStart(4, "0")}-${randomUUID()}`;
  const cellAttemptId = randomUUID();
  writeExclusiveJson(join(cellDirectory, "cell.json"), {
    schemaVersion: "workload-cell-input/v1",
    protocolId: plan.protocolId,
    protocolSha256: plan.protocolSha256,
    runAttemptId: execution.runAttemptId,
    attemptId: cellAttemptId,
    runId,
    ordinal,
    id: cell.id,
    expectedVerdict: cell.expectedVerdict,
    parameters: cell.parameters,
    source: { id: source.id, revision: source.revision },
    database: cell.parameters.backend === "sqlite"
      ? { path: "database/cortex.sqlite3", databaseIdentitySha256 }
      : cell.database,
    postgresqlService
  });
  return {
    plan, cell, source, runtime, adapter, cellDirectory, outputDirectory, database, databaseIdentitySha256,
    postgresqlService, execution,
    runId, attemptId: cellAttemptId, privateEnvironment
  };
}

async function executeCell(context, execution, cancellation) {
  const startedAt = new Date().toISOString();
  let workload = null;
  let oracle = null;
  let outcome = { status: "failed", verdict: null, reason: "RUNNER_FAILURE", failureScope: "global" };
  try {
    verifyExecutionInputs(context);
    workload = await runAdapter(context, "workload", cancellation);
    outcome = processOutcome(workload, "workload", context.plan.releaseRoot);
    if (outcome.status === "continue" && !cancellation.signal) {
      oracle = await runAdapter(context, "oracle", cancellation);
      outcome = processOutcome(oracle, "oracle", context.plan.releaseRoot);
      if (outcome.status === "observed") {
        const expected = context.cell.expectedVerdict;
        if (outcome.verdict === expected && !(outcome.verdict === "blocked" && outcome.failureScope === "global")) {
          outcome = {
            ...outcome,
            status: "passed",
            reason: outcome.verdict === "blocked" ? "expected-negative-control" : null,
            failureScope: null
          };
        } else {
          const mismatchScope = context.cell.parameters.phase === "regression"
            ? "global"
            : outcome.failureScope ?? "backend-repetition";
          outcome = {
            ...outcome,
            status: "failed",
            reason: mismatchScope === "global" && outcome.failureScope === "global"
              ? "fixture-or-oracle-corruption"
              : `unexpected-${outcome.verdict}-verdict`,
            failureScope: mismatchScope
          };
        }
      }
    } else if (outcome.status === "continue") {
      outcome = {
        status: "indeterminate",
        verdict: "indeterminate",
        reason: "cancellation-before-oracle",
        failureScope: "global"
      };
    }
  } catch (error) {
    outcome = {
      status: cancellation.signal ? "indeterminate" : "failed",
      verdict: cancellation.signal ? "indeterminate" : null,
      reason: error instanceof LadderRunnerError ? error.code : "RUNNER_FAILURE",
      failureScope: "global"
    };
  }
  try {
    verifyExecutionInputs(context);
  } catch (error) {
    outcome = {
      status: "failed",
      verdict: null,
      reason: error instanceof LadderRunnerError ? error.code : "EXECUTION_INPUT_POSTCHECK_FAILED",
      failureScope: "global"
    };
  }
  const result = {
    schemaVersion: "workload-cell-result/v1",
    id: context.cell.id,
    ordinal: context.cell.ordinal,
    expectedVerdict: context.cell.expectedVerdict,
    attemptId: context.attemptId,
    verdict: outcome.verdict,
    status: outcome.status,
    reason: outcome.reason,
    failureScope: outcome.failureScope,
    startedAt,
    endedAt: new Date().toISOString(),
    workloadProcessPath: workload
      ? portablePath(context.plan.releaseRoot, join(context.cellDirectory, "workload", "process.json"))
      : null,
    oracleProcessPath: oracle
      ? portablePath(context.plan.releaseRoot, join(context.cellDirectory, "oracle", "process.json"))
      : null
  };
  writeExclusiveJson(join(context.cellDirectory, "cell-result.json"), result);
  return result;
}

export async function executeWorkloadPlan(plan) {
  let execution;
  try {
    execution = createExecutionLock(plan);
  } catch (error) {
    if (!error || typeof error !== "object" || error.runnerCreatedRelease !== true) throw error;
    const summary = {
      schemaVersion: "workload-run-summary/v1",
      releaseId: plan.releaseId,
      protocolId: plan.protocolId,
      protocolSha256: plan.protocolSha256,
      runAttemptId: error.runnerRunAttemptId ?? null,
      status: "failed",
      cancellationSignal: null,
      stopCellId: null,
      initializationError: {
        code: error instanceof LadderRunnerError ? error.code : "RUNNER_INITIALIZATION_FAILURE",
        message: "Execution initialization failed closed"
      },
      cells: protocolCellUniverse(plan).map((cell) => ({
        id: cell.id,
        ordinal: cell.ordinal,
        expectedVerdict: cell.expectedVerdict,
        verdict: null,
        status: "not-run",
        reason: "execution-lock-incomplete"
      }))
    };
    writeExclusiveJson(join(plan.releaseRoot, "run-summary.json"), summary);
    writeExclusiveJsonLines(join(plan.releaseRoot, "negative-log.jsonl"), summary.cells.map((cell) => ({
      schemaVersion: "workload-negative-log/v1",
      cellId: cell.id,
      status: cell.status,
      reason: cell.reason
    })));
    return summary;
  }
  const cancellation = { signal: null, activeChild: null };
  const removeSignals = installSignalCapture(cancellation);
  const results = new Map();
  const selectedIds = new Set(plan.cells.map((cell) => cell.id));
  for (const cell of protocolCellUniverse(plan)) {
    if (!selectedIds.has(cell.id)) {
      results.set(cell.id, {
        ...cell,
        verdict: null,
        status: "not-run",
        reason: "excluded-by-explicit-cell-selection"
      });
    }
  }
  const blockedStrata = new Set();
  let globalStop = null;
  let activeCell = null;
  try {
    for (const cell of plan.cells) {
      if (globalStop || cancellation.signal) break;
      activeCell = cell;
      const stratum = `${cell.parameters.backend}\0${cell.parameters.repetition}`;
      if (blockedStrata.has(stratum)) {
        results.set(cell.id, {
          id: cell.id,
          ordinal: cell.ordinal,
          expectedVerdict: cell.expectedVerdict,
          verdict: null,
          status: "not-run",
          reason: "stopped-after-negative-evidence-in-backend-repetition"
        });
        continue;
      }
      const context = cellContext(plan, cell, cell.ordinal, execution);
      const result = await executeCell(context, execution, cancellation);
      results.set(cell.id, result);
      if (result.status !== "passed") {
        if (result.failureScope === "backend-repetition") blockedStrata.add(stratum);
        else globalStop = result;
      }
    }
  } catch (error) {
    globalStop = {
      id: activeCell?.id ?? null,
      ordinal: activeCell?.ordinal ?? null,
      expectedVerdict: activeCell?.expectedVerdict ?? null,
      status: cancellation.signal ? "indeterminate" : "failed",
      verdict: cancellation.signal ? "indeterminate" : null,
      failureScope: "global",
      reason: error instanceof LadderRunnerError ? error.code : "RUNNER_FAILURE",
      error: "Execution failed closed"
    };
    if (activeCell && !results.has(activeCell.id)) results.set(activeCell.id, globalStop);
  } finally {
    removeSignals();
  }
  const universe = protocolCellUniverse(plan);
  for (const cell of universe) {
    if (!results.has(cell.id)) {
      results.set(cell.id, {
        id: cell.id,
        ordinal: cell.ordinal,
        expectedVerdict: cell.expectedVerdict,
        verdict: null,
        status: "not-run",
        reason: cancellation.signal ? "cancellation" : "stopped-after-global-failure"
      });
    }
  }
  const orderedResults = universe.map((cell) => results.get(cell.id));
  const failures = orderedResults.filter((entry) => entry.status === "failed" || entry.status === "indeterminate");
  const status = cancellation.signal || failures.some((entry) => entry.status === "indeterminate")
    ? "indeterminate"
    : failures.length > 0 ? "failed" : "completed";
  const summary = {
    schemaVersion: "workload-run-summary/v1",
    releaseId: plan.releaseId,
    protocolId: plan.protocolId,
    protocolSha256: plan.protocolSha256,
    runAttemptId: execution.runAttemptId,
    status,
    cancellationSignal: cancellation.signal,
    stopCellId: failures[0]?.id ?? globalStop?.id ?? null,
    failureCellIds: failures.map((entry) => entry.id),
    cells: orderedResults
  };
  writeExclusiveJson(join(plan.releaseRoot, "run-summary.json"), summary);
  const negative = orderedResults.filter((entry) =>
    entry.status !== "passed" || entry.verdict === "blocked"
  ).map((entry) => ({
    schemaVersion: "workload-negative-log/v1",
    cellId: entry.id,
    status: entry.status,
    verdict: entry.verdict,
    reason: entry.reason
  }));
  writeExclusiveJsonLines(join(plan.releaseRoot, "negative-log.jsonl"), negative.length > 0 ? negative : [{
    schemaVersion: "workload-negative-log/v1",
    cellId: null,
    status: "none",
    verdict: null,
    reason: "no-negative-evidence-observed"
  }]);
  return summary;
}

export function errorResult(error) {
  // The top-level message stays a fixed, non-leaking string -- LadderRunnerError.message
  // frequently interpolates a local checkout/adapter path (see e.g. git()'s "Git inspection
  // failed for ${checkout}") and must never reach the CLI. details is different: every fail()
  // call site that supplies a third argument constructs it from already-sanitized fields only
  // (JSON-pointer-style symbolic paths, OS error codes, exit/signal numbers, git-relative
  // dirty paths) -- never raw stderr or an absolute host path -- so it is safe, and necessary
  // for diagnosis, to surface as-is. A fail-closed error that swallows its own cause is a
  // diagnosis-blocker; see the Windows CI investigation this was fixed to unblock.
  return {
    schemaVersion: "workload-ladder-error/v1",
    valid: false,
    error: {
      code: error instanceof LadderRunnerError ? error.code : "UNEXPECTED_ERROR",
      message: "Workload ladder failed closed",
      details: error instanceof LadderRunnerError ? error.details : null
    }
  };
}
