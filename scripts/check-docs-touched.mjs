#!/usr/bin/env node
// Docs-discipline guard (WARN ONLY — never blocks a commit).
//
// Reminds you when a commit stages product-source changes without touching any
// doc surface (a unit doc, DESIGN.md, or a plan). Enforces CLAUDE.md §1 as a
// nudge, not a gate: it always exits 0. Wired as the repo's pre-commit hook via
// husky (.husky/pre-commit). The classifier is exported so it can be unit-tested
// without a real git repo.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * Product source whose change should be accompanied by a doc update.
 * Lives under a code workspace (apps/ or packages/), excluding the e2e app,
 * test/spec files, and markdown (docs are the doc surface, not the source).
 */
export function isSourceFile(path) {
  if (!(path.startsWith("apps/") || path.startsWith("packages/"))) return false;
  if (path.startsWith("apps/e2e/")) return false;
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(path)) return false;
  if (path.endsWith(".md")) return false;
  return true;
}

/** A doc surface: anything under docs/ (units, design, plans, guides) or the root PLAN.md. */
export function isDocFile(path) {
  return path.startsWith("docs/") || path === "PLAN.md";
}

/** Pure classification of a staged file list — the unit-tested core. */
export function classify(files) {
  const sourceFiles = files.filter(isSourceFile);
  const docTouched = files.some(isDocFile);
  return { sourceFiles, docTouched, shouldWarn: sourceFiles.length > 0 && !docTouched };
}

function stagedFiles() {
  // Argument array (no shell) — nothing is interpolated, so there is no injection surface.
  const out = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function main() {
  let files;
  try {
    files = stagedFiles();
  } catch {
    // Not a git repo / git unavailable — never block.
    process.exit(0);
  }
  const { sourceFiles, shouldWarn } = classify(files);
  if (shouldWarn) {
    const y = (s) => `\x1b[33m${s}\x1b[0m`;
    process.stderr.write(
      y("\n⚠  Docs reminder (non-blocking)\n") +
        "You staged source changes with no docs update:\n" +
        sourceFiles.map((f) => `   • ${f}`).join("\n") +
        "\n\nConsider updating a doc surface in this commit:\n" +
        "   • docs/units/UNIT-<id>-*.md   (feature / spec / behavior)\n" +
        "   • docs/design/DESIGN.md       (visual / interaction / icon / token change)\n" +
        "   • docs/plans/* or PLAN.md     (scope change)\n" +
        "See CLAUDE.md §1. This is a reminder only — your commit will proceed.\n\n",
    );
  }
  process.exit(0);
}

// Run only when invoked directly (node scripts/check-docs-touched.mjs), not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
