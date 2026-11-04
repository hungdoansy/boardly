import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { formatEntries } from "./generate-changelog.mjs";
import { prependBlock } from "./prepend-changelog.mjs";
import { resolveMatrix, TARGETS } from "./resolve-targets.mjs";
import { setVersion, VERSION_FILES } from "./set-version.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("resolveMatrix", () => {
  it("builds only the ticked targets", () => {
    const { include } = resolveMatrix({ version: "1.0.0", mac_arm64: true, linux_x64: false });
    expect(include.map((t) => t.name)).toEqual(["mac-arm64"]);
  });

  it("accepts the string form of a checkbox", () => {
    const { include } = resolveMatrix({ windows_x64: "true", mac_x64: "false" });
    expect(include.map((t) => t.name)).toEqual(["windows-x64"]);
  });

  it("covers all four platforms when everything is ticked", () => {
    const all = Object.fromEntries(TARGETS.map((t) => [t.input, true]));
    expect(resolveMatrix(all).include).toHaveLength(4);
  });

  it("refuses a run with nothing ticked", () => {
    expect(() => resolveMatrix({ version: "1.0.0" })).toThrow(/at least one target/);
  });
});

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

describe("formatEntries", () => {
  it("keeps user-facing commits and strips their bookkeeping", () => {
    const subjects = [
      "fix(links): unfurl the brand-only providers (UNIT-3.7)",
      "feat: open card links in the browser (UNIT-9.4) (#9)",
      "fix(e2e-free): repair drift (#8)",
      "a commit with no type",
    ];
    expect(formatEntries(subjects)).toBe(
      "- unfurl the brand-only providers\n- open card links in the browser\n- repair drift\n- a commit with no type",
    );
  });

  it("drops internal commits, scoped or not", () => {
    const subjects = [
      "release: v1.0.0",
      "docs(solutions): archived project",
      "chore(prod): bind the port",
      "test(e2e): stabilise",
      "",
    ];
    expect(formatEntries(subjects)).toBe("- No notable changes");
  });
});

describe("prependBlock", () => {
  const release = { tag: "v1.1.0", date: "2026-11-04", entries: "- new" };

  it("starts a changelog when none exists", () => {
    expect(prependBlock(null, release)).toBe("# Changelog\n\n## v1.1.0 (2026-11-04)\n\n- new\n");
  });

  it("puts the new block above older ones", () => {
    const old = "# Changelog\n\n## v1.0.0 (2026-11-01)\n\n- old\n";
    expect(prependBlock(old, release)).toBe(
      "# Changelog\n\n## v1.1.0 (2026-11-04)\n\n- new\n\n## v1.0.0 (2026-11-01)\n\n- old\n",
    );
  });
});
