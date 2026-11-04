#!/usr/bin/env node
// Turn the release workflow's target checkboxes into a build matrix. All four
// platforms live here, whether or not a run builds them: a run builds only what
// is ticked, so a fork enables one by ticking it (or flipping its `default` in
// .github/workflows/release.yml), with no matrix to edit.
//
// Env:
//   INPUTS         toJSON(inputs) from the workflow
//   GITHUB_OUTPUT  provided by the runner (key: `matrix`)
import { appendFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** `input` names the workflow_dispatch checkbox; `target` is the Rust triple. */
export const TARGETS = [
  {
    input: "mac_arm64",
    name: "mac-arm64",
    os: "macos-latest",
    target: "aarch64-apple-darwin",
    bundles: "dmg",
  },
  {
    input: "mac_x64",
    name: "mac-x64",
    os: "macos-latest",
    target: "x86_64-apple-darwin",
    bundles: "dmg",
  },
  {
    input: "windows_x64",
    name: "windows-x64",
    os: "windows-latest",
    target: "x86_64-pc-windows-msvc",
    bundles: "nsis",
  },
  {
    input: "linux_x64",
    name: "linux-x64",
    os: "ubuntu-latest",
    target: "x86_64-unknown-linux-gnu",
    bundles: "deb,appimage",
  },
];

/** Build the `{ include: [...] }` matrix. Throws when nothing is ticked. */
export function resolveMatrix(inputs) {
  const include = TARGETS.filter(({ input }) => String(inputs[input]) === "true");
  if (include.length === 0) {
    throw new Error(`Pick at least one target: ${TARGETS.map((t) => t.input).join(", ")}`);
  }
  return { include };
}

function main() {
  const matrix = resolveMatrix(JSON.parse(process.env.INPUTS || "{}"));
  console.log(`Building: ${matrix.include.map((t) => t.name).join(", ")}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
