import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const protocolSchema = readSchema("../schemas/benchmark-protocol-v1.schema.json");
const manifestSchema = readSchema("../schemas/execution-manifest-v1.schema.json");
const manifestFileName = "execution-manifest.json";
const requiredPublicationRoles = new Set([
  "protocol",
  "raw",
  "analysis",
  "scoring",
  "negative-log",
  "review",
  "reproduction",
  "change-log"
]);
const placeholderPattern = /(?:^(?:unknown|<[^>]+>)$)|(?:^|[\s:([_-])(?:tbd|todo|fixme|unresolved|placeholder|to be determined)(?:$|[\s:)\]_-])/iu;

export const validationSchemaVersion = "benchmark-release-validation/v1";
export const releaseSetValidationSchemaVersion = "benchmark-release-set-validation/v1";

function readSchema(relativeUrl) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8"));
}

function add(errors, code, path, message) {
  errors.push({ code, path, message });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueMatchesType(value, type) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isSafeInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function resolveReference(rootSchema, reference) {
  if (!reference.startsWith("#/$defs/")) return null;
  return rootSchema.$defs?.[reference.slice("#/$defs/".length)] ?? null;
}

function schemaValidate(value, schema, rootSchema, path, errors) {
  if (schema.$ref) {
    const referenced = resolveReference(rootSchema, schema.$ref);
    if (!referenced) {
      add(errors, "SCHEMA_CONTRACT_ERROR", path, `Unsupported schema reference: ${schema.$ref}`);
      return;
    }
    schemaValidate(value, referenced, rootSchema, path, errors);
    return;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => {
      const candidateErrors = [];
      schemaValidate(value, candidate, rootSchema, path, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (matches.length !== 1) add(errors, "INVALID_FIELD_VALUE", path, "Value does not match exactly one permitted schema");
    return;
  }
  if (schema.type && !valueMatchesType(value, schema.type)) {
    add(errors, "INVALID_FIELD_TYPE", path, `Expected ${schema.type}`);
    return;
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    add(errors, "INVALID_FIELD_VALUE", path, `Expected constant ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.includes(value)) {
    add(errors, "INVALID_FIELD_VALUE", path, "Value is outside the permitted enumeration");
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      add(errors, "INVALID_FIELD_VALUE", path, "String is shorter than the schema minimum");
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      add(errors, "INVALID_FIELD_VALUE", path, "String does not match the required pattern");
    }
    if (schema.format === "date-time" && utcTimestamp(value) === null) {
      add(errors, "INVALID_FIELD_VALUE", path, "Timestamp must be a valid UTC date-time");
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      add(errors, "INVALID_FIELD_VALUE", path, `Value must be at least ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      add(errors, "INVALID_FIELD_VALUE", path, `Value must be at most ${schema.maximum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      add(errors, "INVALID_FIELD_VALUE", path, "Array has fewer entries than required");
    }
    if (schema.items) {
      value.forEach((entry, index) =>
        schemaValidate(entry, schema.items, rootSchema, `${path}[${index}]`, errors)
      );
    }
  }
  if (!isObject(value)) return;
  if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
    add(errors, "INVALID_FIELD_VALUE", path, "Object has fewer fields than required");
  }
  for (const field of schema.required ?? []) {
    if (!Object.hasOwn(value, field)) {
      add(errors, "MISSING_REQUIRED_FIELD", `${path}.${field}`, "Required field is missing");
    }
  }
  for (const [field, entry] of Object.entries(value)) {
    if (isObject(schema.properties) && Object.hasOwn(schema.properties, field)) {
      schemaValidate(entry, schema.properties[field], rootSchema, `${path}.${field}`, errors);
    } else if (schema.additionalProperties === false) {
      add(errors, "UNKNOWN_FIELD", `${path}.${field}`, "Field is not declared by this schema version");
    } else if (isObject(schema.additionalProperties)) {
      schemaValidate(entry, schema.additionalProperties, rootSchema, `${path}.${field}`, errors);
    }
  }
}

function utcTimestamp(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  if (new Date(milliseconds).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return milliseconds;
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\\") || value.includes("\0") || isAbsolute(value) || win32.isAbsolute(value)) {
    return false;
  }
  if (value.normalize("NFC") !== value) return false;
  const segments = value.split("/");
  const windowsReserved = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  return !segments.some((segment) =>
    segment === "" || segment === "." || segment === ".." || /[\u0000-\u001f<>:"|?*]/u.test(segment) ||
    segment.endsWith(".") || segment.endsWith(" ") || windowsReserved.test(segment)
  ) &&
    posix.normalize(value) === value;
}

function portableCollisionKey(value) {
  return value.normalize("NFC").toLowerCase();
}

// See portablePath()'s comment: git-reported and Node-realpathSync'd paths to the identical
// directory can disagree in segment casing on Windows. Every "is this git root the same
// directory as that Node-resolved root" check must tolerate that, or it fails closed with a
// false GIT_ROOT_MISMATCH-style error on an otherwise-correct Windows checkout.
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

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function filesystemError(errors, path, error) {
  void error;
  add(errors, "FILESYSTEM_ERROR", path, "Filesystem operation failed");
}

function statusIdentity(status, type) {
  return [
    type,
    status.dev,
    status.ino,
    status.mode,
    status.nlink,
    status.size,
    status.mtimeNs,
    status.ctimeNs
  ].map(String).join(":");
}

function walkRelease(root, current, entries, errors) {
  let children;
  try {
    children = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      lexicalCompare(left.name, right.name)
    );
  } catch (error) {
    filesystemError(errors, portablePath(root, current) || ".", error);
    return;
  }
  for (const entry of children) {
    const absolutePath = join(current, entry.name);
    const artifactPath = portablePath(root, absolutePath);
    let status;
    try {
      status = lstatSync(absolutePath, { bigint: true });
    } catch (error) {
      filesystemError(errors, artifactPath, error);
      continue;
    }
    if (status.isSymbolicLink()) {
      entries.set(artifactPath, statusIdentity(status, "symlink"));
      add(errors, "UNSAFE_SYMLINK_PATH", artifactPath, "Release paths must not contain symbolic links");
    } else if (status.isDirectory()) {
      entries.set(artifactPath, statusIdentity(status, "directory"));
      walkRelease(root, absolutePath, entries, errors);
    } else if (status.isFile()) {
      entries.set(artifactPath, statusIdentity(status, "file"));
    } else {
      entries.set(artifactPath, statusIdentity(status, "other"));
      add(errors, "UNSAFE_ARTIFACT_TYPE", artifactPath, "Only regular files and directories are permitted");
    }
  }
}

function releaseFiles(entries) {
  return new Set([...entries.entries()]
    .filter(([, identity]) => identity.startsWith("file:"))
    .map(([path]) => path));
}

function sameTree(left, right) {
  return JSON.stringify([...left.entries()].sort(([a], [b]) => lexicalCompare(a, b))) ===
    JSON.stringify([...right.entries()].sort(([a], [b]) => lexicalCompare(a, b)));
}

// Reports WHICH safeRelativePath() rule rejected a candidate, without echoing the
// candidate's own bytes (which could be an absolute host path on the failure path this
// diagnoses -- the value itself must never reach a public error message; the *reason* is
// safe and, for this specific host-portability class of defect, necessary to diagnose at
// all without reproducing on the failing platform).
function unsafePathReason(value) {
  if (typeof value !== "string" || value.length === 0) return "empty-or-non-string";
  if (value.includes("\\")) return "contains-backslash";
  if (value.includes("\0")) return "contains-nul";
  if (isAbsolute(value)) return "absolute-posix";
  if (win32.isAbsolute(value)) return "absolute-win32";
  if (value.normalize("NFC") !== value) return "not-nfc-normalized";
  const segments = value.split("/");
  const windowsReserved = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
  if (segments.some((segment) => segment === "")) return "empty-segment";
  if (segments.some((segment) => segment === "." || segment === "..")) return "dot-segment";
  if (segments.some((segment) => /[\u0000-\u001f<>:"|?*]/u.test(segment))) return "reserved-character";
  if (segments.some((segment) => segment.endsWith(".") || segment.endsWith(" "))) return "trailing-dot-or-space";
  if (segments.some((segment) => windowsReserved.test(segment))) return "windows-reserved-name";
  if (posix.normalize(value) !== value) return "not-posix-normalized";
  return "unknown";
}

function resolveArtifact(root, artifactPath, errors, errorPath) {
  if (!safeRelativePath(artifactPath)) {
    add(errors, "UNSAFE_ARTIFACT_PATH", errorPath,
      `Artifact path must be normalized and release-relative (${unsafePathReason(artifactPath)})`);
    return null;
  }
  const absolutePath = resolve(root, ...artifactPath.split("/"));
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${sep}`)) {
    add(errors, "UNSAFE_ARTIFACT_PATH", errorPath, "Artifact path escapes the release root");
    return null;
  }
  let cursor = root;
  for (const segment of artifactPath.split("/")) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) return absolutePath;
    try {
      if (lstatSync(cursor).isSymbolicLink()) {
        add(errors, "UNSAFE_SYMLINK_PATH", errorPath, "Artifact path traverses a symbolic link");
        return null;
      }
    } catch (error) {
      filesystemError(errors, errorPath, error);
      return null;
    }
  }
  return absolutePath;
}

function readStableRegularFile(path, root, errors, errorPath, expectedIdentity = null) {
  if (!existsSync(path)) {
    add(errors, "ARTIFACT_MISSING", errorPath, "Declared artifact does not exist");
    return null;
  }
  let descriptor;
  try {
    const pathBefore = lstatSync(path, { bigint: true });
    if (!pathBefore.isFile()) {
      add(errors, pathBefore.isSymbolicLink() ? "UNSAFE_SYMLINK_PATH" : "UNSAFE_ARTIFACT_TYPE", errorPath, "Declared artifact is not a regular file");
      return null;
    }
    const pathIdentity = statusIdentity(pathBefore, "file");
    if (expectedIdentity !== null && expectedIdentity !== pathIdentity) {
      add(errors, "ARTIFACT_CHANGED_DURING_VALIDATION", errorPath, "Artifact identity changed after the release snapshot");
      return null;
    }
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) {
      add(errors, "UNSAFE_ARTIFACT_TYPE", errorPath, "Declared artifact is not a regular file");
      return null;
    }
    if (before.nlink > 1n) {
      add(errors, "UNSAFE_HARDLINK_PATH", errorPath, "Release artifacts must not be hard-linked");
      return null;
    }
    if (statusIdentity(before, "file") !== pathIdentity) {
      add(errors, "ARTIFACT_CHANGED_DURING_VALIDATION", errorPath, "Artifact changed between path inspection and descriptor open");
      return null;
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (statusIdentity(before, "file") !== statusIdentity(after, "file")) {
      add(errors, "ARTIFACT_CHANGED_DURING_VALIDATION", errorPath, "Artifact changed while it was read");
      return null;
    }
    const pathAfter = lstatSync(path, { bigint: true });
    if (!pathAfter.isFile() || statusIdentity(pathAfter, "file") !== statusIdentity(after, "file")) {
      add(errors, "ARTIFACT_CHANGED_DURING_VALIDATION", errorPath, "Artifact path no longer identifies the descriptor that was read");
      return null;
    }
    let observedRealPath;
    try {
      observedRealPath = realpathSync(path);
    } catch (error) {
      filesystemError(errors, errorPath, error);
      return null;
    }
    if (observedRealPath !== root && !observedRealPath.startsWith(`${root}${sep}`)) {
      add(errors, "UNSAFE_ARTIFACT_PATH", errorPath, "Artifact resolves outside the release root");
      return null;
    }
    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      content: bytes,
      identity: statusIdentity(after, "file")
    };
  } catch (error) {
    if (error?.code === "ELOOP") {
      add(errors, "UNSAFE_SYMLINK_PATH", errorPath, "Artifact path traverses a symbolic link");
    } else {
      filesystemError(errors, errorPath, error);
    }
    return null;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch (error) {
        filesystemError(errors, errorPath, error);
      }
    }
  }
}

