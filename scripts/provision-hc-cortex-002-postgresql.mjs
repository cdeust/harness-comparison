#!/usr/bin/env node

import {
  PostgresProvisionerError,
  postgresProvisionerErrorResult,
  preparePostgresReference,
  statusPostgresReference,
  stopPostgresReference
} from "./hc-cortex-002-postgresql-lib.mjs";

function parseArguments(arguments_) {
  const command = arguments_[0];
  if (!new Set(["prepare", "status", "stop"]).has(command)) {
    throw new PostgresProvisionerError(
      "INVALID_COMMAND",
      "Usage: provision-hc-cortex-002-postgresql.mjs prepare --protocol file --root new-private-root | status --root root | stop --root root"
    );
  }
  const options = {};
  const allowed = command === "prepare" ? new Set(["--protocol", "--root"]) : new Set(["--root"]);
  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!allowed.has(argument)) {
      throw new PostgresProvisionerError("UNKNOWN_ARGUMENT", "The provisioner received an unsupported argument");
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new PostgresProvisionerError("MISSING_ARGUMENT_VALUE", "A provisioner argument is missing its value");
    }
    const field = argument === "--protocol" ? "protocol" : "root";
    if (options[field] !== undefined) {
      throw new PostgresProvisionerError("DUPLICATE_ARGUMENT", "A provisioner argument was supplied twice");
    }
    options[field] = value;
    index += 1;
  }
  if (!options.root || (command === "prepare" && !options.protocol)) {
    throw new PostgresProvisionerError("MISSING_ARGUMENT", "The provisioner is missing a required argument");
  }
  return { command, options };
}

try {
  const { command, options } = parseArguments(process.argv.slice(2));
  const result = command === "prepare"
    ? preparePostgresReference(options)
    : command === "status"
      ? statusPostgresReference(options)
      : stopPostgresReference(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify(postgresProvisionerErrorResult(error), null, 2)}\n`);
  process.exitCode = 1;
}
