import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readResultEnvelope, validateResultEnvelope } from "./result-envelope.mjs";

const fixturePath = resolve(import.meta.dirname, "fixtures/result-envelope.claude-2.1.258.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("real fixture validates clean", () => {
  const { valid, errors } = validateResultEnvelope(fixture);
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test("fixture without usage is invalid and names usage", () => {
  const broken = structuredClone(fixture);
  delete broken.usage;
  const { valid, errors } = validateResultEnvelope(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.startsWith("usage:")), errors.join("; "));
});

const requiredTopLevelFields = [
  "type", "subtype", "is_error", "session_id", "num_turns",
  "duration_ms", "duration_api_ms", "total_cost_usd", "usage", "modelUsage"
];

for (const field of requiredTopLevelFields) {
  test(`missing top-level field is invalid: ${field}`, () => {
    const broken = structuredClone(fixture);
    delete broken[field];
    const { valid } = validateResultEnvelope(broken);
    assert.equal(valid, false, `expected invalid when ${field} is missing`);
  });
}

const usageTokenFields = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"];
const invalidTokenValues = [-1, 1.5, "3"];

for (const field of usageTokenFields) {
  for (const badValue of invalidTokenValues) {
    test(`usage.${field} = ${JSON.stringify(badValue)} is invalid`, () => {
      const broken = structuredClone(fixture);
      broken.usage[field] = badValue;
      const { valid } = validateResultEnvelope(broken);
      assert.equal(valid, false);
    });
  }
}

test('type: "assistant" is invalid', () => {
  const broken = structuredClone(fixture);
  broken.type = "assistant";
  const { valid } = validateResultEnvelope(broken);
  assert.equal(valid, false);
});

test("empty modelUsage object is invalid", () => {
  const broken = structuredClone(fixture);
  broken.modelUsage = {};
  const { valid, errors } = validateResultEnvelope(broken);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.startsWith("modelUsage:")), errors.join("; "));
});

test("extra unknown top-level field is still valid", () => {
  const extended = structuredClone(fixture);
  extended.some_future_field_not_yet_documented = { anything: true };
  const { valid, errors } = validateResultEnvelope(extended);
  assert.equal(valid, true, errors.join("; "));
});

test("is_error: true is invalid and names is_error", () => {
  const errored = structuredClone(fixture);
  errored.is_error = true;
  const { valid, errors } = validateResultEnvelope(errored);
  assert.equal(valid, false);
  assert.ok(errors.some((error) => error.startsWith("is_error:")), errors.join("; "));
});

const scratch = mkdtempSync(join(tmpdir(), "result-envelope-test-"));

test("readResultEnvelope returns the parsed fixture", () => {
  assert.deepEqual(readResultEnvelope(fixturePath), fixture);
});

test("readResultEnvelope on a missing path throws naming the path", () => {
  const missing = join(scratch, "missing.envelope.json");
  assert.throws(
    () => readResultEnvelope(missing),
    (error) => error.message.startsWith(`unreadable result envelope at ${missing}:`)
  );
});

test("readResultEnvelope on an empty file throws unreadable with the path", () => {
  const empty = join(scratch, "empty.envelope.json");
  writeFileSync(empty, "");
  assert.throws(
    () => readResultEnvelope(empty),
    (error) => error.message.startsWith(`unreadable result envelope at ${empty}:`)
  );
});

test("readResultEnvelope on a parsable but invalid envelope joins every error", () => {
  const invalid = join(scratch, "invalid.envelope.json");
  const broken = structuredClone(fixture);
  broken.is_error = true;
  broken.modelUsage = {};
  writeFileSync(invalid, JSON.stringify(broken));
  assert.throws(
    () => readResultEnvelope(invalid),
    (error) =>
      error.message.startsWith(`invalid result envelope at ${invalid}:`) &&
      error.message.includes("is_error:") &&
      error.message.includes("modelUsage:")
  );
});
