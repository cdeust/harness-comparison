import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const validatorPath = fileURLToPath(new URL("validate-issue-registry.mjs", import.meta.url));

function runValidator() {
  return spawnSync(process.execPath, [validatorPath], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

test("repository scan excludes ignored Markdown but includes untracked source", () => {
  const fixtureId = `${process.pid}`;
  const ignoredRoot = join(
    repositoryRoot,
    "codex-harness",
    "runtime",
    `registry-validator-${fixtureId}`
  );
  const ignoredMarkdown = join(ignoredRoot, "broken-link.md");
  const sourceMarkdown = join(repositoryRoot, `registry-validator-${fixtureId}.md`);
  const brokenDocument = "[missing](registry-validator-missing-target.md)\n";

  try {
    mkdirSync(ignoredRoot, { recursive: true });
    writeFileSync(ignoredMarkdown, brokenDocument, "utf8");

    const ignoredRun = runValidator();
    assert.equal(
      ignoredRun.status,
      0,
      `ignored Markdown changed the verdict:\n${ignoredRun.stderr}`
    );

    writeFileSync(sourceMarkdown, brokenDocument, "utf8");
    const sourceRun = runValidator();
    assert.equal(sourceRun.status, 1, "untracked source Markdown was not validated");
    assert.match(sourceRun.stderr, new RegExp(`registry-validator-${fixtureId}\\.md`));
  } finally {
    rmSync(sourceMarkdown, { force: true });
    rmSync(ignoredRoot, { force: true, recursive: true });
  }
});
