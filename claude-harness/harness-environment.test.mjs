import test from "node:test";
import assert from "node:assert/strict";
import { composeIsolatedEnvironment } from "./harness-environment.mjs";

test("manifest value overrides the shell's", () => {
  const result = composeIsolatedEnvironment({
    shellEnvironment: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "0", PATH: "/usr/bin" },
    manifestEnvironment: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    claudeHome: "/tmp/claude-home"
  });
  assert.equal(result.CLAUDE_CODE_DISABLE_AUTO_MEMORY, "1");
});

test("CLAUDE_CONFIG_DIR is set to claudeHome", () => {
  const result = composeIsolatedEnvironment({
    shellEnvironment: {},
    manifestEnvironment: {},
    claudeHome: "/tmp/claude-home"
  });
  assert.equal(result.CLAUDE_CONFIG_DIR, "/tmp/claude-home");
});

test("shell variables not named by the manifest are preserved", () => {
  const result = composeIsolatedEnvironment({
    shellEnvironment: { PATH: "/usr/bin", HOME: "/Users/someone" },
    manifestEnvironment: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    claudeHome: "/tmp/claude-home"
  });
  assert.equal(result.PATH, "/usr/bin");
  assert.equal(result.HOME, "/Users/someone");
});

test("non-string manifest value throws naming the key", () => {
  assert.throws(
    () => composeIsolatedEnvironment({
      shellEnvironment: {},
      manifestEnvironment: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: 1 },
      claudeHome: "/tmp/claude-home"
    }),
    (error) => error.message.includes("environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY") && error.message.includes("string")
  );
});

test("undefined manifest environment is fine", () => {
  const result = composeIsolatedEnvironment({
    shellEnvironment: { PATH: "/usr/bin" },
    manifestEnvironment: undefined,
    claudeHome: "/tmp/claude-home"
  });
  assert.equal(result.PATH, "/usr/bin");
  assert.equal(result.CLAUDE_CONFIG_DIR, "/tmp/claude-home");
});

test("empty manifest environment object is fine", () => {
  const result = composeIsolatedEnvironment({
    shellEnvironment: { PATH: "/usr/bin" },
    manifestEnvironment: {},
    claudeHome: "/tmp/claude-home"
  });
  assert.equal(result.PATH, "/usr/bin");
  assert.equal(result.CLAUDE_CONFIG_DIR, "/tmp/claude-home");
});
