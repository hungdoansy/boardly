#!/usr/bin/env node
// Copy the web-facing brand assets from @boardly/logo into the web app's public
// folder before `next dev` / `next build`. The target folder is git-ignored and
// regenerated each dev/build (see .gitignore, docs/units/UNIT-16-logo-package.md).
//
// Wired INLINE into apps/web's dev/build scripts (`node ../../scripts/sync-logo.mjs
// && next …`), NOT as a `predev`/`prebuild` hook — Turbo runs the exact task
// script and skips npm lifecycle hooks, so a hook would silently no-op under
// `turbo run build`.
//
// The copied files are outputs of `pnpm --filter @boardly/logo generate`; the
// copy function is exported so it can be unit-tested without the real tree.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** The favicon set consumed by apps/web/app/layout.tsx metadata.icons. */
export const WEB_ASSETS = ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"];

/**
 * Copy `files` from `sourceDir` into `targetDir`, creating the target. Throws an
 * actionable error if a source file is missing (assets not generated yet).
 * Returns the list of copied basenames.
 */
export function copyLogoAssets(sourceDir, targetDir, files = WEB_ASSETS) {
  mkdirSync(targetDir, { recursive: true });
  for (const name of files) {
    const src = join(sourceDir, name);
    if (!existsSync(src)) {
      throw new Error(
        `Missing brand asset: ${src}\n` +
          "Run `pnpm --filter @boardly/logo generate` to (re)build the logo assets.",
      );
    }
    copyFileSync(src, join(targetDir, name));
  }
  return files;
}

function main() {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceDir = join(repoRoot, "packages", "logo", "assets", "generated");
  const targetDir = join(repoRoot, "apps", "web", "public", "logo");
  const copied = copyLogoAssets(sourceDir, targetDir);
  process.stdout.write(`synced ${copied.length} logo asset(s) -> apps/web/public/logo\n`);
}

// Run only when invoked directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
