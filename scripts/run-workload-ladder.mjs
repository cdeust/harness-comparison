#!/usr/bin/env node

import {
  LadderRunnerError,
  buildWorkloadPlan,
  errorResult,
  executeWorkloadPlan,
  publicPlan
} from "./workload-ladder-runner-lib.mjs";

function parseArguments(arguments_) {
  const options = { sources: [], runtimes: [], databases: [], plan: false };
  const repeated = new Map([
    ["--source", "sources"],
    ["--runtime", "runtimes"],
    ["--database", "databases"]
  ]);
  const single = new Map([
    ["--protocol", "protocol"],
    ["--release-root", "releaseRoot"],
    ["--postgresql-service-receipt", "postgresqlServiceReceipt"],
    ["--cell", "cell"]
  ]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--plan") {
      if (options.plan) throw new LadderRunnerError("DUPLICATE_ARGUMENT", "--plan was supplied twice");
      options.plan = true;
      continue;
    }
    const field = repeated.get(argument) ?? single.get(argument);
    if (!field) throw new LadderRunnerError("UNKNOWN_ARGUMENT", `Unknown argument: ${argument}`);
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new LadderRunnerError("MISSING_ARGUMENT_VALUE", `${argument} requires a value`);
    }
    index += 1;
    if (repeated.has(argument)) options[field].push(value);
    else if (options[field] !== undefined) {
      throw new LadderRunnerError("DUPLICATE_ARGUMENT", `${argument} was supplied twice`);
    } else options[field] = value;
  }
  if (!options.protocol || !options.releaseRoot || options.sources.length === 0 || options.runtimes.length === 0) {
    throw new LadderRunnerError(
      "MISSING_ARGUMENT",
      "Usage: run-workload-ladder.mjs --protocol file --release-root new-dir " +
      "--source id=checkout --runtime id=executable [--database cell=value] " +
      "[--postgresql-service-receipt file] [--cell id] [--plan]"
    );
  }
  return options;
}

// A synchronous try/catch around the awaited call below only covers exceptions and rejections
// that actually propagate through that await chain. It does not cover a genuinely unhandled
// rejection (e.g. a spawned child process's detached event-listener callback throwing outside
// any awaited promise) or an uncaught synchronous exception outside the try block entirely --
// both terminate the process by default with a non-JSON Node stack trace on stderr, or on some
// hosts no output at all, which is exactly the kind of swallowed-cause diagnosis-blocker this
// CLI's error contract exists to prevent. These handlers are the last-resort net: still emit
// the same machine-readable envelope, still exit non-zero, never let the process die silently.
let reported = false;
function reportFatal(error) {
  if (reported) return;
  reported = true;
  process.stderr.write(`${JSON.stringify(errorResult(error), null, 2)}\n`);
  process.exitCode = 1;
}
process.on("uncaughtException", reportFatal);
process.on("unhandledRejection", reportFatal);

try {
  const options = parseArguments(process.argv.slice(2));
  const plan = buildWorkloadPlan(options);
  if (options.plan) {
    process.stdout.write(`${JSON.stringify(publicPlan(plan), null, 2)}\n`);
  } else {
    const summary = await executeWorkloadPlan(plan);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = summary.status === "completed" ? 0 : summary.status === "indeterminate" ? 2 : 1;
  }
} catch (error) {
  reportFatal(error);
}
