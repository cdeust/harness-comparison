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
  process.stderr.write(`${JSON.stringify(errorResult(error), null, 2)}\n`);
  process.exitCode = 1;
}