function readJsonBytes(bytes, errors, errorPath) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    add(errors, "INVALID_JSON", errorPath, "File is not valid UTF-8 JSON");
    return null;
  }
}

function gitRun(repositoryRoot, arguments_) {
  const execution = spawnSync("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: null,
    windowsHide: true
  });
  return {
    ok: execution.status === 0 && !execution.error,
    status: execution.status,
    stdout: execution.stdout ?? Buffer.alloc(0),
    stderr: execution.stderr ?? Buffer.alloc(0),
    error: execution.error ?? null
  };
}

function gitFailure(errors, code, path, operation, execution) {
  const detail = execution.error?.code ?? (Number.isInteger(execution.status) ? `exit ${execution.status}` : "unavailable");
  add(errors, code, path, `${operation} failed (${detail})`);
}

function normalizeRepository(value, basePath = process.cwd()) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  if (isAbsolute(trimmed) || win32.isAbsolute(trimmed)) {
    const canonical = existsSync(trimmed) ? realpathSync(trimmed) : win32.normalize(trimmed);
    return `file:${canonical.replaceAll("\\", "/").replace(/^([A-Z]):/u, (_, drive) => `${drive.toLowerCase()}:`)}`;
  }
  const scp = /^([^@\s]+@)?([^:\s]+):(.+)$/u.exec(trimmed);
  if (scp && !/^[A-Za-z]:/u.test(trimmed)) {
    return `${scp[2].toLowerCase()}/${scp[3].replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "")}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "file:") {
      const path = fileURLToPath(parsed);
      return `file:${existsSync(path) ? realpathSync(path) : resolve(path)}`;
    }
    const authority = `${parsed.hostname.toLowerCase()}${parsed.port === "" ? "" : `:${parsed.port}`}`;
    return `${authority}/${parsed.pathname.replace(/^\/+|\/+$/gu, "").replace(/\.git$/iu, "")}`;
  } catch {
    const path = resolve(basePath, trimmed);
    return `file:${existsSync(path) ? realpathSync(path) : path}`;
  }
}

function repositoryEmbedsCredentials(value) {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.password !== "" ||
      (["http:", "https:"].includes(parsed.protocol) &&
        (parsed.username !== "" || parsed.search !== "" || parsed.hash !== ""));
  } catch {
    return false;
  }
}

function redactRepositoryCredentials(value) {
  if (typeof value !== "string") return value;
  if (win32.isAbsolute(value.trim())) return value.trim();
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function gitRootFromPath(path, errors, errorPath) {
  const execution = gitRun(dirname(path), ["rev-parse", "--show-toplevel"]);
  if (!execution.ok) {
    gitFailure(errors, "GIT_REPOSITORY_REQUIRED", errorPath, "Git repository discovery", execution);
    return null;
  }
  const root = execution.stdout.toString("utf8").trim();
  try {
    return realpathSync(root);
  } catch (error) {
    filesystemError(errors, errorPath, error);
    return null;
  }
}

function gitOrigin(repositoryRoot, errors, errorPath) {
  const execution = gitRun(repositoryRoot, ["remote", "get-url", "origin"]);
  if (!execution.ok) {
    gitFailure(errors, "GIT_ORIGIN_REQUIRED", errorPath, "Git origin lookup", execution);
    return null;
  }
  return redactRepositoryCredentials(execution.stdout.toString("utf8").trim());
}

function remoteContainsRevision(repositoryRoot, revision, errors, errorPath) {
  const execution = gitRun(repositoryRoot, [
    "for-each-ref",
    "--format=%(refname)",
    "--contains",
    revision,
    "refs/remotes/origin/"
  ]);
  if (!execution.ok) {
    gitFailure(errors, "GIT_REMOTE_REACHABILITY_FAILED", errorPath, "Git remote-ref reachability check", execution);
    return false;
  }
  if (execution.stdout.toString("utf8").trim() === "") {
    add(errors, "GIT_REVISION_NOT_REMOTE_REACHABLE", errorPath, "Revision is not reachable from a fetched origin remote-tracking ref");
    return false;
  }
  return true;
}

function verifyGitRegistration(registration, repositoryRoot, expectedBytes, errors, errorPath) {
  if (!isObject(registration) || typeof repositoryRoot !== "string") return null;
  if (repositoryEmbedsCredentials(registration.repository)) {
    add(errors, "REPOSITORY_CREDENTIALS_FORBIDDEN", `${errorPath}.repository`, "Repository locators must not embed credentials");
    return null;
  }
  let root;
  try {
    root = realpathSync(resolve(repositoryRoot));
  } catch (error) {
    filesystemError(errors, errorPath, error);
    return null;
  }
  const discovered = gitRootFromPath(join(root, "placeholder"), errors, errorPath);
  if (!discovered || !sameHostPath(discovered, root)) {
    if (discovered && !sameHostPath(discovered, root)) {
      add(errors, "GIT_ROOT_MISMATCH", errorPath, "Configured source root is not the Git repository root");
    }
    return null;
  }
  if (!safeRelativePath(registration.path)) {
    add(errors, "UNSAFE_SOURCE_REGISTRATION_PATH", `${errorPath}.path`, "Registered Git path must be normalized and portable");
    return null;
  }
  const origin = gitOrigin(root, errors, `${errorPath}.repository`);
  if (!origin || normalizeRepository(origin, root) !== normalizeRepository(registration.repository, root)) {
    if (origin) add(errors, "GIT_REMOTE_MISMATCH", `${errorPath}.repository`, "Registered repository does not match the checkout origin");
    return null;
  }
  const objectType = gitRun(root, ["cat-file", "-t", registration.revision]);
  if (!objectType.ok || objectType.stdout.toString("utf8").trim() !== "commit") {
    add(errors, "GIT_COMMIT_MISSING", `${errorPath}.revision`, "Registered revision is not a local Git commit object");
    return null;
  }
  const ancestor = gitRun(root, ["merge-base", "--is-ancestor", registration.revision, "HEAD"]);
  if (!ancestor.ok) {
    add(errors, "GIT_REVISION_NOT_ANCESTOR", `${errorPath}.revision`, "Registered revision is not an ancestor of the validation checkout");
    return null;
  }
  remoteContainsRevision(root, registration.revision, errors, `${errorPath}.revision`);
  const blob = gitRun(root, ["show", `${registration.revision}:${registration.path}`]);
  if (!blob.ok) {
    gitFailure(errors, "GIT_PROTOCOL_BLOB_MISSING", `${errorPath}.path`, "Registered protocol blob lookup", blob);
    return null;
  }
  if (!blob.stdout.equals(expectedBytes)) {
    add(errors, "GIT_PROTOCOL_BLOB_MISMATCH", errorPath, "Release protocol bytes differ from the registered Git blob");
  }
  const commitTime = gitRun(root, ["show", "-s", "--format=%cI", registration.revision]);
  const commitTimestamp = commitTime.ok ? Date.parse(commitTime.stdout.toString("utf8").trim()) : Number.NaN;
  return {
    root,
    origin,
    revision: registration.revision,
    path: registration.path,
    commitTimestamp: Number.isFinite(commitTimestamp) ? commitTimestamp : null
  };
}

function verifyProtocolCheckout(protocolPath, bytes, errors, options) {
  const inferredRoot = gitRootFromPath(protocolPath, errors, "$.sourceRegistration");
  const root = options?.sourceRepositoryRoot
    ? (() => {
        try { return realpathSync(resolve(options.sourceRepositoryRoot)); } catch { return null; }
      })()
    : inferredRoot;
  if (!root || !inferredRoot || !sameHostPath(root, inferredRoot)) {
    if (root && inferredRoot && !sameHostPath(root, inferredRoot)) {
      add(errors, "GIT_ROOT_MISMATCH", "$.sourceRegistration", "Protocol is outside the configured source repository");
    }
    return null;
  }
  const relativePath = portablePath(root, protocolPath);
  if (!safeRelativePath(relativePath)) {
    add(errors, "UNSAFE_SOURCE_REGISTRATION_PATH", "$.sourceRegistration.path", "Protocol path is not portable inside its Git repository");
    return null;
  }
  const head = gitRun(root, ["rev-parse", "HEAD"]);
  if (!head.ok) {
    gitFailure(errors, "GIT_COMMIT_MISSING", "$.sourceRegistration.revision", "Git HEAD lookup", head);
    return null;
  }
  const revision = head.stdout.toString("utf8").trim();
  const origin = gitOrigin(root, errors, "$.sourceRegistration.repository");
  if (!origin) return null;
  const registration = { repository: origin, revision, path: relativePath };
  const anchored = verifyGitRegistration(registration, root, bytes, errors, "$.sourceRegistration");
  const status = gitRun(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (!status.ok) {
    gitFailure(errors, "GIT_STATUS_FAILED", "$.sourceRegistration", "Git status check", status);
  } else if (status.stdout.length > 0) {
    add(errors, "PROTOCOL_CHECKOUT_NOT_CLEAN", "$.sourceRegistration", "Protocol preflight requires a clean Git checkout");
  }
  return anchored;
}

function uniqueIds(entries, path, errors) {
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(entries) ? entries : []).entries()) {
    if (!isObject(entry) || typeof entry.id !== "string") continue;
    if (seen.has(entry.id)) add(errors, "DUPLICATE_ID", `${path}[${index}].id`, `Duplicate id: ${entry.id}`);
    seen.add(entry.id);
  }
  return seen;
}

function isJsonParameterValue(value) {
  return value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every(isJsonParameterValue));
}

function containsPlaceholder(value) {
  if (typeof value === "string") return value.trim() === "" || placeholderPattern.test(value.trim());
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isObject(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

function declaredValues(declaration) {
  if (!isObject(declaration) || !Object.hasOwn(declaration, "value")) return [];
  return Array.isArray(declaration.value) ? declaration.value : [declaration.value];
}

function jsonValueSet(values) {
  return new Set(values.map((value) => JSON.stringify(value)));
}

function sameValueDomain(left, right) {
  const leftSet = jsonValueSet(left);
  const rightSet = jsonValueSet(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function validateResolvedValue(value, path, errors) {
  if (!isJsonParameterValue(value) || containsPlaceholder(value)) {
    add(errors, "UNRESOLVED_WORKLOAD_VALUE", path, "Value must be a resolved JSON scalar or array of resolved scalars");
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isOrderedSubsequence(values, order) {
  let cursor = 0;
  for (const value of values) {
    while (cursor < order.length && order[cursor] !== value) cursor += 1;
    if (cursor === order.length) return false;
    cursor += 1;
  }
  return true;
}

function declaredValueIncludes(declaration, value) {
  if (!isObject(declaration) || !Object.hasOwn(declaration, "value")) return false;
  return Array.isArray(declaration.value)
    ? declaration.value.some((entry) => sameJsonValue(entry, value))
    : sameJsonValue(declaration.value, value);
}

function validateEvidenceReferences(value, sourceIds, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateEvidenceReferences(entry, sourceIds, `${path}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  if (Array.isArray(value.evidenceSourceIds)) {
    for (const [index, sourceId] of value.evidenceSourceIds.entries()) {
      if (!sourceIds.has(sourceId)) {
        add(errors, "UNKNOWN_EVIDENCE_SOURCE", `${path}.evidenceSourceIds[${index}]`, "Evidence source is not declared");
      }
    }
  }
  for (const [field, entry] of Object.entries(value)) {
    if (field !== "evidenceSourceIds") validateEvidenceReferences(entry, sourceIds, `${path}.${field}`, errors);
  }
}

