import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PostgresProvisionerError,
  derivePostgresProtocolSpec,
  postgresProvisionerErrorResult,
  preparePostgresReference,
  serviceReceiptSchemaVersion,
  statusPostgresReference,
  stopPostgresReference
} from "./hc-cortex-002-postgresql-lib.mjs";

const repositoryRoot = realpathSync(fileURLToPath(new URL("../", import.meta.url)));
const protocolPath = join(repositoryRoot, "protocols/2026-08-30-hc-cortex-002-v1.json");
const originalProtocol = JSON.parse(readFileSync(protocolPath, "utf8"));
const temporaryRoots = [];
const fixedTime = "2026-08-31T00:00:00.000Z";

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function temporaryParent() {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "hc-cortex-002-pg-test-")));
  temporaryRoots.push(root);
  return root;
}

function inspection(protocol = originalProtocol, validation = { valid: true, errors: [] }) {
  const bytes = Buffer.from(JSON.stringify(protocol), "utf8");
  return {
    validation,
    protocol,
    bytes,
    sha256: sha256(bytes),
    sourceRegistration: {
      repository: "https://github.com/cdeust/harness-comparison.git",
      revision: "a".repeat(40),
      path: "protocols/2026-08-30-hc-cortex-002-v1.json"
    }
  };
}

function valueAfter(arguments_, flag) {
  const index = arguments_.indexOf(flag);
  assert.notEqual(index, -1, `missing ${flag}`);
  return arguments_[index + 1];
}

class FakePostgres {
  constructor(options = {}) {
    this.commands = [];
    this.created = [];
    this.failPhase = options.failPhase ?? null;
    this.pid = options.pid ?? 43117;
    this.running = false;
    this.version = options.version ?? "17.9";
    this.socketMode = options.socketMode ?? 0o700;
    this.socketType = options.socketType ?? "socket";
    this.socketOwner = options.socketOwner ?? true;
    this.socketDirectoryOwner = options.socketDirectoryOwner ?? true;
    this.postmasterStartedAt = options.postmasterStartedAt ?? "2026-08-31T00:00:00+00:00";
  }

  run = (command, arguments_, context) => {
    this.commands.push({
      command,
      arguments: [...arguments_],
      environment: { ...context.environment },
      phase: context.phase
    });
    if (arguments_.includes("--version")) {
      return { status: 0, signal: null, stdout: `${command} (PostgreSQL) ${this.version}\n`, stderr: "" };
    }
    if (command === "initdb") {
      const cluster = valueAfter(arguments_, "--pgdata");
      mkdirSync(cluster, { mode: 0o700 });
      writeFileSync(join(cluster, "postgresql.conf"), "# fake initdb configuration\n", "utf8");
      writeFileSync(join(cluster, "pg_hba.conf"), "local all all trust\nhost all all 127.0.0.1/32 reject\n", "utf8");
      return this.result(context.phase);
    }
    if (command === "pg_ctl" && arguments_.includes("start")) {
      this.running = true;
      writeFileSync(join(valueAfter(arguments_, "--pgdata"), "postmaster.pid"), `${this.pid}\n`, "utf8");
      return this.result(context.phase);
    }
    if (command === "pg_ctl" && arguments_.includes("stop")) {
      this.running = false;
      return { status: 0, signal: null, stdout: "server stopped\n", stderr: "" };
    }
    if (command === "pg_ctl" && arguments_.includes("status")) {
      return {
        status: this.running ? 0 : 3,
        signal: null,
        stdout: this.running ? "server is running\n" : "no server running\n",
        stderr: ""
      };
    }
    if (command === "createdb") {
      const database = arguments_.at(-1);
      if (!this.created.includes(database)) this.created.push(database);
      return this.result(context.phase);
    }
    if (command === "psql") {
      const database = valueAfter(arguments_, "--dbname");
      const socket = valueAfter(arguments_, "--host");
      const port = valueAfter(arguments_, "--port");
      const query = valueAfter(arguments_, "--command");
      if (query.includes("serverVersionNum")) {
        return {
          status: 0,
          signal: null,
          stderr: "",
          stdout: `${JSON.stringify({
            serverVersion: this.version,
            serverVersionNum: "170009",
            listenAddresses: "",
            socketDirectories: socket,
            socketPermissions: "0700",
            port,
            postmasterStartedAt: this.postmasterStartedAt,
            serverInetAddress: null,
            hbaErrors: 0,
            hbaLocalRuleMethods: ["trust"],
            hbaHostRuleMethods: ["reject"]
          })}\n`
        };
      }
      assert.match(query, /currentDatabase/u);
      return {
        status: 0,
        signal: null,
        stderr: "",
        stdout: `${JSON.stringify({
          currentDatabase: database,
          userRelationCount: this.failPhase === context.phase ? 1 : 0
        })}\n`
      };
    }
    throw new Error(`unexpected fake command: ${command}`);
  };

