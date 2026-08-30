#!/usr/bin/env node
import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

function usage() {
  console.error("usage: run-b-ingestion-unbounded.mjs --repo <path> --output-dir <path> --report <path>");
  process.exit(64);
}

function utcNow() {
  return new Date().toISOString();
}

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};
const repo = option("--repo");
const outputDir = option("--output-dir");
const report = option("--report");
if (!repo || !outputDir || !report) usage();

const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, "harness-b.mcp.json"), "utf8"));
const server = manifest.mcpServers["ai-architect"];
if (!server?.command || !Array.isArray(server.args)) {
  throw new Error("harness-b ai-architect stdio server is not configured");
}

const stderrPath = `${report}.server-stderr.log`;
const stderr = createWriteStream(stderrPath, { flags: "w" });
const child = spawn(server.command, server.args, {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env
});
child.stderr.pipe(stderr);

let nextId = 1;
const pending = new Map();
const failPending = (error) => {
  for (const reject of pending.values()) reject(error);
  pending.clear();
};
createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.id === undefined || !pending.has(message.id)) return;
  const { resolve: fulfill, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else fulfill(message.result);
});
child.once("error", failPending);
child.once("exit", (code, signal) => {
  if (pending.size) failPending(new Error(`ai-architect MCP exited before responding (code=${code}, signal=${signal})`));
});

function request(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

const operation = {
  tool: "ai-architect/analyze_codebase",
  inputs_summary: {
    path: resolve(repo),
    output_dir: resolve(outputDir),
    language: "auto",
    dependency_scope: "none"
  },
  utc_start: utcNow(),
  raw_result: null,
  error: null
};

try {
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "codex-harness-unbounded-driver", version: "1" }
  });
  notify("notifications/initialized", {});
  operation.raw_result = await request("tools/call", {
    name: "analyze_codebase",
    arguments: operation.inputs_summary
  });
} catch (error) {
  operation.error = { name: error.name, message: error.message };
} finally {
  operation.utc_end = utcNow();
  child.stdin.end();
  stderr.end();
}

const raw = operation.raw_result;
const textResult = raw?.content?.find?.((item) => item.type === "text")?.text;
let parsed = null;
if (typeof textResult === "string") {
  try {
    parsed = JSON.parse(textResult);
  } catch {
    // The original response remains authoritative when it is not JSON.
  }
}
const reportData = {
  harness: "B",
  target_repo: resolve(repo),
  session_date_utc: operation.utc_start.slice(0, 10),
  execution_mode: "direct-stdio-mcp-unbounded",
  timeout_policy: "No fixed wall-clock timeout; cancellation is operator-controlled.",
  operations: [operation],
  counts: parsed,
  errors: operation.error ? [operation.error] : [],
  summary: operation.error ? "AI Architect ingestion did not return a result." : "AI Architect ingestion completed through the direct stdio MCP driver."
};
writeFileSync(resolve(report), `${JSON.stringify(reportData, null, 2)}\n`);
process.exitCode = operation.error ? 1 : 0;