function validateCrossFieldWorkload(protocol, errors) {
  const workload = protocol.workload;
  const parameterSpace = workload.parameterSpace;
  const cells = protocol.plannedCells;
  for (const [workloadField, parameterField] of [
    ["concurrencyLevels", "concurrency"],
    ["callRate", "callRate"],
    ["callCount", "callCount"],
    ["duration", "duration"]
  ]) {
    if (!Object.hasOwn(parameterSpace, parameterField)) {
      add(errors, "WORKLOAD_PARAMETER_MISSING", `$.protocol.workload.parameterSpace.${parameterField}`, `Executable cells must bind workload.${workloadField}`);
      continue;
    }
    if (!sameValueDomain(declaredValues(workload[workloadField]), declaredValues(parameterSpace[parameterField]))) {
      add(errors, "WORKLOAD_PARAMETER_DOMAIN_MISMATCH", `$.protocol.workload.parameterSpace.${parameterField}`, `Parameter domain must equal workload.${workloadField}`);
    }
  }
  for (const [field, declaration] of Object.entries(parameterSpace)) {
    const observed = cells.map((cell) => cell.parameters[field]);
    const missing = declaredValues(declaration).filter((value) =>
      !observed.some((entry) => sameJsonValue(entry, value))
    );
    if (missing.length > 0) {
      add(errors, "UNUSED_PARAMETER_VALUE", `$.protocol.workload.parameterSpace.${field}.value`, "Every preregistered parameter value must occur in at least one planned cell");
    }
  }
  for (const [index, cell] of cells.entries()) {
    if (
      Object.hasOwn(cell.parameters, "operationsPerType") && Object.hasOwn(cell.parameters, "callCount") &&
      !sameJsonValue(cell.parameters.operationsPerType, cell.parameters.callCount)
    ) {
      add(errors, "CELL_CALL_COUNT_MISMATCH", `$.protocol.plannedCells[${index}].parameters.callCount`, "callCount must equal operationsPerType when both are declared");
    }
  }
  if (Object.hasOwn(parameterSpace, "repetition")) {
    const positive = declaredValues(parameterSpace.repetition)
      .filter((value) => Number.isSafeInteger(value) && value > 0)
      .sort((left, right) => left - right);
    const expected = Array.from({ length: protocol.repetitions.count }, (_, index) => index + 1);
    if (!sameJsonValue([...new Set(positive)], expected)) {
      add(errors, "REPETITION_DOMAIN_MISMATCH", "$.protocol.workload.parameterSpace.repetition.value", "Positive repetition ordinals must be exactly 1 through repetitions.count");
    }
  }
}

