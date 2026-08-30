#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const issuesRoot = fileURLToPath(new URL("../issues/", import.meta.url));
const candidatesRoot = fileURLToPath(new URL("../candidates/", import.meta.url));
const categories = new Set([
  "benchmark-validity",
  "code-intelligence",
  "critical-reasoning",
  "data-sovereignty",
  "documentation",
  "finops",
  "integration",
  "memory",
  "network-security",
  "observability",
  "orchestration",
  "provenance",
  "reliability",
  "scalability"
]);
const headings = [
  "Observed condition",
  "Falsifiable hypothesis",
  "Why it matters",
  "Non-claims",
  "Reproduction protocol",
  "Acceptance criteria",
  "Regression obligation",
  "Evidence",
  "Dependencies and exclusions",
  "Verdict ledger"
];
const fieldPatterns = {
  Project: /^- Project: `[^`]+`\s*$/m,
  Category: /^- Category: `([^`]+)`\s*$/m,
  Subject: /^- Subject: `([^`]+)`\s*$/m,
  Population: /^- Population: `(INTERNAL|INDEPENDENT|BENCHMARK)`\s*$/m,
  "Evidence verdict": /^- Evidence verdict: `(proven|pending|blocked|unsourced)`\s*$/m,
  Priority: /^- Priority: `(P0|P1|P2|P3)`\s*$/m,
  "Source revision": /^- Source revision: `([0-9a-f]{40})`\s*$/m,
  "Research rule": /^- Research rule: .+$/m,
  "Sovereignty dimensions": /^- Sovereignty dimensions: .+$/m
};
const ignoredNames = new Set(["README.md", "SCHEMA.md", "AUDIT.md", "AUDIT-LEDGER.md"]);
const forbidden = [
  { pattern: /fleet[ -]watch/i, reason: "private tracker name" },
  { pattern: /\/Users\//, reason: "private user path" },
  { pattern: /claude\.ai\/code\/artifact/i, reason: "private artifact URL" }
];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(child);
    return extname(entry.name) === ".md" ? [child] : [];
  });
}

function validateLocalLinks(path, content, displayPath, failures) {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/i.test(rawTarget)) continue;
    const fileTarget = decodeURIComponent(rawTarget.split("#", 1)[0].split("?", 1)[0]);
    if (!fileTarget) continue;
    const absoluteTarget = resolve(dirname(path), fileTarget);
    if (!absoluteTarget.startsWith(repositoryRoot)) {
      failures.push(`${displayPath}: local link escapes the repository: ${rawTarget}`);
    } else if (!existsSync(absoluteTarget)) {
      failures.push(`${displayPath}: broken local link ${rawTarget}`);
    }
  }
}

const failures = [];
const ids = new Map();
let dossierCount = 0;

for (const path of markdownFiles(issuesRoot)) {
  const relativePath = relative(issuesRoot, path);
  const content = readFileSync(path, "utf8");
  for (const check of forbidden) {
    if (check.pattern.test(content)) failures.push(`${relativePath}: contains ${check.reason}`);
  }
  validateLocalLinks(path, content, relativePath, failures);
  if (ignoredNames.has(relativePath.split(sep).at(-1))) continue;

  dossierCount += 1;
  const parts = relativePath.split(sep);
  if (parts.length !== 3) {
    failures.push(`${relativePath}: expected issues/<project>/<category>/<subject>.md`);
    continue;
  }
  const [, pathCategory, fileName] = parts;
  if (!categories.has(pathCategory)) failures.push(`${relativePath}: unknown category ${pathCategory}`);

  const title = content.match(/^# (HC-[A-Z0-9-]+) — (.+)$/m);
  if (!title) {
    failures.push(`${relativePath}: missing stable HC ID title`);
  } else if (ids.has(title[1])) {
    failures.push(`${relativePath}: duplicate ID ${title[1]} also in ${ids.get(title[1])}`);
  } else {
    ids.set(title[1], relativePath);
  }

  const captures = {};
  for (const [field, pattern] of Object.entries(fieldPatterns)) {
    const match = content.match(pattern);
    if (!match) failures.push(`${relativePath}: missing or invalid ${field}`);
    captures[field] = match?.[1];
  }
  if (captures.Category && captures.Category !== pathCategory) {
    failures.push(`${relativePath}: Category does not match path`);
  }
  if (captures.Subject && `${captures.Subject}.md` !== fileName) {
    failures.push(`${relativePath}: Subject does not match filename`);
  }
  const researchRule = content.match(/^- Research rule: (.+)$/m)?.[1] ?? "";
  if (!researchRule.includes(".md")) failures.push(`${relativePath}: Research rule has no repository Markdown path`);
  if ((researchRule.match(/`/g)?.length ?? 0) % 2 !== 0) {
    failures.push(`${relativePath}: Research rule contains an unmatched backtick`);
  }
  const dimensions = content.match(/^- Sovereignty dimensions: (.+)$/m)?.[1]?.match(/\d+/g) ?? [];
  if (dimensions.length === 0 || dimensions.some((value) => Number(value) < 1 || Number(value) > 10)) {
    failures.push(`${relativePath}: Sovereignty dimensions must be numbered 1 through 10`);
  }
  for (const heading of headings) {
    if (!content.includes(`## ${heading}\n`)) failures.push(`${relativePath}: missing heading ${heading}`);
  }
  const ledger = content.split("## Verdict ledger\n")[1] ?? "";
  if (!/`(proven|pending|blocked|unsourced)`/.test(ledger)) {
    failures.push(`${relativePath}: verdict ledger has no permitted verdict`);
  }
  const ledgerLines = ledger.split("\n").filter((line) => line.startsWith("- "));
  if (ledgerLines.length < 4 || ledgerLines.some((line) => !/`(proven|pending|blocked|unsourced)`\s*$/.test(line))) {
    failures.push(`${relativePath}: verdict ledger needs at least four fully qualified entries`);
  }
}

