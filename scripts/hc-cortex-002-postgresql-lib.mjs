import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
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
  writeSync
} from "node:fs";
import { isAbsolute, join, parse, resolve, sep, win32 } from "node:path";
import { platform } from "node:os";
import { loadBenchmarkProtocol } from "./benchmark-release-lib.mjs";

export const provisionSchemaVersion = "hc-cortex-002-postgresql-provision/v1";
export const serviceReceiptSchemaVersion = "hc-cortex-002-postgresql-service-receipt/v1";
export const bindingSchemaVersion = "hc-cortex-002-postgresql-bindings/v1";
export const stateSchemaVersion = "hc-cortex-002-postgresql-state/v1";

const expectedProtocolId = "2026-08-30-hc-cortex-002-v1";
const evidenceIds = [
  "postgres-local-connections",
  "postgres-trust-boundary",
  "postgres-createdb"
];
const binaryNames = ["postgres", "initdb", "pg_ctl", "createdb", "psql"];
const privateMode = 0o600;
const privateDirectoryMode = 0o700;
const publicMode = 0o644;
const paths = Object.freeze({
  bindings: "runner-bindings.json",
  cluster: "cluster",
  events: "provision-events.jsonl",
  log: "postgresql.log",
  receipt: "postgresql-service-receipt.json",
  socket: "socket",
  state: "provisioner-state.json"
});

const settingsQuery = String.raw`SELECT json_build_object(
  'serverVersion', current_setting('server_version'),
  'serverVersionNum', current_setting('server_version_num'),
  'listenAddresses', current_setting('listen_addresses'),
  'socketDirectories', current_setting('unix_socket_directories'),
  'socketPermissions', current_setting('unix_socket_permissions'),
  'port', current_setting('port'),
  'postmasterStartedAt', pg_postmaster_start_time(),
  'serverInetAddress', inet_server_addr(),
  'hbaErrors', (SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL),
  'hbaLocalRuleMethods', (
    SELECT coalesce(json_agg(method ORDER BY method), '[]'::json)
    FROM (SELECT DISTINCT auth_method AS method FROM pg_hba_file_rules WHERE type = 'local') AS methods
  ),
  'hbaHostRuleMethods', (
    SELECT coalesce(json_agg(method ORDER BY method), '[]'::json)
    FROM (SELECT DISTINCT auth_method AS method FROM pg_hba_file_rules WHERE type LIKE 'host%') AS methods
  )
)::text;`;

const databaseQuery = String.raw`SELECT json_build_object(
  'currentDatabase', current_database(),
  'userRelationCount', (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname NOT LIKE 'pg_toast%'
      AND namespace.nspname NOT LIKE 'pg_temp_%'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_class'::regclass
          AND dependency.objid = relation.oid
          AND dependency.deptype = 'e'
      )
  )
)::text;`;

export class PostgresProvisionerError extends Error {
  constructor(code, message, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "PostgresProvisionerError";
    this.code = code;
  }
}

function fail(code, message, cause = null) {
  throw new PostgresProvisionerError(code, message, cause);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function now(dependencies) {
  return (dependencies.now ?? (() => new Date().toISOString()))();
}

function sanitizedEnvironment() {
  const environment = {};
  for (const name of [
    "COMSPEC", "LANG", "PATH", "PATHEXT", "SYSTEMROOT"
  ]) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("LC_") && value !== undefined) environment[name] = value;
  }
  return environment;
}

function normalizeResult(result) {
  return {
    error: result?.error ?? null,
    signal: result?.signal ?? null,
    status: Number.isInteger(result?.status) ? result.status : null,
    stderr: Buffer.isBuffer(result?.stderr) ? result.stderr.toString("utf8") : String(result?.stderr ?? ""),
    stdout: Buffer.isBuffer(result?.stdout) ? result.stdout.toString("utf8") : String(result?.stdout ?? "")
  };
}

function defaultRunCommand(command, arguments_, context) {
  return spawnSync(command, arguments_, {
    cwd: context.cwd,
    encoding: "utf8",
    env: context.environment
  });
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (written <= 0) fail("PRIVATE_ARTIFACT_WRITE_FAILED", "A private provisioner artifact could not be written");
    offset += written;
  }
}