function validateWorkloadSemantics(protocol, planned, sourceIds, manifest, errors) {
  const adapters = uniqueIds(protocol.adapters, "$.protocol.adapters", errors);
  for (const [index, adapter] of (protocol.adapters ?? []).entries()) {
    if (isObject(adapter) && !safeRelativePath(adapter.path)) {
      add(errors, "UNSAFE_ADAPTER_PATH", `$.protocol.adapters[${index}].path`, "Adapter path must be normalized and repository-relative");
    }
  }
  if (!adapters.has(protocol.operationPolicy?.adapterId)) {
    add(errors, "UNKNOWN_PROTOCOL_REFERENCE", "$.protocol.operationPolicy.adapterId", "Operation adapter is not declared");
  }
  if (manifest) {
    const runtimeIds = new Set((manifest.environment?.runtimes ?? []).map((runtime) => runtime?.id));
    for (const [index, adapter] of (protocol.adapters ?? []).entries()) {
      if (isObject(adapter) && !runtimeIds.has(adapter.runtimeId)) {
        add(errors, "UNKNOWN_RUNTIME_REFERENCE", `$.protocol.adapters[${index}].runtimeId`, "Adapter runtime is absent from the execution environment");
      }
    }
  }
  const operations = protocol.operationPolicy?.orderedOperations ?? [];
  const operationIds = uniqueIds(operations, "$.protocol.operationPolicy.orderedOperations", errors);
  for (const [operationIndex, operation] of operations.entries()) {
    uniqueIds(operation?.parameters, `$.protocol.operationPolicy.orderedOperations[${operationIndex}].parameters`, errors);
    for (const [parameterIndex, parameter] of (operation?.parameters ?? []).entries()) {
      if (isObject(parameter)) validateResolvedValue(
        parameter.value,
        `$.protocol.operationPolicy.orderedOperations[${operationIndex}].parameters[${parameterIndex}].value`,
        errors
      );
    }
  }
  const workload = protocol.workload;
  for (const field of ["concurrencyLevels", "callRate", "callCount", "duration"]) {
    if (isObject(workload?.[field])) validateResolvedValue(workload[field].value, `$.protocol.workload.${field}.value`, errors);
  }
  const faults = uniqueIds(protocol.workload?.faultSchedule, "$.protocol.workload.faultSchedule", errors);
  for (const [index, fault] of (protocol.workload?.faultSchedule ?? []).entries()) {
    if (isObject(fault) && !operationIds.has(fault.operationId)) {
      add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.workload.faultSchedule[${index}].operationId`, "Fault operation is not declared");
    }
    if (isObject(fault?.trigger)) validateResolvedValue(fault.trigger.value, `$.protocol.workload.faultSchedule[${index}].trigger.value`, errors);
  }
  const order = protocol.workload?.cellOrder;
  const plannedIds = (protocol.plannedCells ?? []).map((cell) => cell?.id);
  if (Array.isArray(order) && !sameJsonValue(order, plannedIds)) {
    add(errors, "CELL_ORDER_MISMATCH", "$.protocol.workload.cellOrder", "Cell order must exactly match the preregistered cells");
  }
  for (const [index, cell] of (protocol.plannedCells ?? []).entries()) {
    if (!isObject(cell)) continue;
    if (!adapters.has(cell.adapterId) || cell.adapterId !== protocol.operationPolicy?.adapterId) {
      add(errors, "ADAPTER_ID_MISMATCH", `$.protocol.plannedCells[${index}].adapterId`, "Cell adapter is not the declared operation adapter");
    }
    const parameters = cell.parameters;
    const parameterSpace = isObject(workload?.parameterSpace) ? workload.parameterSpace : {};
    const cellKeys = isObject(parameters) ? Object.keys(parameters).sort() : [];
    const declaredKeys = Object.keys(parameterSpace).sort();
    if (!sameJsonValue(cellKeys, declaredKeys)) {
      add(errors, "CELL_PARAMETER_SET_MISMATCH", `$.protocol.plannedCells[${index}].parameters`, "Cell parameters must exactly match the sourced parameter space");
    }
    for (const [field, parameterValue] of Object.entries(isObject(parameters) ? parameters : {})) {
      validateResolvedValue(parameterValue, `$.protocol.plannedCells[${index}].parameters.${field}`, errors);
      if (!declaredValueIncludes(parameterSpace[field], parameterValue)) {
        add(errors, "UNRESOLVED_CELL_PARAMETER", `$.protocol.plannedCells[${index}].parameters.${field}`, "Cell value is absent from the sourced parameter space");
      }
    }
    if (
      isObject(parameters) && Object.hasOwn(parameters, "sourceId") &&
      parameters.sourceId !== cell.experimentalUnitId && parameters.sourceId !== cell.corpusId
    ) {
      add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.plannedCells[${index}].parameters.sourceId`, "Cell sourceId must resolve to its experimental unit or corpus");
    }
    for (const [faultIndex, faultId] of (Array.isArray(parameters?.faultIds) ? parameters.faultIds : []).entries()) {
      if (!faults.has(faultId)) {
        add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.plannedCells[${index}].parameters.faultIds[${faultIndex}]`, "Cell fault is not declared");
      }
    }
  }
  for (const [field, limit] of Object.entries(protocol.resourcePolicy?.limits ?? {})) {
    if (isObject(limit)) validateResolvedValue(limit.value, `$.protocol.resourcePolicy.limits.${field}.value`, errors);
  }
  for (const [field, declaration] of Object.entries(isObject(workload?.parameterSpace) ? workload.parameterSpace : {})) {
    if (isObject(declaration)) validateResolvedValue(declaration.value, `$.protocol.workload.parameterSpace.${field}.value`, errors);
  }
  validateCrossFieldWorkload(protocol, errors);
  validateEvidenceReferences(protocol, sourceIds, "$.protocol", errors);
  for (const cellId of Array.isArray(order) ? order : []) {
    if (!planned.has(cellId)) add(errors, "UNKNOWN_PROTOCOL_REFERENCE", "$.protocol.workload.cellOrder", `Cell is not declared: ${cellId}`);
  }
}

function validateProtocolSemantics(protocol, manifest, errors) {
  if (!isObject(protocol)) return;
  const sourceIds = uniqueIds(protocol.evidenceSources, "$.protocol.evidenceSources", errors);
  const populations = uniqueIds(protocol.populations, "$.protocol.populations", errors);
  const units = uniqueIds(protocol.experimentalUnits, "$.protocol.experimentalUnits", errors);
  const corpora = uniqueIds(protocol.corpora, "$.protocol.corpora", errors);
  uniqueIds(protocol.hypotheses, "$.protocol.hypotheses", errors);
  uniqueIds(protocol.metrics, "$.protocol.metrics", errors);
  uniqueIds(protocol.scoringRubric?.labels, "$.protocol.scoringRubric.labels", errors);
  const planned = uniqueIds(protocol.plannedCells, "$.protocol.plannedCells", errors);
  uniqueIds(protocol.declaredDeviations, "$.protocol.declaredDeviations", errors);
  for (const [index, corpus] of (protocol.corpora ?? []).entries()) {
    if (isObject(corpus) && repositoryEmbedsCredentials(corpus.repository)) {
      add(errors, "REPOSITORY_CREDENTIALS_FORBIDDEN", `$.protocol.corpora[${index}].repository`, "Repository locators must not embed credentials");
    }
  }
  for (const [index, cell] of (protocol.plannedCells ?? []).entries()) {
    if (!isObject(cell)) continue;
    if (!populations.has(cell.populationId)) add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.plannedCells[${index}].populationId`, "Population is not declared");
    if (!units.has(cell.experimentalUnitId)) add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.plannedCells[${index}].experimentalUnitId`, "Experimental unit is not declared");
    if (!corpora.has(cell.corpusId)) add(errors, "UNKNOWN_PROTOCOL_REFERENCE", `$.protocol.plannedCells[${index}].corpusId`, "Corpus is not declared");
  }
  if (manifest) {
    const repositories = new Map((manifest.environment?.repositories ?? []).filter(isObject).map((entry) =>
      [`${entry.repository}@${entry.revision}`, entry]
    ));
    for (const [index, corpus] of (protocol.corpora ?? []).entries()) {
      if (!isObject(corpus)) continue;
      const environmentRepository = repositories.get(`${corpus.repository}@${corpus.revision}`);
      if (!environmentRepository) {
        add(errors, "CORPUS_SNAPSHOT_MISSING", `$.protocol.corpora[${index}]`, "Corpus revision is absent from the execution environment");
      } else if (environmentRepository.dirty !== corpus.dirty) {
        add(errors, "CORPUS_DIRTY_STATE_MISMATCH", `$.protocol.corpora[${index}].dirty`, "Corpus dirty state differs from the execution environment");
      }
    }
    for (const [index, cell] of (manifest.cells ?? []).entries()) {
      if (isObject(cell) && typeof cell.id === "string" && !planned.has(cell.id)) {
        add(errors, "UNREGISTERED_CELL", `$.cells[${index}].id`, "Executed cell is absent from the preregistration");
      }
    }
    const executed = (manifest.cells ?? []).map((cell) => cell?.id);
    const registeredOrder = protocol.workload?.cellOrder ?? [];
    if (manifest.releaseStatus === "PREREGISTERED") {
      if (executed.length !== 0) {
        add(errors, "PREREGISTERED_RELEASE_HAS_CELLS", "$.cells", "A PREREGISTERED release must not contain execution cells");
      }
    } else if (manifest.releaseStatus === "PILOT") {
      if (executed.length === 0) {
        add(errors, "PILOT_RELEASE_HAS_NO_CELLS", "$.cells", "A PILOT release must contain at least one attempted cell");
      } else if (!isOrderedSubsequence(executed, registeredOrder)) {
        add(errors, "CELL_EXECUTION_ORDER_MISMATCH", "$.cells", "Pilot cells must be a duplicate-free ordered subsequence of the preregistered cell order");
      }
    } else if (!sameJsonValue(executed, registeredOrder)) {
      add(errors, "INCOMPLETE_RELEASE_MATRIX", "$.cells", "VERIFIED and PUBLISHED releases must contain the exact preregistered cell order");
    }
  }
  validateWorkloadSemantics(protocol, planned, sourceIds, manifest, errors);
}

function validateArtifacts(root, manifest, files, tree, errors) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const declared = new Map();
  const portableDeclared = new Map();
  const snapshots = new Map();
  for (const [index, artifact] of artifacts.entries()) {
    if (!isObject(artifact) || typeof artifact.path !== "string") continue;
    const errorPath = `$.artifacts[${index}].path`;
    if (declared.has(artifact.path)) {
      add(errors, "DUPLICATE_ARTIFACT_PATH", errorPath, "Artifact path is declared more than once");
      continue;
    }
    declared.set(artifact.path, artifact);
    const collisionKey = portableCollisionKey(artifact.path);
    if (portableDeclared.has(collisionKey) && portableDeclared.get(collisionKey) !== artifact.path) {
      add(errors, "PORTABLE_PATH_COLLISION", errorPath, "Artifact path collides under portable Unicode and case-insensitive filesystem rules");
    } else {
      portableDeclared.set(collisionKey, artifact.path);
    }
    if (artifact.path === manifestFileName) {
      add(errors, "MANIFEST_SELF_LISTED", errorPath, "The self-referential manifest is implicitly covered");
      continue;
    }
    if (artifact.role === "raw" && artifact.immutable !== true) {
      add(errors, "RAW_ARTIFACT_NOT_IMMUTABLE", `$.artifacts[${index}].immutable`, "Raw artifacts must be declared immutable");
    }
    const absolutePath = resolveArtifact(root, artifact.path, errors, errorPath);
    if (!absolutePath) continue;
    const observed = readStableRegularFile(absolutePath, root, errors, errorPath, tree.get(artifact.path) ?? null);
    if (!observed) continue;
    snapshots.set(artifact.path, observed);
    if (artifact.sha256 !== observed.sha256) {
      add(errors, "ARTIFACT_DIGEST_MISMATCH", `$.artifacts[${index}].sha256`, "Declared SHA-256 does not match artifact bytes");
    }
    if (artifact.bytes !== observed.bytes) {
      add(errors, "ARTIFACT_SIZE_MISMATCH", `$.artifacts[${index}].bytes`, "Declared size does not match artifact bytes");
    }
  }
  const portableFiles = new Map();
  for (const artifactPath of [...files].sort()) {
    const collisionKey = portableCollisionKey(artifactPath);
    if (portableFiles.has(collisionKey) && portableFiles.get(collisionKey) !== artifactPath) {
      add(errors, "PORTABLE_PATH_COLLISION", artifactPath, "Release files collide under portable Unicode and case-insensitive filesystem rules");
    } else {
      portableFiles.set(collisionKey, artifactPath);
    }
    if (artifactPath !== manifestFileName && !declared.has(artifactPath)) {
      add(errors, "UNLISTED_ARTIFACT", artifactPath, "Release file is absent from the artifact manifest");
    }
  }
  const roles = new Set(artifacts.map((artifact) => artifact?.role));
  if (["VERIFIED", "PUBLISHED"].includes(manifest.releaseStatus)) {
    for (const role of requiredPublicationRoles) {
      if (!roles.has(role)) {
        add(errors, "REQUIRED_ARTIFACT_ROLE_MISSING", "$.artifacts", `Release is missing required artifact role: ${role}`);
      }
    }
    for (const [index, artifact] of artifacts.entries()) {
      if (isObject(artifact) && artifact.immutable !== true) {
        add(errors, "RELEASE_ARTIFACT_NOT_IMMUTABLE", `$.artifacts[${index}].immutable`, "Every VERIFIED or PUBLISHED artifact must be content-addressed as immutable");
      }
    }
  }
  return { declared, snapshots };
}

function validatePilotSkipEvidence(protocol, manifest, declared, snapshots, errors) {
  if (manifest.releaseStatus !== "PILOT") return;
  const executed = new Set(manifest.cells.map((cell) => cell.id));
  const skipped = protocol.workload.cellOrder.filter((cellId) => !executed.has(cellId));

  const runSummaries = [...declared.entries()].filter(([path, entry]) =>
    entry.role === "raw" && (path === "run-summary.json" || path.endsWith("/run-summary.json"))
  );
  if (runSummaries.length !== 1) {
    add(errors, "PILOT_RUN_SUMMARY_REQUIRED", "$.artifacts", "A PILOT must declare exactly one raw run-summary.json artifact");
    return;
  }
  const [summaryPath, summaryArtifact] = runSummaries[0];
  if (summaryArtifact.immutable !== true) {
    add(errors, "PILOT_SKIP_EVIDENCE_NOT_IMMUTABLE", summaryPath, "Pilot skip evidence must be content-addressed");
  }
  const summarySnapshot = snapshots.get(summaryPath);
  if (!summarySnapshot) return;
  const summary = readJsonBytes(summarySnapshot.content, errors, summaryPath);
  if (!isObject(summary) || summary.schemaVersion !== "workload-run-summary/v1" || !Array.isArray(summary.cells)) {
    add(errors, "PILOT_RUN_SUMMARY_INVALID", summaryPath, "Pilot run summary must use workload-run-summary/v1 and contain a cells array");
    return;
  }
  if (summary.protocolSha256 !== manifest.protocol.sha256) {
    add(errors, "PILOT_RUN_SUMMARY_PROTOCOL_MISMATCH", summaryPath, "Pilot run summary must bind the release protocol digest");
  }

  if (summary.releaseId !== manifest.releaseId || summary.protocolId !== protocol.protocolId ||
      !sameJsonValue(summary.cells.map((entry) => entry?.id), protocol.workload.cellOrder)) {
    add(errors, "PILOT_RUN_SUMMARY_MATRIX_INVALID", summaryPath, "Pilot run summary must bind the release and retain the exact preregistered cell order");
  }

  const summaryCells = new Map();
  for (const [index, entry] of summary.cells.entries()) {
    if (!isObject(entry) || typeof entry.id !== "string" || summaryCells.has(entry.id)) {
      add(errors, "PILOT_RUN_SUMMARY_INVALID", summaryPath, "Pilot run summary cell IDs must be unique strings");
      continue;
    }
    summaryCells.set(entry.id, entry);
    const planned = protocol.plannedCells[index];
    if (entry.expectedVerdict !== planned?.expectedVerdict) {
      add(errors, "PILOT_RUN_SUMMARY_EXPECTATION_MISMATCH", `${summaryPath}#${entry.id}`, "Run-summary expectation must equal the preregistered expectedVerdict");
    }
  }
  const attemptedSummary = summary.cells.filter((entry) => isObject(entry) && entry.status !== "not-run");
  if (!sameJsonValue(attemptedSummary.map((entry) => entry.id), manifest.cells.map((cell) => cell.id))) {
    add(errors, "PILOT_MANIFEST_SUMMARY_ATTEMPT_MISMATCH", "$.cells", "Pilot manifest cells must be exactly the run-summary attempted cells in order");
  }
  const summaryStatusToManifest = new Map([
    ["passed", "completed"],
    ["failed", "failed"],
    ["indeterminate", "indeterminate"]
  ]);
  for (const [index, cell] of manifest.cells.entries()) {
    const summaryCell = attemptedSummary[index];
    if (!summaryCell || summaryCell.id !== cell.id) continue;
    const mappedStatus = summaryStatusToManifest.get(summaryCell.status);
    if (!mappedStatus || cell.status !== mappedStatus) {
      add(errors, "PILOT_MANIFEST_SUMMARY_STATUS_MISMATCH", `$.cells[${index}].status`, "Manifest status must preserve the run-summary orchestration outcome");
    }
    const observedVerdict = summaryCell.verdict ?? null;
    if (observedVerdict === null) {
      if (cell.verdict !== "indeterminate" || cell.resolution.state !== "unresolved") {
        add(errors, "PILOT_MANIFEST_SUMMARY_VERDICT_MISMATCH", `$.cells[${index}].verdict`, "A run-summary cell without an oracle verdict must remain indeterminate and unresolved");
      }
    } else if (!["proven", "blocked", "indeterminate"].includes(observedVerdict) ||
        cell.verdict !== observedVerdict) {
      add(errors, "PILOT_MANIFEST_SUMMARY_VERDICT_MISMATCH", `$.cells[${index}].verdict`, "Manifest verdict must preserve the terminal run-summary verdict");
    }
  }
  const negativeLogs = [...declared.entries()].filter(([, entry]) => entry.role === "negative-log");
  if (negativeLogs.length === 0) {
    add(errors, "PILOT_NEGATIVE_LOG_REQUIRED", "$.artifacts", "A PILOT must declare a negative-log artifact containing every negative or skipped outcome");
  }
  for (const [path, entry] of negativeLogs) {
    if (entry.immutable !== true) {
      add(errors, "PILOT_SKIP_EVIDENCE_NOT_IMMUTABLE", path, "Pilot skip evidence must be content-addressed");
    }
  }
  const negativeRecords = [];
  const jsonlLogs = negativeLogs.filter(([path]) => path.endsWith(".jsonl"));
  if (jsonlLogs.length !== 1) {
    add(errors, "PILOT_NEGATIVE_LOG_INVALID", "$.artifacts", "A PILOT needs exactly one machine-readable negative-log JSONL artifact");
  }
  for (const [path] of jsonlLogs) {
    const snapshot = snapshots.get(path);
    if (!snapshot) continue;
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot.content);
    } catch {
      add(errors, "PILOT_NEGATIVE_LOG_INVALID", path, "Negative-log JSONL must be valid UTF-8");
      continue;
    }
    if (text === "" || !text.endsWith("\n") || text.includes("\r") || text.startsWith("\uFEFF")) {
      add(errors, "PILOT_NEGATIVE_LOG_INVALID", path, "Negative-log JSONL must be non-empty LF-terminated JSONL");
      continue;
    }
    for (const [index, line] of text.slice(0, -1).split("\n").entries()) {
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        add(errors, "PILOT_NEGATIVE_LOG_INVALID", `${path}:${index + 1}`, "Negative-log record is not JSON");
        continue;
      }
      if (!isObject(record) || (typeof record.cellId !== "string" && record.cellId !== null) ||
          typeof record.status !== "string" || typeof record.reason !== "string") {
        add(errors, "PILOT_NEGATIVE_LOG_INVALID", `${path}:${index + 1}`, "Negative-log record lacks cellId, status, or reason");
        continue;
      }
      negativeRecords.push(record);
    }
  }
  const expectedNegative = summary.cells.filter((entry) =>
    isObject(entry) && (entry.status !== "passed" || entry.verdict === "blocked")
  );
  for (const entry of expectedNegative) {
    if (typeof entry.reason !== "string" || entry.reason.trim() === "" || containsPlaceholder(entry.reason)) {
      add(errors, "PILOT_NEGATIVE_REASON_MISSING", `${summaryPath}#${entry.id ?? "unknown"}`, "Every negative or skipped run-summary outcome needs a resolved reason");
    }
  }
  if (expectedNegative.length === 0) {
    if (negativeRecords.length !== 1 || negativeRecords[0].cellId !== null ||
        negativeRecords[0].status !== "none" || (negativeRecords[0].verdict ?? null) !== null ||
        negativeRecords[0].reason !== "no-negative-evidence-observed") {
      add(errors, "PILOT_NEGATIVE_LOG_INCOMPLETE", "$.artifacts", "An all-pass PILOT needs the exact no-negative-evidence sentinel");
    }
  } else if (negativeRecords.length !== expectedNegative.length || expectedNegative.some((entry, index) => {
    const record = negativeRecords[index];
    return !record || record.cellId !== entry.id || record.status !== entry.status ||
      (record.verdict ?? null) !== (entry.verdict ?? null) || record.reason !== entry.reason;
  })) {
    add(errors, "PILOT_NEGATIVE_LOG_INCOMPLETE", "$.artifacts", "Negative-log JSONL must exactly preserve every negative or skipped run-summary outcome in order");
  }
  for (const cellId of skipped) {
    const entry = summaryCells.get(cellId);
    const reason = typeof entry?.reason === "string" ? entry.reason.trim() : "";
    if (entry?.status !== "not-run" || reason === "" || containsPlaceholder(reason)) {
      add(errors, "PILOT_SKIPPED_CELL_REASON_MISSING", `${summaryPath}#${cellId}`, "Every skipped preregistered cell must be recorded as not-run with a resolved reason");
      continue;
    }
  }
}