const auditLedgerPath = join(issuesRoot, "AUDIT-LEDGER.md");
const auditLedger = readFileSync(auditLedgerPath, "utf8");
const auditRows = auditLedger
  .split("\n")
  .map((line) => {
    const match = line.match(
      /^\| (L-\d{3}) \| .* \| `(current|resolved|superseded|insufficient|outside)` \| (.*) \|$/
    );
    return match ? { id: match[1], disposition: match[2], outcome: match[3] } : null;
  })
  .filter(Boolean);
const expectedAuditIds = Array.from({ length: 119 }, (_, index) => index + 1)
  .filter((number) => number !== 11)
  .map((number) => `L-${String(number).padStart(3, "0")}`);
const expectedDispositionCounts = {
  current: 59,
  resolved: 12,
  superseded: 14,
  insufficient: 3,
  outside: 30
};
const auditIds = new Set(auditRows.map(({ id }) => id));
const dispositionCounts = Object.fromEntries(
  Object.keys(expectedDispositionCounts).map((disposition) => [
    disposition,
    auditRows.filter((row) => row.disposition === disposition).length
  ])
);

if (auditRows.length !== expectedAuditIds.length) {
  failures.push(
    `issues/AUDIT-LEDGER.md: expected ${expectedAuditIds.length} audit rows, found ${auditRows.length}`
  );
}
if (auditIds.size !== auditRows.length) {
  failures.push("issues/AUDIT-LEDGER.md: duplicate legacy audit IDs");
}
for (const id of expectedAuditIds) {
  if (!auditIds.has(id)) failures.push(`issues/AUDIT-LEDGER.md: missing ${id}`);
}
for (const id of auditIds) {
  if (!expectedAuditIds.includes(id)) failures.push(`issues/AUDIT-LEDGER.md: unexpected ${id}`);
}
for (const [disposition, expectedCount] of Object.entries(expectedDispositionCounts)) {
  if (dispositionCounts[disposition] !== expectedCount) {
    failures.push(
      `issues/AUDIT-LEDGER.md: expected ${expectedCount} ${disposition} rows, found ${dispositionCounts[disposition]}`
    );
  }
}
for (const row of auditRows.filter(({ disposition }) => disposition === "current")) {
  if (!row.outcome.includes("HC-")) {
    failures.push(`issues/AUDIT-LEDGER.md: current ${row.id} has no active HC dossier`);
  }
}

const candidateHeadings = [
  "Question and scope",
  "Source ledger",
  "Evidence matrix",
  "Claim map",
  "Strongest counter-evidence",
  "Uncertainty and blind spots",
  "Decision implication"
];
let candidateCount = 0;

for (const path of markdownFiles(candidatesRoot)) {
  const relativePath = relative(repositoryRoot, path);
  const content = readFileSync(path, "utf8");
  for (const check of forbidden) {
    if (check.pattern.test(content)) failures.push(`${relativePath}: contains ${check.reason}`);
  }
  validateLocalLinks(path, content, relativePath, failures);
  if (path.endsWith(`${sep}README.md`)) continue;
  candidateCount += 1;
  if (!/^- Status: `(RECONNAISSANCE|OBSERVED|COMPARED)`\s*$/m.test(content)) {
    failures.push(`${relativePath}: missing or invalid candidate status`);
  }
  if (!/^- Canonical repository: \[[^\]]+\]\(https:\/\/github\.com\/[^)]+\)\s*$/m.test(content)) {
    failures.push(`${relativePath}: missing canonical GitHub repository`);
  }
  if (!/^- Inspected source: .*`[0-9a-f]{40}`/m.test(content)) {
    failures.push(`${relativePath}: missing full inspected source SHA`);
  }
  if (!/^- License: /m.test(content) || !/^- Inspected: `\d{4}-\d{2}-\d{2}`\s*$/m.test(content)) {
    failures.push(`${relativePath}: missing license or inspection date`);
  }
  for (const heading of candidateHeadings) {
    if (!content.includes(`## ${heading}\n`)) failures.push(`${relativePath}: missing heading ${heading}`);
  }
}

for (const projectEntry of readdirSync(issuesRoot, { withFileTypes: true })) {
  if (!projectEntry.isDirectory()) continue;
  const projectRoot = join(issuesRoot, projectEntry.name);
  const projectDossiers = markdownFiles(projectRoot).filter((path) => !path.endsWith(`${sep}README.md`));
  if (projectDossiers.length === 0) continue;
  const indexPath = join(projectRoot, "README.md");
  if (!existsSync(indexPath)) {
    failures.push(`issues/${projectEntry.name}: missing project README index`);
    continue;
  }
  const index = readFileSync(indexPath, "utf8");
  for (const dossier of projectDossiers) {
    const target = relative(projectRoot, dossier).split(sep).join("/");
    if (!index.includes(`(${target})`)) failures.push(`issues/${projectEntry.name}/README.md: missing ${target}`);
  }
}

for (const path of markdownFiles(repositoryRoot)) {
  if (path.startsWith(issuesRoot) || path.startsWith(candidatesRoot)) continue;
  validateLocalLinks(path, readFileSync(path, "utf8"), relative(repositoryRoot, path), failures);
}

if (failures.length > 0) {
  console.error(`issue registry: BLOCKED (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`issue registry: PROVEN (${dossierCount} dossiers, ${ids.size} unique IDs, ${candidateCount} candidate cards)`);