function writeJson(path, value, mode, exclusive) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const flags = constants.O_WRONLY | constants.O_CREAT | noFollow |
    (exclusive ? constants.O_EXCL : constants.O_TRUNC);
  let descriptor;
  try {
    descriptor = openSync(path, flags, mode);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    fail("PRIVATE_ARTIFACT_WRITE_FAILED", "A provisioner artifact could not be written", error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(path, mode);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function appendEvent(context, event) {
  const path = join(context.root, paths.events);
  const record = {
    sequence: context.eventSequence,
    at: now(context.dependencies),
    ...event
  };
  context.eventSequence += 1;
  appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: privateMode });
  chmodSync(path, privateMode);
}

function execute(context, command, arguments_, phase, acceptedStatuses = [0]) {
  let result;
  try {
    result = normalizeResult((context.dependencies.runCommand ?? defaultRunCommand)(
      command,
      arguments_,
      {
        cwd: context.root,
        environment: sanitizedEnvironment(),
        phase
      }
    ));
  } catch (error) {
    result = normalizeResult({ error });
  }
  appendEvent(context, {
    type: "command",
    phase,
    command,
    arguments: arguments_,
    result: {
      errorName: result.error?.name ?? null,
      signal: result.signal,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout
    }
  });
  if (result.error || result.signal !== null || !acceptedStatuses.includes(result.status)) {
    fail("POSTGRESQL_COMMAND_FAILED", `PostgreSQL command failed during ${phase}`);
  }
  return result;
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function rejectSymlinkComponents(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  let cursor = root;
  for (const segment of absolute.slice(root.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    const status = lstatIfPresent(cursor);
    if (status?.isSymbolicLink()) {
      fail("UNSAFE_PRIVATE_ROOT", "The private PostgreSQL root must not traverse a symbolic link");
    }
  }
}

function prepareNewRoot(requestedRoot) {
  if (platform() === "win32" || typeof process.getuid !== "function") {
    fail("UNSUPPORTED_PLATFORM", "The PostgreSQL reference requires POSIX Unix-domain sockets and ownership checks");
  }
  if (typeof requestedRoot !== "string" || !isAbsolute(requestedRoot) || /^[A-Za-z]:[\\/]/u.test(requestedRoot)) {
    fail("PRIVATE_ROOT_NOT_ABSOLUTE", "Prepare requires an explicit absolute POSIX private root");
  }
  if (/[\0\r\n,]/u.test(requestedRoot)) {
    fail("PRIVATE_ROOT_UNSAFE_FOR_SOCKET", "The private root is not safe for one PostgreSQL Unix socket directory");
  }
  rejectSymlinkComponents(requestedRoot);
  if (lstatIfPresent(requestedRoot)) {
    fail("PRIVATE_ROOT_ALREADY_EXISTS", "Prepare requires a new private root and never reuses an existing path");
  }
  const parent = resolve(requestedRoot, "..");
  const parentStatus = lstatIfPresent(parent);
  if (!parentStatus?.isDirectory()) {
    fail("PRIVATE_ROOT_PARENT_INVALID", "The private root parent must already be a real directory");
  }
  const root = join(realpathSync.native(parent), requestedRoot.split(sep).at(-1));
  mkdirSync(root, { mode: privateDirectoryMode });
  chmodSync(root, privateDirectoryMode);
  const rootStatus = statSync(root);
  const ownerMatches = typeof process.getuid === "function" && rootStatus.uid === process.getuid();
  if (realpathSync.native(root) !== root || (rootStatus.mode & 0o777) !== privateDirectoryMode || !ownerMatches) {
    fail("PRIVATE_ROOT_MODE_INVALID", "The PostgreSQL private root could not be proven mode 0700");
  }
  mkdirSync(join(root, paths.socket), { mode: privateDirectoryMode });
  chmodSync(join(root, paths.socket), privateDirectoryMode);
  const descriptor = openSync(
    join(root, paths.events),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    privateMode
  );
  fsyncSync(descriptor);
  closeSync(descriptor);
  return root;
}

function openExistingRoot(requestedRoot, dependencies) {
  if (platform() === "win32" || typeof process.getuid !== "function") {
    fail("UNSUPPORTED_PLATFORM", "The PostgreSQL reference requires POSIX Unix-domain sockets and ownership checks");
  }
  if (typeof requestedRoot !== "string" || !isAbsolute(requestedRoot) || /^[A-Za-z]:[\\/]/u.test(requestedRoot)) {
    fail("PRIVATE_ROOT_NOT_ABSOLUTE", "Status and stop require an explicit absolute POSIX private root");
  }
  rejectSymlinkComponents(requestedRoot);
  const status = lstatIfPresent(requestedRoot);
  if (!status?.isDirectory() || status.isSymbolicLink()) {
    fail("PRIVATE_ROOT_INVALID", "The private PostgreSQL root is missing or is not a real directory");
  }
  const root = realpathSync.native(requestedRoot);
  if ((status.mode & 0o777) !== privateDirectoryMode) {
    fail("PRIVATE_ROOT_MODE_INVALID", "The PostgreSQL private root is not mode 0700");
  }
  if (!ownedByProcess(status, dependencies)) {
    fail("PRIVATE_ROOT_OWNER_INVALID", "The PostgreSQL private root is not owned by the process user");
  }
  return root;
}

function readPrivateJson(root, name) {
  const path = join(root, name);
  const status = lstatIfPresent(path);
  if (!status?.isFile() || status.isSymbolicLink() || status.nlink !== 1 ||
      (status.mode & 0o777) !== privateMode) {
    fail("PRIVATE_STATE_INVALID", "The provisioner state is missing or not protected by mode 0600");
  }
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail("PRIVATE_STATE_INVALID", "The provisioner state is not valid JSON", error);
  }
  return value;
}

function evidenceMajor(protocol) {
  const sources = new Map((protocol.evidenceSources ?? []).map((entry) => [entry.id, entry]));
  const majors = evidenceIds.map((id) => {
    const source = sources.get(id);
    const match = typeof source?.citation === "string" ? source.citation.match(/\/docs\/(\d+)\//u) : null;
    if (!match) fail("PROTOCOL_POSTGRESQL_EVIDENCE_INVALID", "PostgreSQL evidence does not declare a documentation major version");
    return Number(match[1]);
  });
  if (new Set(majors).size !== 1 || !Number.isSafeInteger(majors[0])) {
    fail("PROTOCOL_POSTGRESQL_EVIDENCE_INVALID", "PostgreSQL evidence sources disagree on the major version");
  }
  return majors[0];
}

function safeDatabaseName(cellId) {
  const value = cellId.replace(/-/gu, "_");
  if (!/^[a-z][a-z0-9_]*$/u.test(value) || Buffer.byteLength(value, "utf8") > 63) {
    fail("PROTOCOL_POSTGRESQL_CELL_INVALID", "A PostgreSQL cell cannot be mapped to a safe database name");
  }
  return value;
}

export function derivePostgresProtocolSpec(inspection) {
  if (!inspection?.validation?.valid || !inspection.protocol || !Buffer.isBuffer(inspection.bytes) ||
      !/^[0-9a-f]{64}$/u.test(inspection.sha256 ?? "") || !inspection.sourceRegistration) {
    fail("PROTOCOL_VALIDATION_FAILED", "The committed benchmark protocol did not pass validation and Git registration");
  }
  const protocol = inspection.protocol;
  if (protocol.protocolId !== expectedProtocolId) {
    fail("PROTOCOL_ID_MISMATCH", "The protocol is not the registered HC-CORTEX-002 revision");
  }
  const transport = protocol.resourcePolicy?.limits?.postgresqlLocalTransport;
  const portDeclaration = protocol.resourcePolicy?.limits?.postgresqlSocketPort;
  if (
    transport?.value !== "unix-domain-socket-only; private directory and socket mode 0700; listen_addresses empty; host authentication reject" ||
    !evidenceIds.slice(0, 2).every((id) => transport?.evidenceSourceIds?.includes(id)) ||
    !Number.isSafeInteger(portDeclaration?.value) || portDeclaration.value < 1 || portDeclaration.value > 65535 ||
    !portDeclaration?.evidenceSourceIds?.includes("postgres-local-connections")
  ) {
    fail("PROTOCOL_POSTGRESQL_POLICY_INVALID", "The protocol does not declare the required local PostgreSQL isolation policy");
  }
  const byId = new Map(protocol.plannedCells.map((cell) => [cell.id, cell]));
  const cells = protocol.workload.cellOrder
    .map((id) => byId.get(id))
    .filter((cell) => cell?.parameters?.backend === "postgresql")
    .map((cell) => ({ id: cell.id, database: safeDatabaseName(cell.id) }));
  if (cells.length === 0 || new Set(cells.map((cell) => cell.id)).size !== cells.length ||
      new Set(cells.map((cell) => cell.database)).size !== cells.length) {
    fail("PROTOCOL_POSTGRESQL_MATRIX_INVALID", "The protocol does not define a unique PostgreSQL cell matrix");
  }
  return {
    cells,
    expectedMajor: evidenceMajor(protocol),
    port: portDeclaration.value,
    protocol: {
      id: protocol.protocolId,
      sha256: inspection.sha256,
      bytes: inspection.bytes.length,
      sourceRegistration: inspection.sourceRegistration
    }
  };
}

function parseVersion(command, output, expectedMajor) {
  const match = output.match(/\b(\d+)(?:\.(\d+))+(?:\b|$)/u);
  if (!match || Number(match[1]) !== expectedMajor) {
    fail("POSTGRESQL_VERSION_MISMATCH", `${command} is not from the protocol-declared PostgreSQL major version`);
  }
  return { major: Number(match[1]), version: match[0] };
}

function probeVersions(context, expectedMajor) {
  return Object.fromEntries(binaryNames.map((command) => {
    const result = execute(context, command, ["--version"], `version-${command}`);
    return [command, parseVersion(command, `${result.stdout}\n${result.stderr}`, expectedMajor)];
  }));
}

function quoteConfigurationValue(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function configureCluster(context, port) {
  const configuration = join(context.root, paths.cluster, "postgresql.conf");
  const status = lstatIfPresent(configuration);
  if (!status?.isFile() || status.isSymbolicLink()) {
    fail("POSTGRESQL_INITIALIZATION_INVALID", "initdb did not produce a regular PostgreSQL configuration file");
  }
  appendFileSync(configuration, [
    "",
    "# HC-CORTEX-002 protocol-bound local reference service",
    "listen_addresses = ''",
    `unix_socket_directories = ${quoteConfigurationValue(join(context.root, paths.socket))}`,
    "unix_socket_permissions = 0700",
    `port = ${port}`,
    ""
  ].join("\n"), "utf8");
}

function psqlArguments(context, port, database, query) {
  return [
    "--no-password",
    "--host", join(context.root, paths.socket),
    "--port", String(port),
    "--dbname", database,
    "--tuples-only",
    "--no-align",
    "--set", "ON_ERROR_STOP=1",
    "--command", query
  ];
}

function parseCommandJson(result, phase) {
  try {
    const value = JSON.parse(result.stdout.trim());
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("object required");
    return value;
  } catch (error) {
    fail("POSTGRESQL_VERIFICATION_INVALID", `PostgreSQL returned invalid verification data during ${phase}`, error);
  }
}

function canonicalUtcTimestamp(value, phase) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    fail("POSTGRESQL_VERIFICATION_INVALID", `PostgreSQL returned an invalid timestamp during ${phase}`);
  }
  return new Date(parsed).toISOString();
}

function ownedByProcess(status, dependencies) {
  if (typeof dependencies.isOwnedByProcess === "function") {
    return dependencies.isOwnedByProcess(status) === true;
  }
  return typeof process.getuid === "function" && status.uid === process.getuid();
}

function verifyLiveService(context, spec) {
  const result = execute(
    context,
    "psql",
    psqlArguments(context, spec.port, "postgres", settingsQuery),
    "verify-live-settings"
  );
  const observed = parseCommandJson(result, "live settings verification");
  const socket = join(context.root, paths.socket);
  let socketStatus;
  try {
    socketStatus = (context.dependencies.lstatSocketDirectory ?? lstatSync)(socket);
  } catch (error) {
    fail("POSTGRESQL_ISOLATION_VERIFICATION_FAILED", "PostgreSQL did not expose its registered Unix socket directory", error);
  }
  const socketMode = socketStatus.mode & 0o777;
  const directoryOwnerMatches = ownedByProcess(socketStatus, context.dependencies);
  const liveSocketPath = join(socket, `.s.PGSQL.${spec.port}`);
  let liveSocketStatus;
  try {
    liveSocketStatus = (context.dependencies.lstatSocket ?? lstatSync)(liveSocketPath);
  } catch (error) {
    fail("POSTGRESQL_ISOLATION_VERIFICATION_FAILED", "PostgreSQL did not expose its registered Unix socket", error);
  }
  const liveSocketMode = liveSocketStatus.mode & 0o777;
  const liveSocketOwnerMatches = ownedByProcess(liveSocketStatus, context.dependencies);
  const versionMatches = typeof observed.serverVersion === "string" &&
    new RegExp(`^${spec.expectedMajor}(?:\\.|$)`, "u").test(observed.serverVersion);
  if (
    !versionMatches || !/^\d+$/u.test(String(observed.serverVersionNum ?? "")) ||
    observed.listenAddresses !== "" || observed.socketDirectories !== socket ||
    observed.socketPermissions !== "0700" || Number(observed.port) !== spec.port ||
    typeof observed.postmasterStartedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(observed.postmasterStartedAt) ||
    observed.serverInetAddress !== null ||
    socketStatus.isSymbolicLink() || !socketStatus.isDirectory() || realpathSync.native(socket) !== socket ||
    socketMode !== privateDirectoryMode || directoryOwnerMatches !== true ||
    liveSocketStatus.isSymbolicLink() || !liveSocketStatus.isSocket() ||
    liveSocketMode !== privateDirectoryMode || liveSocketOwnerMatches !== true ||
    Number(observed.hbaErrors) !== 0 ||
    JSON.stringify(observed.hbaLocalRuleMethods) !== JSON.stringify(["trust"]) ||
    JSON.stringify(observed.hbaHostRuleMethods) !== JSON.stringify(["reject"])
  ) {
    fail("POSTGRESQL_ISOLATION_VERIFICATION_FAILED", "The live PostgreSQL service does not match the preregistered local isolation policy");
  }
  return {
    postmasterStartedAt: canonicalUtcTimestamp(observed.postmasterStartedAt, "live settings verification"),
    serverVersion: observed.serverVersion,
    serverVersionNum: String(observed.serverVersionNum),
    serverInetAddress: null,
    socketDirectoryIdentitySha256: sha256(Buffer.from(realpathSync.native(socket), "utf8")),
    socketDirectoryMode: "0700",
    socketDirectoryOwnerMatchesProcessUser: true,
    unixSocketMode: "0700",
    socketOwnerMatchesProcessUser: true,
    hostRuleMethods: observed.hbaHostRuleMethods,
    localRuleMethods: observed.hbaLocalRuleMethods,
    parseErrorCount: 0
  };
}

function readPostmasterPid(root) {
  const path = join(root, paths.cluster, "postmaster.pid");
  const status = lstatIfPresent(path);
  if (!status?.isFile() || status.isSymbolicLink() || status.nlink !== 1) {
    fail("POSTGRESQL_PROCESS_ID_INVALID", "PostgreSQL did not expose a regular postmaster PID file");
  }
  const firstLine = readFileSync(path, "utf8").split("\n", 1)[0];
  if (!/^[1-9]\d*$/u.test(firstLine)) {
    fail("POSTGRESQL_PROCESS_ID_INVALID", "PostgreSQL did not expose a valid postmaster process ID");
  }
  const processId = Number(firstLine);
  if (!Number.isSafeInteger(processId)) {
    fail("POSTGRESQL_PROCESS_ID_INVALID", "PostgreSQL postmaster process ID exceeds the safe integer range");
  }
  return processId;
}

function verifyFreshDatabase(context, spec, cell) {
  const result = execute(
    context,
    "psql",
    psqlArguments(context, spec.port, cell.database, databaseQuery),
    `verify-database-${cell.id}`
  );
  const observed = parseCommandJson(result, `database verification for ${cell.id}`);
  if (observed.currentDatabase !== cell.database || Number(observed.userRelationCount) !== 0) {
    fail("POSTGRESQL_DATABASE_NOT_FRESH", "A provisioned PostgreSQL cell database is not fresh and empty");
  }
}

function bindingUrl(root, port, database) {
  const query = new URLSearchParams({
    host: join(root, paths.socket),
    port: String(port),
    sslmode: "disable"
  });
  return `postgresql:///${encodeURIComponent(database)}?${query.toString()}`;
}

function assertPublicSafe(value, root) {
  const strings = [];
  const visit = (entry) => {
    if (typeof entry === "string") strings.push(entry);
    else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === "object") Object.values(entry).forEach(visit);
  };
  visit(value);
  if (strings.some((entry) => entry.includes(root) || /^postgres(?:ql)?:\/\//iu.test(entry) ||
      isAbsolute(entry) || win32.isAbsolute(entry) || /(?:password|passfile|secret)=/iu.test(entry))) {
    fail("PUBLIC_RECEIPT_PRIVACY_VIOLATION", "The public PostgreSQL receipt contains private connection material");
  }
}