function validateProtocolBinding(root, manifest, declared, snapshots, errors, options) {
  const protocolPath = manifest.protocol?.path;
  if (typeof protocolPath !== "string") return null;
  const protocolArtifact = declared.get(protocolPath);
  if (!protocolArtifact || protocolArtifact.role !== "protocol" || protocolArtifact.immutable !== true) {
    add(errors, "PROTOCOL_ARTIFACT_INVALID", "$.protocol.path", "Protocol must be an immutable artifact with role protocol");
  }
  const observed = snapshots.get(protocolPath);
  if (!observed) return null;
  const cells = Array.isArray(manifest.cells) ? manifest.cells : [];
  if (manifest.protocol.sha256 !== observed.sha256) {
    add(errors, cells.length > 0 ? "PROTOCOL_CHANGED_AFTER_CELLS" : "PROTOCOL_DIGEST_MISMATCH", "$.protocol.sha256", "Protocol digest does not match the registered artifact");
  }
  for (const [index, cell] of cells.entries()) {
    if (isObject(cell) && cell.protocolSha256 !== manifest.protocol.sha256) {
      add(errors, "CELL_PROTOCOL_DIGEST_MISMATCH", `$.cells[${index}].protocolSha256`, "Cell is not bound to the registered protocol digest");
    }
  }
  const registration = manifest.protocol?.sourceRegistration;
  const sourceRepository = (manifest.environment?.repositories ?? []).find((entry) =>
    isObject(entry) && entry.repository === registration?.repository && entry.revision === registration?.revision
  );
  if (isObject(registration) && !sourceRepository) {
    add(errors, "PROTOCOL_SOURCE_SNAPSHOT_MISSING", "$.protocol.sourceRegistration", "Protocol registration revision is absent from the execution environment");
  } else if (sourceRepository?.dirty !== false) {
    add(errors, "PROTOCOL_SOURCE_DIRTY", "$.protocol.sourceRegistration", "The registered protocol source must be recorded as clean");
  }
  const anchor = verifyGitRegistration(
    registration,
    options?.sourceRepositoryRoot ?? fileURLToPath(new URL("..", import.meta.url)),
    observed.content,
    errors,
    "$.protocol.sourceRegistration"
  );
  return { protocol: readJsonBytes(observed.content, errors, "$.protocol"), anchor };
}

