#!/usr/bin/env node
// Stamp a release version into every file that carries the desktop app's version.
// tauri.conf.json is the one the bundle reads; the others are kept level with it so
// the repo never disagrees with itself. The build job runs this before `tauri build`
// and the release job runs it again to commit the result.
//
// Each file is patched in place rather than re-serialized, so formatting survives.
// A pattern that stops matching throws: a silent no-op here would ship a build
// stamped with the old version.
//
// Usage: node scripts/release/set-version.mjs 1.2.3
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const JSON_VERSION = /^(\s*"version":\s*")[^"]+/m;

export const VERSION_FILES = [
  ["apps/desktop/package.json", JSON_VERSION],
  ["apps/desktop/src-tauri/tauri.conf.json", JSON_VERSION],
  ["apps/desktop/src-tauri/Cargo.toml", /^(\[package\][\s\S]*?^version = ")[^"]+/m],
  // \r? because a Windows runner checks out with CRLF.
  ["apps/desktop/src-tauri/Cargo.lock", /^(name = "boardly"\r?\nversion = ")[^"]+/m],
];

/** Write `version` into each of VERSION_FILES under `root`. */
export function setVersion(root, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Version must be in X.Y.Z format (got: ${version})`);
  }
  for (const [path, pattern] of VERSION_FILES) {
    const file = join(root, path);
    const before = readFileSync(file, "utf8");
    if (!pattern.test(before)) throw new Error(`No version found in ${path}`);
    writeFileSync(file, before.replace(pattern, `$1${version}`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  try {
    setVersion(root, process.argv[2] ?? "");
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