function stateValue(spec, versions, status, extra = {}) {
  return {
    schemaVersion: stateSchemaVersion,
    protocol: spec.protocol,
    expectedMajor: spec.expectedMajor,
    port: spec.port,
    status,
    versions,
    cells: spec.cells,
    ...extra
  };
}

function writeState(context, state) {
  writeJson(join(context.root, paths.state), state, privateMode, !existsSync(join(context.root, paths.state)));
}

function stopAfterPrepareFailure(context) {
  if (!context.startAttempted) return false;
  let result;
  try {
    result = normalizeResult((context.dependencies.runCommand ?? defaultRunCommand)(
      "pg_ctl",
      ["--pgdata", join(context.root, paths.cluster), "--wait", "--mode=fast", "stop"],
      {
        cwd: context.root,
        environment: sanitizedEnvironment(),
        phase: "failure-stop"
      }
    ));
  } catch (error) {
    result = normalizeResult({ error });
  }
  appendEvent(context, {
    type: "command",
    phase: "failure-stop",
    command: "pg_ctl",
    arguments: ["--pgdata", join(context.root, paths.cluster), "--wait", "--mode=fast", "stop"],
    result: {
      errorName: result.error?.name ?? null,
      signal: result.signal,
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout
    }
  });
  return !result.error && result.signal === null && [0, 3].includes(result.status);
}