function validateCellSemantics(protocol, manifest, declared, errors, anchor) {
  const registered = utcTimestamp(protocol?.registeredAt);
  const cells = Array.isArray(manifest.cells) ? manifest.cells : [];
  const plannedById = new Map(protocol.plannedCells.map((cell) => [cell.id, cell]));
  uniqueIds(cells, "$.cells", errors);
  const processInstances = new Set((manifest.environment?.processes ?? []).map((process) => process?.instanceId));
  const attemptIds = new Set();
  const starts = [];
  for (const [index, cell] of cells.entries()) {
    if (!isObject(cell)) continue;
    const started = utcTimestamp(cell.startedAt);
    const ended = utcTimestamp(cell.endedAt);
    if (started !== null) starts.push(started);
    if (started !== null && ended !== null && ended < started) {
      add(errors, "CELL_TIMESTAMP_ORDER_INVALID", `$.cells[${index}].endedAt`, "Cell end precedes cell start");
    }
    if (cell.attemptId !== null && attemptIds.has(cell.attemptId)) {
      add(errors, "DUPLICATE_ATTEMPT_ID", `$.cells[${index}].attemptId`, "Non-null attempt id is already used by another cell");
    }
    if (cell.attemptId !== null) attemptIds.add(cell.attemptId);
    if (cell.processInstanceId !== null && !processInstances.has(cell.processInstanceId)) {
      add(errors, "UNKNOWN_PROCESS_INSTANCE", `$.cells[${index}].processInstanceId`, "Cell process instance is absent from the environment ledger");
    }
    const planned = plannedById.get(cell.id);
    if (planned && cell.expectedVerdict !== planned.expectedVerdict) {
      add(errors, "CELL_EXPECTATION_MISMATCH", `$.cells[${index}].expectedVerdict`, "Cell expectation must equal its preregistered expectedVerdict");
    }
    const rawPaths = new Set(Array.isArray(cell.rawArtifactPaths) ? cell.rawArtifactPaths : []);
    if (rawPaths.size !== cell.rawArtifactPaths.length) {
      add(errors, "DUPLICATE_CELL_RAW_ARTIFACT_PATH", `$.cells[${index}].rawArtifactPaths`, "Cell raw artifact paths must be unique");
    }
    for (const [rawIndex, artifactPath] of (cell.rawArtifactPaths ?? []).entries()) {
      const artifact = declared.get(artifactPath);
      if (!artifact || artifact.role !== "raw") {
        add(errors, "CELL_RAW_ARTIFACT_INVALID", `$.cells[${index}].rawArtifactPaths[${rawIndex}]`, "Cell raw path must reference a declared raw artifact");
      }
    }
    for (const [field, label] of [
      ["restartReceiptArtifactPath", "restart receipt"],
      ["rawLedgerArtifactPath", "raw ledger"]
    ]) {
      const artifactPath = cell[field];
      if (artifactPath === null) continue;
      const artifact = declared.get(artifactPath);
      if (!rawPaths.has(artifactPath) || !artifact || artifact.role !== "raw") {
        add(errors, "CELL_RAW_BINDING_INVALID", `$.cells[${index}].${field}`, `Cell ${label} must be present in its declared raw artifacts`);
      }
    }
    const unresolved = cell.resolution?.state === "unresolved";
    const indeterminateVerdict = cell.verdict === "indeterminate";
    if (unresolved !== indeterminateVerdict || (cell.status === "indeterminate" && !unresolved)) {
      add(errors, "CELL_OUTCOME_INCONSISTENT", `$.cells[${index}].resolution.state`, "Indeterminate truth requires an unresolved state; indeterminate orchestration cannot claim a terminal verdict");
    }
    const completeBindings = cell.startedAt !== null && cell.endedAt !== null && cell.attemptId !== null &&
      cell.processInstanceId !== null && cell.restartReceiptArtifactPath !== null &&
      cell.rawLedgerArtifactPath !== null && cell.rawArtifactPaths.length > 0;
    if (cell.status === "completed" && (!completeBindings || unresolved)) {
      add(errors, "COMPLETED_CELL_EVIDENCE_INCOMPLETE", `$.cells[${index}]`, "A completed cell requires terminal truth and all process, restart, ledger, and timestamp bindings");
    }
    if (["VERIFIED", "PUBLISHED"].includes(manifest.releaseStatus) &&
        (cell.status !== "completed" || unresolved || !completeBindings)) {
      add(errors, "NONTERMINAL_RELEASE_CELL", `$.cells[${index}].status`, "VERIFIED and PUBLISHED cells must be completed and resolved");
    }
  }
  if (registered !== null && starts.length > 0 && registered >= Math.min(...starts)) {
    add(errors, "PROTOCOL_REGISTERED_AFTER_CELL", "$.protocol.registeredAt", "Protocol registration must precede the first cell");
  }
  if (anchor && anchor.commitTimestamp !== null && starts.length > 0 && anchor.commitTimestamp >= Math.min(...starts)) {
    add(errors, "PROTOCOL_COMMIT_AFTER_CELL", "$.protocol.sourceRegistration.revision", "Registered Git commit must precede the first cell");
  }
  const generated = utcTimestamp(manifest.generatedAt);
  const ends = cells.map((cell) => utcTimestamp(cell.endedAt)).filter((value) => value !== null);
  if (generated !== null && ends.length > 0 && generated < Math.max(...ends)) {
    add(errors, "MANIFEST_GENERATED_BEFORE_CELL_END", "$.generatedAt", "Execution manifest cannot predate a recorded cell end");
  }
}

