// Pure environment-composition module, extracted from run-isolated.mjs so
// its precedence rule (manifest overrides shell, CLAUDE_CONFIG_DIR pinned
// last) can be unit-tested without spawning a process.
//
// precondition: shellEnvironment is a string-keyed object (typically
//   process.env); manifestEnvironment is undefined, null, or a string-keyed
//   object whose every value is a string (a manifest carrying a non-string
//   value is a config error, not a runtime one); claudeHome is a string.
// postcondition: returns a new object equal to shellEnvironment, then
//   overwritten key-by-key by manifestEnvironment, then with
//   CLAUDE_CONFIG_DIR forced to claudeHome — neither input object is
//   mutated.
export function composeIsolatedEnvironment({ shellEnvironment, manifestEnvironment, claudeHome }) {
  for (const [key, value] of Object.entries(manifestEnvironment ?? {})) {
    if (typeof value !== "string") {
      throw new Error(`harness manifest environment.${key} must be a string, got ${typeof value}`);
    }
  }
  return {
    ...shellEnvironment,
    ...manifestEnvironment,
    CLAUDE_CONFIG_DIR: claudeHome
  };
}
