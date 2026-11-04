import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setVersion, VERSION_FILES } from "./set-version.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("setVersion", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "set-version-"));
    for (const [path] of VERSION_FILES) {
      cpSync(join(REPO_ROOT, path), join(root, path), { recursive: true });
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const read = (path) => readFileSync(join(root, path), "utf8");

  it("stamps every real version file, touching nothing else", () => {
    const before = VERSION_FILES.map(([path]) => read(path));
    setVersion(root, "9.8.7");

    expect(JSON.parse(read("apps/desktop/package.json")).version).toBe("9.8.7");
    expect(JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json")).version).toBe("9.8.7");
    expect(read("apps/desktop/src-tauri/Cargo.toml")).toMatch(
      /\[package\]\n.*\nversion = "9\.8\.7"/,
    );
    expect(read("apps/desktop/src-tauri/Cargo.lock")).toMatch(
      /name = "boardly"\nversion = "9\.8\.7"/,
    );

    VERSION_FILES.forEach(([path], i) => {
      const changed = read(path).split("\n");
      const diff = before[i].split("\n").filter((line, n) => line !== changed[n]);
      expect(diff).toHaveLength(1);
    });
  });

  it("handles a CRLF checkout", () => {
    const lock = "apps/desktop/src-tauri/Cargo.lock";
    writeFileSync(join(root, lock), read(lock).replace(/\n/g, "\r\n"));
    setVersion(root, "9.8.7");
    expect(read(lock)).toContain('name = "boardly"\r\nversion = "9.8.7"');
  });

  it("rejects a version that is not X.Y.Z", () => {
    expect(() => setVersion(root, "v1.2")).toThrow(/X\.Y\.Z/);
  });

  it("throws when a file no longer carries a version", () => {
    writeFileSync(join(root, "apps/desktop/package.json"), "{}\n");
    expect(() => setVersion(root, "9.8.7")).toThrow(/apps\/desktop\/package\.json/);
  });
});