function validateDirtyStates(manifest, errors) {
  uniqueIds(manifest.environment?.repositories, "$.environment.repositories", errors);
  uniqueIds(manifest.environment?.runtimes, "$.environment.runtimes", errors);
  uniqueIds(manifest.environment?.tools, "$.environment.tools", errors);
  uniqueIds(manifest.environment?.credentials, "$.environment.credentials", errors);
  uniqueIds(manifest.environment?.stores, "$.environment.stores", errors);
  uniqueIds(manifest.environment?.processes, "$.environment.processes", errors);
  const processInstances = new Set();
  if (["VERIFIED", "PUBLISHED"].includes(manifest.releaseStatus) && manifest.environment.stores.length === 0) {
    add(errors, "NONTERMINAL_RELEASE_ENVIRONMENT", "$.environment.stores", "VERIFIED and PUBLISHED releases require at least one bound store");
  }
  for (const [index, process] of (manifest.environment?.processes ?? []).entries()) {
    if (!isObject(process) || typeof process.instanceId !== "string") continue;
    if (processInstances.has(process.instanceId)) {
      add(errors, "DUPLICATE_PROCESS_INSTANCE", `$.environment.processes[${index}].instanceId`, "Process instance is already declared");
    }
    processInstances.add(process.instanceId);
  }
  for (const [index, repository] of (manifest.environment?.repositories ?? []).entries()) {
    if (!isObject(repository) || !Array.isArray(repository.dirtyPaths)) continue;
    if (repositoryEmbedsCredentials(repository.repository)) {
      add(errors, "REPOSITORY_CREDENTIALS_FORBIDDEN", `$.environment.repositories[${index}].repository`, "Repository locators must not embed credentials");
    }
    if (repository.dirty === false && repository.dirtyPaths.length > 0) {
      add(errors, "DIRTY_STATE_INCONSISTENT", `$.environment.repositories[${index}].dirtyPaths`, "A clean repository cannot declare dirty paths");
    }
    if (repository.dirty === true && repository.dirtyPaths.length === 0) {
      add(errors, "DIRTY_STATE_INCONSISTENT", `$.environment.repositories[${index}].dirtyPaths`, "A dirty repository must identify its dirty paths");
    }
  }
}

function validateImmutabilityPolicy(manifest, errors) {
  const binding = manifest.immutabilityPolicy?.externalBinding;
  const expected = manifest.releaseStatus === "PUBLISHED" ? "git-commit" : "validation-snapshot";
  if (binding !== expected) {
    add(errors, "IMMUTABILITY_BINDING_MISMATCH", "$.immutabilityPolicy.externalBinding", `${manifest.releaseStatus} requires ${expected}`);
  }
}

function verifyPublishedRelease(root, tree, snapshots, manifestSnapshot, manifest, errors, options) {
  if (manifest.releaseStatus !== "PUBLISHED") return null;
  let sourceRoot;
  try {
    sourceRoot = realpathSync(resolve(options?.sourceRepositoryRoot ?? fileURLToPath(new URL("..", import.meta.url))));
  } catch (error) {
    filesystemError(errors, "$.releaseRegistration", error);
    return null;
  }
  const discovered = gitRootFromPath(join(root, manifestFileName), errors, "$.releaseRegistration");
  if (!discovered || !sameHostPath(discovered, sourceRoot)) {
    if (discovered && !sameHostPath(discovered, sourceRoot)) {
      add(errors, "PUBLISHED_RELEASE_REPOSITORY_MISMATCH", "$.releaseRegistration", "Published release is outside the source Git repository");
    }
    return null;
  }
  const releasePath = portablePath(sourceRoot, root);
  if (!safeRelativePath(releasePath)) {
    add(errors, "PUBLISHED_RELEASE_PATH_INVALID", "$.releaseRegistration", "Published release root must be a portable repository subdirectory");
    return null;
  }
  const origin = gitOrigin(sourceRoot, errors, "$.releaseRegistration.repository");
  if (!origin || normalizeRepository(origin, sourceRoot) !==
      normalizeRepository(manifest.protocol.sourceRegistration.repository, sourceRoot)) {
    if (origin) add(errors, "GIT_REMOTE_MISMATCH", "$.releaseRegistration.repository", "Published release origin differs from protocol registration origin");
    return null;
  }
  const literalReleasePath = `:(literal)${releasePath}`;
  const releaseCommit = gitRun(sourceRoot, ["log", "-1", "--format=%H", "--", literalReleasePath]);
  if (!releaseCommit.ok) {
    gitFailure(errors, "GIT_COMMIT_MISSING", "$.releaseRegistration.revision", "Published release commit lookup", releaseCommit);
    return null;
  }
  const revision = releaseCommit.stdout.toString("utf8").trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    add(errors, "GIT_COMMIT_MISSING", "$.releaseRegistration.revision", "Published release has no containing Git commit");
    return null;
  }
  remoteContainsRevision(sourceRoot, revision, errors, "$.releaseRegistration.revision");
  const status = gitRun(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all", "--", literalReleasePath]);
  if (!status.ok) {
    gitFailure(errors, "GIT_STATUS_FAILED", "$.releaseRegistration", "Published release status check", status);
  } else if (status.stdout.length > 0) {
    add(errors, "PUBLISHED_RELEASE_NOT_COMMITTED", "$.releaseRegistration", "Published release contains uncommitted or untracked paths");
  }
  const fileSnapshots = new Map(snapshots);
  fileSnapshots.set(manifestFileName, manifestSnapshot);
  for (const artifactPath of [...releaseFiles(tree)].sort(lexicalCompare)) {
    const snapshot = fileSnapshots.get(artifactPath);
    if (!snapshot) continue;
    const repositoryPath = `${releasePath}/${artifactPath}`;
    const blob = gitRun(sourceRoot, ["show", `${revision}:${repositoryPath}`]);
    if (!blob.ok) {
      gitFailure(errors, "PUBLISHED_ARTIFACT_NOT_COMMITTED", artifactPath, "Published artifact Git blob lookup", blob);
    } else if (!blob.stdout.equals(snapshot.content)) {
      add(errors, "PUBLISHED_ARTIFACT_BLOB_MISMATCH", artifactPath, "Working artifact bytes differ from the published Git blob");
    }
  }
  return { revision, path: releasePath, origin };
}

function unexpected(errors, error) {
  const detail = typeof error?.code === "string" ? ` (${error.code})` : "";
  add(errors, "VALIDATION_INTERNAL_ERROR", "$", `Validator could not complete${detail}`);
  return result(errors);
}

function checkTreeQuiescence(root, before, errors) {
  const after = new Map();
  walkRelease(root, root, after, errors);
  if (!sameTree(before, after)) {
    add(errors, "RELEASE_CHANGED_DURING_VALIDATION", "$", "Release tree changed during validation");
  }
}

function protocolInspection(validation, protocol = null, snapshot = null, anchor = null) {
  return {
    validation,
    protocol,
    bytes: snapshot ? Buffer.from(snapshot.content) : null,
    sha256: snapshot?.sha256 ?? null,
    sourceRegistration: anchor ? {
      repository: anchor.origin,
      revision: anchor.revision,
      path: anchor.path
    } : null
  };
}

