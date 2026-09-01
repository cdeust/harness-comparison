import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync
} from "node:fs";
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from "node:path";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const utcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const identityFields = [
  "attempt_id",
  "cell_id",
  "process_instance_id",
  "protocol_id",
  "protocol_sha256",
  "release_id"
];
const genesisHash = "0".repeat(64);

export class EvidenceError extends Error {
  constructor(code, path, message) {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
    this.path = path;
  }
}

export function failEvidence(code, path, message) {
  throw new EvidenceError(code, path, message);
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function utcTimestamp(value) {
  if (typeof value !== "string" || !utcPattern.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

export function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") ||
      value.includes("\\") || isAbsolute(value) || win32.isAbsolute(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part !== "" && part !== "." && part !== "..") &&
    posix.normalize(value) === value;
}

function portablePath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function fileIdentity(status) {
  return [
    status.dev,
    status.ino,
    status.mode,
    status.nlink,
    status.size,
    status.mtimeNs,
    status.ctimeNs
  ].map(String).join(":");
}

function stableFile(path, publicPath) {
  let descriptor;
  try {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile()) failEvidence("UNSAFE_ARTIFACT_TYPE", publicPath, "Evidence must be a regular file");
    if (before.nlink !== 1n) failEvidence("UNSAFE_HARDLINK", publicPath, "Evidence must not be hard-linked");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (fileIdentity(before) !== fileIdentity(after)) {
      failEvidence("EVIDENCE_CHANGED_DURING_READ", publicPath, "Evidence changed while it was read");
    }
    return { bytes, sha256: sha256(bytes), bytesLength: bytes.length, identity: fileIdentity(after) };
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    failEvidence("EVIDENCE_READ_FAILED", publicPath, `Evidence could not be read (${error?.code ?? "unknown"})`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function walk(root, current, files, directories) {
  const children = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
    lexicalCompare(left.name, right.name)
  );
  for (const child of children) {
    const absolute = join(current, child.name);
    const publicPath = portablePath(root, absolute);
    const status = lstatSync(absolute, { bigint: true });
    if (status.isSymbolicLink()) failEvidence("UNSAFE_SYMLINK", publicPath, "Evidence paths must not be symbolic links");
    if (status.isDirectory()) {
      directories.set(publicPath, fileIdentity(status));
      walk(root, absolute, files, directories);
    } else if (status.isFile()) {
      files.set(publicPath, stableFile(absolute, publicPath));
    } else {
      failEvidence("UNSAFE_ARTIFACT_TYPE", publicPath, "Only regular files and directories are permitted");
    }
  }
}

export function snapshotRelease(requestedRoot, exclusions = new Set()) {
  const absolute = resolve(requestedRoot);
  if (!existsSync(absolute)) failEvidence("RELEASE_MISSING", "$", "Release root does not exist");
  if (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isDirectory()) {
    failEvidence("UNSAFE_RELEASE_ROOT", "$", "Release root must be a real directory");
  }
  const root = realpathSync(absolute);
  const allFiles = new Map();
  const directories = new Map();
  walk(root, root, allFiles, directories);
  const files = new Map([...allFiles].filter(([path]) => !exclusions.has(path)));
  return { root, files, allFiles, directories };
}

export function sameSnapshot(left, right) {
  const normalize = (snapshot) => ({
    files: [...snapshot.files].map(([path, item]) => [path, item.sha256, item.bytesLength, item.identity]),
    directories: [...snapshot.directories]
  });
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export function requireSnapshotFile(snapshot, path) {
  if (!safeRelativePath(path)) failEvidence("UNSAFE_ARTIFACT_PATH", path, "Artifact path is not release-relative");
  const file = snapshot.files.get(path);
  if (!file) failEvidence("ARTIFACT_MISSING", path, "Required artifact is absent");
  return file;
}

export function parseJsonFile(snapshot, path) {
  const file = requireSnapshotFile(snapshot, path);
  try {
    const value = JSON.parse(file.bytes.toString("utf8"));
    if (!isPlainObject(value)) failEvidence("INVALID_JSON_OBJECT", path, "Artifact must contain one JSON object");
    return value;
  } catch (error) {
    if (error instanceof EvidenceError) throw error;
    failEvidence("INVALID_JSON", path, "Artifact is not valid JSON");
  }
}

function keysCanonical(value) {
  if (Array.isArray(value)) return value.every(keysCanonical);
  if (!isPlainObject(value)) return true;
  const keys = Object.keys(value);
  if (JSON.stringify(keys) !== JSON.stringify([...keys].sort(lexicalCompare))) return false;
  return keys.every((key) => keysCanonical(value[key]));
}

function noJsonWhitespace(raw) {
  let quoted = false;
  let escaped = false;
  for (const character of raw) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") quoted = false;
    } else if (character === "\"") quoted = true;
    else if (/\s/u.test(character)) return false;
  }
  return !quoted && !escaped;
}

function identityOf(record) {
  return Object.fromEntries(identityFields.map((field) => [field, record[field]]));
}

function validateLedgerIdentity(identity, expected, path) {
  for (const field of identityFields) {
    if (typeof identity[field] !== "string" || identity[field] === "") {
      failEvidence("LEDGER_IDENTITY_INCOMPLETE", path, `Ledger identity ${field} is absent`);
    }
    if (expected && Object.hasOwn(expected, field) && identity[field] !== expected[field]) {
      failEvidence("LEDGER_IDENTITY_MISMATCH", path, `Ledger identity ${field} contradicts its process receipt`);
    }
  }
  if (!sha256Pattern.test(identity.protocol_sha256)) {
    failEvidence("LEDGER_IDENTITY_INCOMPLETE", path, "Ledger protocol digest is not lowercase SHA-256");
  }
}

export function verifyLedgerBytes(bytes, path, expectedIdentity = null) {
  const text = bytes.toString("utf8");
  if (text === "" || !text.endsWith("\n") || text.includes("\r") || text.startsWith("\uFEFF")) {
    failEvidence("LEDGER_FRAMING_INVALID", path, "Ledger must be non-empty LF-terminated UTF-8 JSONL");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.some((line) => line === "")) failEvidence("LEDGER_FRAMING_INVALID", path, "Ledger contains a blank line");
  let previous = genesisHash;
  let boundIdentity = null;
  let priorMonotonic = null;
  let priorTimestamp = null;
  const records = [];
  for (const [index, raw] of lines.entries()) {
    if (!noJsonWhitespace(raw)) failEvidence("LEDGER_NOT_CANONICAL", `${path}:${index + 1}`, "Ledger line contains non-canonical whitespace");
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      failEvidence("LEDGER_JSON_INVALID", `${path}:${index + 1}`, "Ledger line is not valid JSON");
    }
    if (!isPlainObject(record) || !keysCanonical(record)) {
      failEvidence("LEDGER_NOT_CANONICAL", `${path}:${index + 1}`, "Ledger keys are not recursively sorted");
    }
    const hashMatches = [...raw.matchAll(/,"line_sha256":"([0-9a-f]{64})"/gu)];
    if (hashMatches.length !== 1 || record.line_sha256 !== hashMatches[0][1]) {
      failEvidence("LEDGER_HASH_FIELD_INVALID", `${path}:${index + 1}`, "Ledger line hash field is not canonical");
    }
    const payload = raw.replace(hashMatches[0][0], "");
    const observedHash = sha256(Buffer.from(payload, "utf8"));
    if (observedHash !== record.line_sha256) {
      failEvidence("LEDGER_HASH_INVALID", `${path}:${index + 1}`, "Ledger line SHA-256 does not match its payload");
    }
    if (record.schema !== "hc-cortex-002-ledger/v1" || record.sequence !== index + 1 ||
        record.prev_sha256 !== previous) {
      failEvidence("LEDGER_CHAIN_INVALID", `${path}:${index + 1}`, "Ledger schema, sequence, or predecessor is invalid");
    }
    if (typeof record.event !== "string" || record.event === "" || !utcTimestamp(record.recorded_at) ||
        typeof record.monotonic_ns !== "string" || !/^(?:0|[1-9]\d*)$/u.test(record.monotonic_ns)) {
      failEvidence("LEDGER_EVENT_INVALID", `${path}:${index + 1}`, "Ledger event metadata is incomplete");
    }
    const monotonic = BigInt(record.monotonic_ns);
    const timestamp = Date.parse(record.recorded_at);
    if ((priorMonotonic !== null && monotonic < priorMonotonic) ||
        (priorTimestamp !== null && timestamp < priorTimestamp)) {
      failEvidence("LEDGER_EVENT_ORDER_INVALID", `${path}:${index + 1}`, "Ledger clocks move backwards");
    }
    const identity = identityOf(record);
    validateLedgerIdentity(identity, expectedIdentity, `${path}:${index + 1}`);
    if (boundIdentity === null) boundIdentity = identity;
    else if (JSON.stringify(boundIdentity) !== JSON.stringify(identity)) {
      failEvidence("LEDGER_IDENTITY_CHANGED", `${path}:${index + 1}`, "Ledger identity changes within one chain");
    }
    previous = record.line_sha256;
    priorMonotonic = monotonic;
    priorTimestamp = timestamp;
    records.push(record);
  }
  return { records, identity: boundIdentity, terminalSha256: previous, sha256: sha256(bytes), bytes: bytes.length };
}

export function inventory(snapshot) {
  return [...snapshot.files].map(([path, item]) => ({
    path,
    sha256: item.sha256,
    bytes: item.bytesLength
  }));
}

export function inventoryDigest(entries) {
  const canonical = entries.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`).join("\n");
  return sha256(Buffer.from(canonical, "utf8"));
}

const postgresConnectionPattern = /postgres(?:ql)?:\/\/(?!<redacted>)[^\s"']+/iu;
const fileUrlPattern = /file:\/{2,3}(?!<redacted>)[^\s"']+/iu;
const secretAssignmentPattern = /(?:password|passwd|passfile|sslkey|secret|token|api[_-]?key|private[_-]?key|authorization)["']?\s*[=:]\s*(?!false\b|null\b|["']?<redacted>)[^\s,"']+/iu;
const embeddedPosixPathPattern = /(?:^|[\s("'=,\[])\/(?!\/)[^\s"'<>|,\])}]+/u;
const absoluteWindowsPathPattern = /^(?:[A-Za-z]:[\\/]|\\\\)/u;
const embeddedWindowsPathPattern = /(?:^|[\s("'=,\[])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>|,\])}]*/u;
const secretKeyPattern = /(?:password|passwd|passfile|sslkey|secret|token|api[_-]?key|private[_-]?key|authorization)/iu;
const safeSecretMetadataKeys = new Set(["passwordmaterialrecorded", "secretmaterialrecorded"]);

function addFinding(findings, code, path) {
  if (!findings.some((finding) => finding.code === code && finding.path === path)) {
    findings.push({ code, path });
  }
}

function isRedacted(value) {
  return typeof value === "string" && /^(?:<redacted(?:-path)?>|redacted)$/iu.test(value.trim());
}

function secretValuePresent(value) {
  if (value === null || value === false || value === "" || isRedacted(value)) return false;
  return true;
}

function scanString(path, value, findings) {
  if (postgresConnectionPattern.test(value)) addFinding(findings, "POSTGRESQL_CONNECTION_STRING", path);
  if (fileUrlPattern.test(value)) addFinding(findings, "PRIVATE_FILE_URL", path);
  if (secretAssignmentPattern.test(value)) addFinding(findings, "SECRET_MATERIAL", path);
  if (isAbsolute(value) || embeddedPosixPathPattern.test(value)) {
    addFinding(findings, "PRIVATE_POSIX_PATH", path);
  }
  if (absoluteWindowsPathPattern.test(value) || embeddedWindowsPathPattern.test(value)) {
    addFinding(findings, "PRIVATE_WINDOWS_PATH", path);
  }
}

function scanStructured(path, value, findings) {
  if (typeof value === "string") {
    scanString(path, value, findings);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) scanStructured(path, entry, findings);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    scanString(path, key, findings);
    const normalizedKey = key.replaceAll(/[^A-Za-z0-9]/gu, "").toLowerCase();
    if (secretKeyPattern.test(key) && !safeSecretMetadataKeys.has(normalizedKey) && secretValuePresent(entry)) {
      addFinding(findings, "SECRET_KEY_MATERIAL", path);
    }
    if (safeSecretMetadataKeys.has(normalizedKey) && entry !== false) {
      addFinding(findings, "SECRET_KEY_MATERIAL", path);
    }
    scanStructured(path, entry, findings);
  }
}

function parseStructured(path, text) {
  try {
    return JSON.parse(text);
  } catch {
    // JSONL is parsed as independent objects so secret-bearing keys cannot hide
    // behind JSON string escaping. Other text formats use the bounded patterns.
  }
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (path.toLowerCase().endsWith(".jsonl") || lines.length > 1) {
    try {
      return lines.map((line) => JSON.parse(line));
    } catch {
      return null;
    }
  }
  return null;
}

function isTextual(bytes) {
  // Decoding arbitrary bytes as UTF-8 always succeeds (Node substitutes U+FFFD for invalid
  // sequences), so a round-trip re-encode is required to detect genuinely binary content.
  // A raw SQLite database, WAL, or similar binary artifact is legitimate evidence -- treating
  // its bytes as free text and pattern-matching for path-like or secret-like substrings finds
  // nothing meaningful (a human cannot "accidentally paste" into a binary page) and produces
  // false positives on essentially any sufficiently large binary blob purely from '/'-byte
  // coincidences. This scan's documented scope is structural JSON/JSONL and textual evidence.
  return Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes);
}

export function privacyFindings(path, bytes) {
  if (!isTextual(bytes)) return [];
  const text = bytes.toString("utf8");
  const findings = [];
  const structured = parseStructured(path, text);
  if (structured !== null) {
    scanStructured(path, structured, findings);
  } else {
    scanString(path, text, findings);
  }
  return findings;
}

export function assertPrivateDataAbsent(snapshot, paths = [...snapshot.files.keys()]) {
  const findings = paths.flatMap((path) => {
    const item = snapshot.files.get(path);
    return item ? privacyFindings(path, item.bytes) : [];
  });
  if (findings.length > 0) {
    failEvidence("PRIVATE_DATA_DISCLOSED", findings[0].path, `Public evidence contains ${findings[0].code}`);
  }
}

export function equalJson(left, right) {
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (isPlainObject(value)) {
      return `{${Object.keys(value).sort(lexicalCompare).map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`
      ).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return canonical(left) === canonical(right);
}

export function digestPattern(value) {
  return typeof value === "string" && sha256Pattern.test(value);
}