function databaseIdentity(root, port, database) {
  return sha256(Buffer.from(`${realpathSync.native(join(root, paths.socket))}:${port}/${database}`, "utf8"));
}

function publicReceipt(root, spec, live, processId, serviceInstanceId) {
  return {
    schemaVersion: serviceReceiptSchemaVersion,
    protocolId: spec.protocol.id,
    protocolSha256: spec.protocol.sha256,
    serviceInstanceId,
    startedAt: live.postmasterStartedAt,
    postgresVersion: live.serverVersion,
    processId,
    configuration: {
      listenAddresses: "",
      unixSocketMode: live.unixSocketMode,
      socketDirectoryMode: live.socketDirectoryMode,
      socketDirectoryIdentitySha256: live.socketDirectoryIdentitySha256,
      socketDirectoryOwnerMatchesProcessUser: live.socketDirectoryOwnerMatchesProcessUser,
      socketOwnerMatchesProcessUser: live.socketOwnerMatchesProcessUser,
      port: spec.port,
      connectedViaUnixSocket: true,
      serverInetAddress: live.serverInetAddress
    },
    hostAuthentication: {
      localRuleMethods: live.localRuleMethods,
      hostRuleMethods: live.hostRuleMethods,
      parseErrorCount: live.parseErrorCount,
      passwordMaterialRecorded: false
    },
    cells: spec.cells.map(({ id, database }) => ({
      cellId: id,
      databaseIdentitySha256: databaseIdentity(root, spec.port, database),
      createdFrom: "template0",
      fresh: true
    }))
  };
}

