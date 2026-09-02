import test from "node:test";
import assert from "node:assert/strict";
import { utcTimestamp, validateAgainstSchema } from "./json-schema-subset-lib.mjs";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind"],
  properties: {
    id: { $ref: "#/$defs/nonEmptyString" },
    kind: { enum: ["a", "b"] },
    count: { type: "integer", minimum: 0 },
    generatedAt: { $ref: "#/$defs/utcTimestamp" },
    tags: { type: "array", minItems: 1, items: { $ref: "#/$defs/nonEmptyString" } },
    optional: { oneOf: [{ $ref: "#/$defs/nonEmptyString" }, { type: "null" }] }
  },
  $defs: {
    nonEmptyString: { type: "string", minLength: 1 },
    utcTimestamp: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?Z$",
      format: "date-time"
    }
  }
};

test("a fully valid document produces no errors", () => {
  const value = { id: "x", kind: "a", count: 3, generatedAt: "2026-09-03T00:00:00Z", tags: ["t"], optional: null };
  assert.deepEqual(validateAgainstSchema(value, schema), []);
});

test("a missing required field is reported", () => {
  const errors = validateAgainstSchema({ kind: "a" }, schema);
  assert.ok(errors.some((error) => error.code === "MISSING_REQUIRED_FIELD" && error.path === "$.id"));
});

test("an unknown field is reported (additionalProperties: false)", () => {
  const errors = validateAgainstSchema({ id: "x", kind: "a", extra: true }, schema);
  assert.ok(errors.some((error) => error.code === "UNKNOWN_FIELD" && error.path === "$.extra"));
});

test("an enum violation is reported", () => {
  const errors = validateAgainstSchema({ id: "x", kind: "z" }, schema);
  assert.ok(errors.some((error) => error.code === "INVALID_FIELD_VALUE" && error.path === "$.kind"));
});

test("a $ref to a $defs entry is resolved", () => {
  const errors = validateAgainstSchema({ id: "", kind: "a" }, schema);
  assert.ok(errors.some((error) => error.code === "INVALID_FIELD_VALUE" && error.path === "$.id"));
});

test("an unresolvable $ref reports SCHEMA_CONTRACT_ERROR", () => {
  const brokenSchema = { properties: { id: { $ref: "#/$defs/missing" } }, $defs: {} };
  const errors = validateAgainstSchema({ id: "x" }, brokenSchema);
  assert.ok(errors.some((error) => error.code === "SCHEMA_CONTRACT_ERROR"));
});

test("oneOf accepts exactly one matching branch", () => {
  const errors = validateAgainstSchema({ id: "x", kind: "a", optional: "present" }, schema);
  assert.deepEqual(errors, []);
});

test("oneOf rejects a value matching zero branches", () => {
  const errors = validateAgainstSchema({ id: "x", kind: "a", optional: 5 }, schema);
  assert.ok(errors.some((error) => error.path === "$.optional"));
});

test("minItems on an array is enforced", () => {
  const errors = validateAgainstSchema({ id: "x", kind: "a", tags: [] }, schema);
  assert.ok(errors.some((error) => error.path === "$.tags"));
});

test("utcTimestamp rejects a non-UTC or malformed timestamp", () => {
  assert.equal(utcTimestamp("not-a-date"), null);
  assert.equal(utcTimestamp("2026-09-03T00:00:00+02:00"), null);
  assert.notEqual(utcTimestamp("2026-09-03T00:00:00Z"), null);
});