  result(phase) {
    if (phase === this.failPhase) {
      return {
        status: 1,
        signal: null,
        stdout: "",
        stderr: "failed at /private/secret-root with postgresql://user:secret@localhost/private\n"
      };
    }
    return { status: 0, signal: null, stdout: "ok\n", stderr: "" };
  }
}

function dependencies(fake, protocolInspection = inspection()) {
  return {
    loadBenchmarkProtocol: () => protocolInspection,
    now: () => fixedTime,
    runCommand: fake.run,
    isOwnedByProcess: (status) => status.ownerMatches !== false,
    lstatSocketDirectory: (path) => {
      const status = lstatSync(path);
      status.ownerMatches = fake.socketDirectoryOwner;
      return status;
    },
    lstatSocket: () => ({
      isSocket: () => fake.socketType === "socket",
      isSymbolicLink: () => fake.socketType === "symlink",
      mode: fake.socketMode,
      ownerMatches: fake.socketOwner
    })
  };
}

function mode(path) {
  return statSync(path).mode & 0o777;
}

function prepare(fake = new FakePostgres(), protocolInspection = inspection()) {
  const parent = temporaryParent();
  const root = join(parent, "private-service");
  const receipt = preparePostgresReference(
    { protocol: protocolPath, root },
    dependencies(fake, protocolInspection)
  );
  return { fake, parent, receipt, root };
}

test("derives the exact eight-cell PostgreSQL matrix and protocol port", () => {
  const spec = derivePostgresProtocolSpec(inspection());
  assert.equal(spec.port, 5432);
  assert.equal(spec.expectedMajor, 17);
  assert.deepEqual(spec.cells.map((cell) => cell.id), [
    "main-r1-postgresql-c1",
    "main-r1-postgresql-c2",
    "main-r1-postgresql-c4",
    "main-r1-postgresql-c5",
    "main-r2-postgresql-c1",
    "main-r2-postgresql-c2",
    "main-r2-postgresql-c4",
    "main-r2-postgresql-c5"
  ]);
  assert.equal(new Set(spec.cells.map((cell) => cell.database)).size, 8);
});