export function preparePostgresReference(options, dependencies = {}) {
  let context = null;
  let spec = null;
  let versions = null;
  try {
    const inspection = (dependencies.loadBenchmarkProtocol ?? loadBenchmarkProtocol)(options?.protocol);
    spec = derivePostgresProtocolSpec(inspection);
    const root = prepareNewRoot(options?.root);
    context = { dependencies, eventSequence: 1, root, startAttempted: false };
    appendEvent(context, { type: "lifecycle", phase: "prepare", status: "started" });
    versions = probeVersions(context, spec.expectedMajor);
    writeState(context, stateValue(spec, versions, "preparing"));

    writeJson(join(root, paths.log), null, privateMode, true);
    const logDescriptor = openSync(join(root, paths.log), constants.O_WRONLY | constants.O_TRUNC);
    fsyncSync(logDescriptor);
    closeSync(logDescriptor);

    execute(context, "initdb", [
      "--pgdata", join(root, paths.cluster),
      "--auth-local=trust",
      "--auth-host=reject",
      "--no-instructions"
    ], "initialize-cluster");
    chmodSync(join(root, paths.cluster), privateDirectoryMode);
    configureCluster(context, spec.port);

    context.startAttempted = true;
    execute(context, "pg_ctl", [
      "--pgdata", join(root, paths.cluster),
      "--log", join(root, paths.log),
      "--wait",
      "start"
    ], "start-service");
    const live = verifyLiveService(context, spec);
    const processId = readPostmasterPid(root);
    const serviceInstanceId = sha256(Buffer.from(
      `${spec.protocol.sha256}:${realpathSync.native(join(root, paths.socket))}:${spec.port}:${processId}:${live.postmasterStartedAt}`,
      "utf8"
    ));

    for (const cell of spec.cells) {
      execute(context, "createdb", [
        "--no-password",
        "--host", join(root, paths.socket),
        "--port", String(spec.port),
        "--template", "template0",
        cell.database
      ], `create-database-${cell.id}`);
      verifyFreshDatabase(context, spec, cell);
    }

    const runnerArguments = spec.cells.flatMap((cell) => [
      "--database",
      `${cell.id}=${bindingUrl(root, spec.port, cell.database)}`
    ]);
    const bindings = {
      schemaVersion: bindingSchemaVersion,
      protocol: spec.protocol,
      runnerArguments,
      cells: spec.cells.map((cell) => ({
        id: cell.id,
        database: cell.database,
        binding: bindingUrl(root, spec.port, cell.database)
      }))
    };
    writeJson(join(root, paths.bindings), bindings, privateMode, true);
    const readyState = stateValue(spec, versions, "ready", {
      pid: processId,
      serviceInstanceId,
      startedAt: live.postmasterStartedAt
    });
    writeState(context, readyState);
    const receipt = publicReceipt(root, spec, live, processId, serviceInstanceId);
    assertPublicSafe(receipt, root);
    appendEvent(context, { type: "lifecycle", phase: "prepare", status: "ready", pid: processId });
    // No fallible lifecycle mutation follows the public receipt: a present receipt is terminal READY evidence.
    writeJson(join(root, paths.receipt), receipt, publicMode, true);
    return receipt;
  } catch (error) {
    if (context) {
      const serviceStoppedAfterFailure = stopAfterPrepareFailure(context);
      try {
        appendEvent(context, {
          type: "lifecycle",
          phase: "prepare",
          status: "failed",
          errorCode: error?.code ?? "POSTGRESQL_PREPARE_FAILED",
          serviceStoppedAfterFailure
        });
        if (spec) {
          writeState(context, stateValue(spec, versions, "failed", { serviceStoppedAfterFailure }));
        }
      } catch {
        // The original fail-closed error remains authoritative; the private root is preserved.
      }
    }
    if (error instanceof PostgresProvisionerError) throw error;
    fail("POSTGRESQL_PREPARE_FAILED", "PostgreSQL reference preparation failed", error);
  }
}

