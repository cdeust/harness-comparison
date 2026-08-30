#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const interfaceName = "hc-cortex-002/v1";
const requiredFlags = [
  "attempt-id",
  "backend",
  "cell-id",
  "concurrency",
  "database",
  "mode",
  "operations-per-type",
  "output-dir",
  "postgresql-service-instance-id",
  "postgresql-service-started-at",
  "process-instance-id",
  "protocol-id",
  "protocol-sha256",
  "release-id",
  "run-id"
].sort();

function parse(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("fixture adapter requires flag/value pairs");
    }
    const name = flag.slice(2);
    if (Object.hasOwn(values, name)) throw new Error(`duplicate flag: ${flag}`);
    values[name] = value;
  }
  if (JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(requiredFlags)) {
    throw new Error("fixture adapter received an unknown or missing flag");
  }
  if (!/^[0-9a-f]{64}$/.test(values["protocol-sha256"])) throw new Error("invalid protocol hash");
  if (!Number.isSafeInteger(Number(values.concurrency)) || Number(values.concurrency) < 1) {
    throw new Error("invalid concurrency");
  }
  if (!Number.isSafeInteger(Number(values["operations-per-type"])) || Number(values["operations-per-type"]) < 1) {
    throw new Error("invalid operation count");
  }
  if (values.mode !== "workload" && values.mode !== "oracle") throw new Error("invalid mode");
  return values;
}

function writeJsonLine(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function writeJournal(path, values, events) {
  let previous = "0".repeat(64);
  const identities = {
    release_id: values["release-id"],
    protocol_id: values["protocol-id"],
    protocol_sha256: values["protocol-sha256"],
    cell_id: values["cell-id"],
    attempt_id: values["attempt-id"],
    process_instance_id: values["process-instance-id"]
  };
  const lines = events.map((event, index) => {
    const payload = {
      schema: "hc-cortex-002-ledger/v1",
      sequence: index + 1,
      recorded_at: "2026-08-30T10:00:00Z",
      monotonic_ns: index + 1,
      prev_sha256: previous,
      ...identities,
      ...event
    };
    const digest = createHash("sha256").update(canonical(payload)).digest("hex");
    previous = digest;
    return canonical({ ...payload, line_sha256: digest });
  });
  writeFileSync(path, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

try {
  const values = parse(process.argv.slice(2));
  const outputDirectory = resolve(values["output-dir"]);
  const ledgerPath = resolve(outputDirectory, `${values["run-id"]}.${values.mode}.jsonl`);
  const workloadPath = resolve(outputDirectory, `${values["run-id"]}.workload.jsonl`);
  if (!existsSync(outputDirectory)) throw new Error("output directory is absent");

  if (values.mode === "workload") {
    if (values.backend === "sqlite") {
      if (!existsSync(dirname(resolve(values.database)))) throw new Error("database directory is absent");
      writeFileSync(resolve(values.database), "fixture sqlite database\n", { flag: "wx", mode: 0o600 });
    }
    writeJsonLine(ledgerPath, {
      interface: interfaceName,
      mode: values.mode,
      pid: process.pid,
      nonce: randomUUID(),
      attempt_id: values["attempt-id"],
      process_instance_id: values["process-instance-id"],
      cell_id: values["cell-id"],
      protocol_sha256: values["protocol-sha256"]
    });
    process.stdout.write(`${JSON.stringify({
      interface: interfaceName,
      mode: "workload",
      status: "complete",
      ledger_path: `${values["run-id"]}.workload.jsonl`,
      verdict: "pending"
    })}\n`);
  } else {
    if (!existsSync(workloadPath)) throw new Error("oracle started before workload evidence existed");
    const workload = JSON.parse(readFileSync(workloadPath, "utf8").trim());
    const blocked = values["cell-id"].includes("fail");
    const verdict = blocked ? "blocked" : "proven";
    writeJournal(ledgerPath, values, [
      {
        event: "oracle_result",
        mode: values.mode,
        pid: process.pid,
        nonce: randomUUID(),
        workload_pid: workload.pid,
        checks: blocked
          ? { marker_exactly_once_and_rejected_zero: { passed: false } }
          : { marker_exactly_once_and_rejected_zero: { passed: true } },
        verdict
      },
      { event: "terminal", state: "complete", verdict, store_closed: true }
    ]);
    process.stdout.write(`${JSON.stringify({
      interface: interfaceName,
      mode: "oracle",
      status: "complete",
      ledger_path: `${values["run-id"]}.oracle.jsonl`,
      verdict: blocked ? "blocked" : "proven"
    })}\n`);
    if (blocked) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 2;
}