test("prepares one template0 database per cell and separates public from private data", () => {
  const { fake, receipt, root } = prepare();
  const socket = realpathSync(join(root, "socket"));
  const spec = derivePostgresProtocolSpec(inspection());

  assert.equal(receipt.schemaVersion, serviceReceiptSchemaVersion);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "cells", "configuration", "hostAuthentication", "postgresVersion", "processId", "protocolId",
    "protocolSha256", "schemaVersion", "serviceInstanceId", "startedAt"
  ].sort());
  assert.equal(receipt.startedAt, fixedTime);
  assert.equal(receipt.postgresVersion, "17.9");
  assert.equal(receipt.processId, fake.pid);
  assert.deepEqual(receipt.configuration, {
    listenAddresses: "",
    unixSocketMode: "0700",
    socketDirectoryMode: "0700",
    socketDirectoryIdentitySha256: sha256(socket),
    socketDirectoryOwnerMatchesProcessUser: true,
    socketOwnerMatchesProcessUser: true,
    port: 5432,
    connectedViaUnixSocket: true,
    serverInetAddress: null
  });
  assert.deepEqual(receipt.hostAuthentication, {
    localRuleMethods: ["trust"],
    hostRuleMethods: ["reject"],
    parseErrorCount: 0,
    passwordMaterialRecorded: false
  });
  assert.deepEqual(receipt.cells, spec.cells.map((cell) => ({
    cellId: cell.id,
    databaseIdentitySha256: sha256(`${socket}:5432/${cell.database}`),
    createdFrom: "template0",
    fresh: true
  })));

  assert.deepEqual(fake.created, spec.cells.map((cell) => cell.database));
  const createCalls = fake.commands.filter((entry) => entry.command === "createdb" && !entry.arguments.includes("--version"));
  assert.equal(createCalls.length, 8);
  for (const [index, call] of createCalls.entries()) {
    assert.deepEqual(call.arguments, [
      "--no-password", "--host", socket, "--port", "5432", "--template", "template0",
      spec.cells[index].database
    ]);
  }

  const bindings = JSON.parse(readFileSync(join(root, "runner-bindings.json"), "utf8"));
  assert.equal(bindings.runnerArguments.length, 16);
  assert.deepEqual(bindings.runnerArguments.filter((_, index) => index % 2 === 0), Array(8).fill("--database"));
  for (const [index, cell] of spec.cells.entries()) {
    const value = bindings.runnerArguments[index * 2 + 1];
    assert.match(value, new RegExp(`^${cell.id}=postgresql:///`, "u"));
    assert.ok(value.includes(encodeURIComponent(socket)));
    assert.ok(value.includes("port=5432"));
    assert.ok(value.includes("sslmode=disable"));
  }

  const publicBytes = readFileSync(join(root, "postgresql-service-receipt.json"), "utf8");
  assert.equal(publicBytes, `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(publicBytes.includes(root), false);
  assert.equal(publicBytes.includes("postgresql:///"), false);
  for (const cell of spec.cells) assert.equal(publicBytes.includes(cell.database), false);
  assert.ok(readFileSync(join(root, "runner-bindings.json"), "utf8").includes(encodeURIComponent(root)));
});

test("enforces private modes and local-only server configuration", () => {
  const { fake, root } = prepare();
  assert.equal(mode(root), 0o700);
  assert.equal(mode(join(root, "socket")), 0o700);
  assert.equal(mode(join(root, "cluster")), 0o700);
  assert.equal(mode(join(root, "runner-bindings.json")), 0o600);
  assert.equal(mode(join(root, "provisioner-state.json")), 0o600);
  assert.equal(mode(join(root, "provision-events.jsonl")), 0o600);
  assert.equal(mode(join(root, "postgresql.log")), 0o600);
  assert.equal(mode(join(root, "postgresql-service-receipt.json")), 0o644);

  const init = fake.commands.find((entry) => entry.command === "initdb" && !entry.arguments.includes("--version"));
  assert.ok(init);
  assert.ok(init.arguments.includes("--auth-local=trust"));
  assert.ok(init.arguments.includes("--auth-host=reject"));
  const configuration = readFileSync(join(root, "cluster/postgresql.conf"), "utf8");
  assert.match(configuration, /listen_addresses = ''/u);
  assert.match(configuration, /unix_socket_permissions = 0700/u);
  assert.match(configuration, /port = 5432/u);
  assert.ok(configuration.includes(`unix_socket_directories = '${join(root, "socket")}'`));
  assert.equal(fake.commands.some((entry) => entry.arguments.some((value) => value === "localhost" || value === "127.0.0.1")), false);
});

test("fails closed when the live Unix socket type, mode, or owner is not proven", () => {
  for (const options of [
    { socketType: "file" },
    { socketType: "symlink" },
    { socketMode: 0o777 },
    { socketOwner: false }
  ]) {
    const parent = temporaryParent();
    const root = join(parent, `invalid-socket-${Object.keys(options)[0]}-${String(Object.values(options)[0])}`);
    const fake = new FakePostgres(options);
    assert.throws(
      () => preparePostgresReference({ protocol: protocolPath, root }, dependencies(fake)),
      (error) => error.code === "POSTGRESQL_ISOLATION_VERIFICATION_FAILED"
    );
    assert.equal(fake.running, false);
    assert.equal(existsSync(join(root, "postgresql-service-receipt.json")), false);
  }
});

test("status rejects a replaced, permissive, or unowned Unix socket directory", () => {
  {
    const { fake, root } = prepare();
    const socket = join(root, "socket");
    const moved = join(root, "socket-moved");
    renameSync(socket, moved);
    symlinkSync(moved, socket, "dir");
    assert.throws(
      () => statusPostgresReference({ root }, dependencies(fake)),
      (error) => error.code === "POSTGRESQL_ISOLATION_VERIFICATION_FAILED"
    );
  }
  {
    const { fake, root } = prepare();
    chmodSync(join(root, "socket"), 0o755);
    assert.throws(
      () => statusPostgresReference({ root }, dependencies(fake)),
      (error) => error.code === "POSTGRESQL_ISOLATION_VERIFICATION_FAILED"
    );
  }
  {
    const { fake, root } = prepare();
    fake.socketDirectoryOwner = false;
    assert.throws(
      () => statusPostgresReference({ root }, dependencies(fake)),
      (error) => error.code === "POSTGRESQL_ISOLATION_VERIFICATION_FAILED"
    );
  }
});

test("rejects invalid, mismatched, and non-registered protocols before creating a root", () => {
  const parent = temporaryParent();
  const cases = [
    inspection(originalProtocol, { valid: false, errors: [{ code: "UNCOMMITTED" }] }),
    inspection({ ...originalProtocol, protocolId: "different-protocol" }),
    { ...inspection(), sourceRegistration: null }
  ];
  for (const [index, protocolInspection] of cases.entries()) {
    const root = join(parent, `case-${index}`);
    assert.throws(
      () => preparePostgresReference(
        { protocol: protocolPath, root },
        dependencies(new FakePostgres(), protocolInspection)
      ),
      PostgresProvisionerError
    );
    assert.equal(existsSync(root), false);
  }
});

test("refuses existing and symlink private roots without reuse", () => {
  const parent = temporaryParent();
  const existing = join(parent, "existing");
  mkdirSync(existing, { mode: 0o700 });
  assert.throws(
    () => preparePostgresReference(
      { protocol: protocolPath, root: existing },
      dependencies(new FakePostgres())
    ),
    (error) => error.code === "PRIVATE_ROOT_ALREADY_EXISTS"
  );

  const target = join(parent, "target");
  mkdirSync(target, { mode: 0o700 });
  const link = join(parent, "linked-root");
  symlinkSync(target, link, "dir");
  assert.throws(
    () => preparePostgresReference(
      { protocol: protocolPath, root: link },
      dependencies(new FakePostgres())
    ),
    (error) => error.code === "UNSAFE_PRIVATE_ROOT"
  );
});

test("requires the protocol-declared PostgreSQL major across all binaries", () => {
  const parent = temporaryParent();
  const root = join(parent, "wrong-version");
  assert.throws(
    () => preparePostgresReference(
      { protocol: protocolPath, root },
      dependencies(new FakePostgres({ version: "16.4" }))
    ),
    (error) => error.code === "POSTGRESQL_VERSION_MISMATCH"
  );
  const state = JSON.parse(readFileSync(join(root, "provisioner-state.json"), "utf8"));
  assert.equal(state.status, "failed");
  assert.equal(existsSync(join(root, "postgresql-service-receipt.json")), false);
});

test("attempts a fail-closed stop when pg_ctl start reports failure and preserves evidence", () => {
  const parent = temporaryParent();
  const root = join(parent, "start-failure");
  const fake = new FakePostgres({ failPhase: "start-service" });
  let error;
  try {
    preparePostgresReference({ protocol: protocolPath, root }, dependencies(fake));
  } catch (caught) {
    error = caught;
  }
  assert.equal(error.code, "POSTGRESQL_COMMAND_FAILED");
  assert.equal(fake.running, false);
  assert.ok(fake.commands.some((entry) => entry.phase === "failure-stop" && entry.arguments.includes("stop")));
  const state = JSON.parse(readFileSync(join(root, "provisioner-state.json"), "utf8"));
  assert.equal(state.status, "failed");
  assert.equal(state.serviceStoppedAfterFailure, true);
  assert.equal(existsSync(join(root, "cluster")), true);
  assert.equal(existsSync(join(root, "provision-events.jsonl")), true);
  assert.equal(existsSync(join(root, "postgresql-service-receipt.json")), false);

  const publicError = JSON.stringify(postgresProvisionerErrorResult(error));
  assert.equal(publicError.includes(root), false);
  assert.equal(publicError.includes("secret"), false);
  assert.equal(publicError.includes("postgresql://"), false);
});

test("stops after a post-start freshness failure without deleting the cluster", () => {
  const parent = temporaryParent();
  const root = join(parent, "freshness-failure");
  const fake = new FakePostgres({ failPhase: "verify-database-main-r1-postgresql-c1" });
  assert.throws(
    () => preparePostgresReference({ protocol: protocolPath, root }, dependencies(fake)),
    (error) => error.code === "POSTGRESQL_DATABASE_NOT_FRESH"
  );
  assert.equal(fake.running, false);
  assert.equal(existsSync(join(root, "cluster/postgresql.conf")), true);
  assert.equal(existsSync(join(root, "postgresql-service-receipt.json")), false);
});

test("reports running status, stops non-destructively, and reports explicit repeated stop", () => {
  const { fake, root } = prepare();
  const deps = dependencies(fake);
  const running = statusPostgresReference({ root }, deps);
  assert.equal(running.status, "running");
  assert.equal(running.isolationConfigurationVerified, true);
  assert.equal(JSON.stringify(running).includes(root), false);

  const stopped = stopPostgresReference({ root }, deps);
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.alreadyStopped, false);
  assert.equal(fake.running, false);
  assert.equal(existsSync(join(root, "cluster/postgresql.conf")), true);
  assert.equal(existsSync(join(root, "runner-bindings.json")), true);

  const status = statusPostgresReference({ root }, deps);
  assert.equal(status.status, "stopped");
  const repeated = stopPostgresReference({ root }, deps);
  assert.equal(repeated.status, "stopped");
  assert.equal(repeated.alreadyStopped, true);
  assert.equal(JSON.parse(readFileSync(join(root, "provisioner-state.json"), "utf8")).status, "stopped");
});

test("CLI errors never echo a private root", () => {
  const privateRoot = resolve(temporaryParent(), "secret-private-root");
  const result = spawnSync(process.execPath, [
    join(repositoryRoot, "scripts/provision-hc-cortex-002-postgresql.mjs"),
    "status",
    "--root",
    privateRoot
  ], { encoding: "utf8" });
  assert.equal(result.status, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.status, "failed");
  assert.equal(result.stderr.includes(privateRoot), false);
  assert.equal(result.stdout, "");
});

test("status rejects a root whose private mode was weakened", () => {
  const { fake, root } = prepare();
  chmodSync(root, 0o755);
  assert.throws(
    () => statusPostgresReference({ root }, dependencies(fake)),
    (error) => error.code === "PRIVATE_ROOT_MODE_INVALID"
  );
});

test("status rejects a private root not owned by the process user", () => {
  const { fake, root } = prepare();
  const deps = { ...dependencies(fake), isOwnedByProcess: () => false };
  assert.throws(
    () => statusPostgresReference({ root }, deps),
    (error) => error.code === "PRIVATE_ROOT_OWNER_INVALID"
  );
});

test("PostgreSQL subprocesses never inherit dynamic-loader injection variables", () => {
  const originalLd = process.env.LD_LIBRARY_PATH;
  const originalDyld = process.env.DYLD_LIBRARY_PATH;
  process.env.LD_LIBRARY_PATH = "/untrusted/loader";
  process.env.DYLD_LIBRARY_PATH = "/untrusted/loader";
  try {
    const { fake } = prepare();
    assert.ok(fake.commands.length > 0);
    for (const command of fake.commands) {
      assert.equal(command.environment.LD_LIBRARY_PATH, undefined);
      assert.equal(command.environment.DYLD_LIBRARY_PATH, undefined);
    }
  } finally {
    if (originalLd === undefined) delete process.env.LD_LIBRARY_PATH;
    else process.env.LD_LIBRARY_PATH = originalLd;
    if (originalDyld === undefined) delete process.env.DYLD_LIBRARY_PATH;
    else process.env.DYLD_LIBRARY_PATH = originalDyld;
  }
});
