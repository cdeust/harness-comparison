// Pure module: the JSON Schema (draft 2020-12) subset validator shared by
// every schema-backed validator in this repository. Extracted from
// scripts/benchmark-release-lib.mjs (coding-standards.md §3.3: three
// concrete uses justify the extraction — scripts/benchmark-release-lib.mjs's
// protocol schema and manifest schema, and claude-harness/frugality-ledger.mjs's
// ledger schema, chantier A etape 4). No I/O in this module.
//
// Supported constructs only: type, const, enum, required,
// additionalProperties:false, properties, items, minItems, minLength,
// pattern, minimum, format:"date-time", $ref (to #/$defs/... only), oneOf.
// A schema using any other keyword is silently under-validated on that
// keyword — this is a subset validator, not a general JSON Schema engine.

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

// source: https://json-schema.org/draft/2020-12/json-schema-core (RFC 3339
// "date-time" production) — this repository only ever needs the UTC "Z"
// form, never an offset, so the pattern is intentionally narrower than the
// full RFC grammar (same narrowing already applied by
// schemas/execution-manifest-v1.schema.json's utcTimestamp $def).
export function utcTimestamp(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  if (new Date(milliseconds).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return milliseconds;
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

// Contract:
// pre: rootSchema is a JSON Schema object using only the constructs listed
//      in this module's header comment; value is arbitrary JSON.
// post: returns a fresh array of {code, path, message} error objects (empty
//       when value satisfies rootSchema). Never throws, never mutates value
//       or rootSchema.
export function validateAgainstSchema(value, rootSchema, path = "$") {
  const errors = [];
  schemaValidate(value, rootSchema, rootSchema, path, errors);
  return errors;
}