function loadState(root) {
  const state = readPrivateJson(root, paths.state);
  if (
    state?.schemaVersion !== stateSchemaVersion || state?.protocol?.id !== expectedProtocolId ||
    !Number.isSafeInteger(state.expectedMajor) || !Number.isSafeInteger(state.port) ||
    !Array.isArray(state.cells) || !["preparing", "ready", "failed", "stopped"].includes(state.status)
  ) {
    fail("PRIVATE_STATE_INVALID", "The private provisioner state has an unsupported contract");
  }
  return state;
}

function lifecycleContext(root, dependencies) {
  return { dependencies, eventSequence: readFileSync(join(root, paths.events), "utf8").split("\n").filter(Boolean).length + 1, root };
}

function serviceStatus(context) {
  const result = execute(
    context,
    "pg_ctl",
    ["--pgdata", join(context.root, paths.cluster), "status"],
    "status-service",
    [0, 3]
  );
  return result.status === 0 ? "running" : "stopped";
}

function statusReceipt(state, service, live = null) {
  return {
    schemaVersion: provisionSchemaVersion,
    status: service,
    protocolId: state.protocol.id,
    protocolSha256: state.protocol.sha256,
    serviceInstanceId: state.serviceInstanceId ?? null,
    processId: live?.pid ?? state.pid ?? null,
    startedAt: live?.postmasterStartedAt ?? state.startedAt ?? null,
    isolationConfigurationVerified: live === null ? null : true,
    clusterEvidencePreserved: true,
    destructiveCleanupPerformed: false
  };
}