export function loadBenchmarkProtocol(protocolFile, options = {}) {
  const errors = [];
  try {
    if (typeof protocolFile !== "string" || protocolFile.length === 0) {
      add(errors, "INVALID_ARGUMENT", "$", "Protocol file is required");
      return protocolInspection(result(errors));
    }
    const requestedPath = resolve(protocolFile);
    if (!existsSync(requestedPath)) {
      add(errors, "PROTOCOL_FILE_MISSING", "$", "Protocol path is not a regular file");
      return protocolInspection(result(errors));
    }
    let requestedStatus;
    try {
      requestedStatus = lstatSync(requestedPath);
    } catch (error) {
      filesystemError(errors, "$", error);
      return protocolInspection(result(errors));
    }
    if (requestedStatus.isSymbolicLink()) {
      add(errors, "UNSAFE_SYMLINK_PATH", "$", "Protocol path must not be a symbolic link");
      return protocolInspection(result(errors));
    }
    const path = realpathSync(requestedPath);
    const repositoryRoot = gitRootFromPath(path, errors, "$.sourceRegistration");
    if (!repositoryRoot) return protocolInspection(result(errors));
    const relativePath = portablePath(repositoryRoot, path);
    const resolvedPath = resolveArtifact(repositoryRoot, relativePath, errors, "$.sourceRegistration.path");
    if (!resolvedPath) return protocolInspection(result(errors));
    const snapshot = readStableRegularFile(resolvedPath, repositoryRoot, errors, "$.protocol");
    if (!snapshot) return protocolInspection(result(errors));
    const protocol = readJsonBytes(snapshot.content, errors, "$.protocol");
    if (!isObject(protocol)) return protocolInspection(result(errors), null, snapshot);
    const structuralStart = errors.length;
    schemaValidate(protocol, protocolSchema, protocolSchema, "$.protocol", errors);
    if (errors.length !== structuralStart) return protocolInspection(result(errors), protocol, snapshot);
    validateProtocolSemantics(protocol, null, errors);
    const anchor = verifyProtocolCheckout(path, snapshot.content, errors, {
      ...options,
      sourceRepositoryRoot: options.sourceRepositoryRoot ?? repositoryRoot
    });
    const validation = result(errors, {
      protocolId: protocol.protocolId,
      plannedCells: protocol.plannedCells.length,
      sourceRegistration: anchor ? {
        repository: anchor.origin,
        revision: anchor.revision,
        path: anchor.path
      } : null
    });
    return protocolInspection(validation, protocol, snapshot, anchor);
  } catch (error) {
    return protocolInspection(unexpected(errors, error));
  }
}

export function validateBenchmarkProtocol(protocolFile, options = {}) {
  return loadBenchmarkProtocol(protocolFile, options).validation;
}

export function validateBenchmarkRelease(releaseRoot, options = {}) {
  const errors = [];
  try {
    if (typeof releaseRoot !== "string" || releaseRoot.length === 0) {
      add(errors, "INVALID_ARGUMENT", "$", "Release root is required");
      return result(errors);
    }
    const requestedRoot = resolve(releaseRoot);
    if (!existsSync(requestedRoot)) {
      add(errors, "RELEASE_ROOT_MISSING", "$", "Release root is not a directory");
      return result(errors);
    }
    let rootStatus;
    try {
      rootStatus = lstatSync(requestedRoot);
    } catch (error) {
      filesystemError(errors, "$", error);
      return result(errors);
    }
    if (rootStatus.isSymbolicLink()) {
      add(errors, "UNSAFE_SYMLINK_PATH", "$", "Release root must not be a symbolic link");
      return result(errors);
    }
    if (!rootStatus.isDirectory()) {
      add(errors, "RELEASE_ROOT_MISSING", "$", "Release root is not a directory");
      return result(errors);
    }
    // Work from the canonical root. Static platform aliases such as macOS /var
    // -> /private/var are safe once resolved; descendants are still checked
    // component-by-component and the tree is snapshotted twice.
    const root = realpathSync(requestedRoot);
    const tree = new Map();
    walkRelease(root, root, tree, errors);
    const files = releaseFiles(tree);
    const manifestPath = join(root, manifestFileName);
    if (!files.has(manifestFileName)) {
      add(errors, "MANIFEST_MISSING", manifestFileName, "Execution manifest is missing");
      checkTreeQuiescence(root, tree, errors);
      return result(errors);
    }
    const manifestSnapshot = readStableRegularFile(
      manifestPath,
      root,
      errors,
      "$manifest",
      tree.get(manifestFileName) ?? null
    );
    if (!manifestSnapshot) {
      checkTreeQuiescence(root, tree, errors);
      return result(errors);
    }
    const manifest = readJsonBytes(manifestSnapshot.content, errors, "$manifest");
    if (!isObject(manifest)) {
      checkTreeQuiescence(root, tree, errors);
      return result(errors);
    }
    const manifestStructuralStart = errors.length;
    schemaValidate(manifest, manifestSchema, manifestSchema, "$", errors);
    if (errors.length !== manifestStructuralStart) {
      checkTreeQuiescence(root, tree, errors);
      return result(errors);
    }
    const { declared, snapshots } = validateArtifacts(root, manifest, files, tree, errors);
    const binding = validateProtocolBinding(root, manifest, declared, snapshots, errors, options);
    if (isObject(binding?.protocol)) {
      const protocolStructuralStart = errors.length;
      schemaValidate(binding.protocol, protocolSchema, protocolSchema, "$.protocol", errors);
      if (errors.length === protocolStructuralStart) {
        validateProtocolSemantics(binding.protocol, manifest, errors);
        validateCellSemantics(binding.protocol, manifest, declared, errors, binding.anchor);
        validatePilotSkipEvidence(binding.protocol, manifest, declared, snapshots, errors);
      }
    }
    validateDirtyStates(manifest, errors);
    validateImmutabilityPolicy(manifest, errors);
    const published = verifyPublishedRelease(root, tree, snapshots, manifestSnapshot, manifest, errors, options);
    checkTreeQuiescence(root, tree, errors);
    return result(errors, {
      releaseId: manifest.releaseId,
      artifacts: manifest.artifacts.length,
      cells: manifest.cells.length,
      manifestSha256: manifestSnapshot.sha256,
      releaseRegistration: published
    });
  } catch (error) {
    return unexpected(errors, error);
  }
}

export function validateBenchmarkReleaseSet(searchRoot, options = {}) {
  const errors = [];
  try {
    if (typeof searchRoot !== "string" || searchRoot.length === 0) {
      add(errors, "INVALID_ARGUMENT", "$", "Release search root is required");
      return result(errors, null, releaseSetValidationSchemaVersion);
    }
    const requestedRoot = resolve(searchRoot);
    if (!existsSync(requestedRoot)) {
      add(errors, "RELEASE_SET_ROOT_MISSING", "$", "Release search root is not a directory");
      return result(errors, null, releaseSetValidationSchemaVersion);
    }
    let rootStatus;
    try {
      rootStatus = lstatSync(requestedRoot);
    } catch (error) {
      filesystemError(errors, "$", error);
      return result(errors, null, releaseSetValidationSchemaVersion);
    }
    if (rootStatus.isSymbolicLink()) {
      add(errors, "UNSAFE_SYMLINK_PATH", "$", "Release search root must not be a symbolic link");
      return result(errors, null, releaseSetValidationSchemaVersion);
    }
    if (!rootStatus.isDirectory()) {
      add(errors, "RELEASE_SET_ROOT_MISSING", "$", "Release search root is not a directory");
      return result(errors, null, releaseSetValidationSchemaVersion);
    }
    const root = realpathSync(requestedRoot);
    const tree = new Map();
    walkRelease(root, root, tree, errors);
    const manifestPaths = [...releaseFiles(tree)]
      .filter((path) => posix.basename(path) === manifestFileName)
      .sort(lexicalCompare);
    const releases = manifestPaths.map((manifestPath) => {
      const releasePath = posix.dirname(manifestPath);
      const absoluteRoot = releasePath === "." ? root : resolve(root, ...releasePath.split("/"));
      const validation = validateBenchmarkRelease(absoluteRoot, options);
      if (!validation.valid) {
        add(errors, "RELEASE_SET_MEMBER_INVALID", manifestPath, "Discovered benchmark release failed validation");
      }
      return { path: releasePath, validation };
    });
    checkTreeQuiescence(root, tree, errors);
    return result(errors, { searchRoot: ".", releaseCount: releases.length, releases }, releaseSetValidationSchemaVersion);
  } catch (error) {
    const detail = typeof error?.code === "string" ? ` (${error.code})` : "";
    add(errors, "VALIDATION_INTERNAL_ERROR", "$", `Release discovery could not complete${detail}`);
    return result(errors, null, releaseSetValidationSchemaVersion);
  }
}

function result(errors, summary = null, schemaVersion = validationSchemaVersion) {
  const unique = [...new Map(errors.map((error) => [
    `${error.code}\0${error.path}\0${error.message}`,
    error
  ])).values()];
  unique.sort((left, right) =>
    lexicalCompare(left.code, right.code) || lexicalCompare(left.path, right.path) || lexicalCompare(left.message, right.message)
  );
  return { schemaVersion, valid: unique.length === 0, errors: unique, summary };
}
