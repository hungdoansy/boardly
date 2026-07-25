import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { copyLogoAssets, WEB_ASSETS } from "./sync-logo.mjs";

let root;
let src;
let dst;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sync-logo-"));
  src = join(root, "src");
  dst = join(root, "public", "logo");
  mkdirSync(src, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedSource(contents = "x") {
  for (const name of WEB_ASSETS) writeFileSync(join(src, name), `${name}:${contents}`);
}

describe("copyLogoAssets", () => {
  it("copies every web asset into a freshly created target dir", () => {
    seedSource();
    const copied = copyLogoAssets(src, dst);
    expect(copied).toEqual(WEB_ASSETS);
    for (const name of WEB_ASSETS) {
      expect(existsSync(join(dst, name))).toBe(true);
      expect(readFileSync(join(dst, name), "utf8")).toBe(`${name}:x`);
    }
  });

  it("overwrites stale files on a repeat run (idempotent)", () => {
    seedSource("v1");
    copyLogoAssets(src, dst);
    seedSource("v2");
    copyLogoAssets(src, dst);
    expect(readFileSync(join(dst, "favicon.svg"), "utf8")).toBe("favicon.svg:v2");
  });

  it("throws an actionable error when a source asset is missing", () => {
    // Only seed the first asset, leave the rest missing.
    writeFileSync(join(src, WEB_ASSETS[0]), "only-one");
    expect(() => copyLogoAssets(src, dst)).toThrow(/generate/);
  });
});