export function statusPostgresReference(options, dependencies = {}) {
  try {
    const root = openExistingRoot(options?.root, dependencies);
    const context = lifecycleContext(root, dependencies);
    const state = loadState(root);
    const service = serviceStatus(context);
    let live = null;
    if (service === "running") {
      live = verifyLiveService(context, {
        expectedMajor: state.expectedMajor,
        port: state.port
      });
      const processId = readPostmasterPid(root);
      if ((Number.isSafeInteger(state.pid) && state.pid !== processId) ||
          (typeof state.startedAt === "string" && state.startedAt !== live.postmasterStartedAt)) {
        fail("POSTGRESQL_SERVICE_IDENTITY_MISMATCH", "The running PostgreSQL process does not match the provisioned service identity");
      }
      live.pid = processId;
    }
    const receipt = statusReceipt(state, service, live);
    assertPublicSafe(receipt, root);
    return receipt;
  } catch (error) {
    if (error instanceof PostgresProvisionerError) throw error;
    fail("POSTGRESQL_STATUS_FAILED", "PostgreSQL reference status inspection failed", error);
  }
}

export function stopPostgresReference(options, dependencies = {}) {
  try {
    const root = openExistingRoot(options?.root, dependencies);
    const context = lifecycleContext(root, dependencies);
    const state = loadState(root);
    const before = serviceStatus(context);
    if (before === "running") {
      execute(context, "pg_ctl", [
        "--pgdata", join(root, paths.cluster),
        "--wait",
        "--mode=fast",
        "stop"
      ], "stop-service");
      if (serviceStatus(context) !== "stopped") {
        fail("POSTGRESQL_STOP_UNVERIFIED", "PostgreSQL did not reach a verified stopped state");
      }
    }
    writeState(context, { ...state, status: "stopped" });
    appendEvent(context, { type: "lifecycle", phase: "stop", status: "stopped", alreadyStopped: before === "stopped" });
    const receipt = {
      ...statusReceipt({ ...state, status: "stopped" }, "stopped"),
      alreadyStopped: before === "stopped"
    };
    assertPublicSafe(receipt, root);
    return receipt;
  } catch (error) {
    if (error instanceof PostgresProvisionerError) throw error;
    fail("POSTGRESQL_STOP_FAILED", "PostgreSQL reference stop failed", error);
  }
}

export function postgresProvisionerErrorResult(error) {
  const known = error instanceof PostgresProvisionerError;
  return {
    schemaVersion: provisionSchemaVersion,
    status: "failed",
    error: {
      code: known ? error.code : "POSTGRESQL_PROVISIONER_FAILED",
      message: known ? error.message : "PostgreSQL provisioner failed"
    }
  };
}
