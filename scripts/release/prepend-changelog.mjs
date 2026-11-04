#!/usr/bin/env node
// Prepend a release block to apps/desktop/CHANGELOG.md, right under the `# ` title.
//
// Env:
//   TAG      e.g. v2.3.0
//   DATE     YYYY-MM-DD, from the prepare job
//   ENTRIES  changelog lines from generate-changelog.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Return `changelog` (or a fresh one, when null) with the new block on top. */
export function prependBlock(changelog, { tag, date, entries }) {
  const block = `## ${tag} (${date})\n\n${entries}`;
  const lines = (changelog ?? "# Changelog\n").split("\n");
  const titleIdx = lines.findIndex((l) => l.startsWith("# "));
  if (titleIdx >= 0) {
    lines.splice(titleIdx + 1, 0, "", block);
  } else {
    lines.unshift(block, "");
  }
  return lines.join("\n");
}

function main() {
  const { TAG, DATE, ENTRIES } = process.env;
  if (!TAG || !DATE || !ENTRIES) {
    console.error("TAG, DATE and ENTRIES are required");
    process.exit(1);
  }
  const file = join(dirname(fileURLToPath(import.meta.url)), "../../apps/desktop/CHANGELOG.md");
  const changelog = existsSync(file) ? readFileSync(file, "utf8") : null;
  writeFileSync(file, prependBlock(changelog, { tag: TAG, date: DATE, entries: ENTRIES }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
