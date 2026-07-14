import { describe, expect, it } from "vitest";

import { classify, isDocFile, isSourceFile } from "./check-docs-touched.mjs";

describe("check-docs-touched classifier", () => {
  it("warns when only source is staged (no docs)", () => {
    const { shouldWarn, sourceFiles } = classify(["apps/web/components/card/links.tsx"]);
    expect(shouldWarn).toBe(true);
    expect(sourceFiles).toEqual(["apps/web/components/card/links.tsx"]);
  });

  it("does not warn when source is staged alongside a unit doc", () => {
    const { shouldWarn } = classify([
      "apps/web/components/card/links.tsx",
      "docs/units/UNIT-11.2-link-icons-hover-reveal.md",
    ]);
    expect(shouldWarn).toBe(false);
  });

  it("treats DESIGN.md (under docs/) as a doc surface", () => {
    const { shouldWarn } = classify(["packages/ui/src/theme.css", "docs/design/DESIGN.md"]);
    expect(shouldWarn).toBe(false);
  });

  it("treats root PLAN.md as a doc surface", () => {
    const { shouldWarn } = classify(["packages/domain/src/enums.ts", "PLAN.md"]);
    expect(shouldWarn).toBe(false);
  });

  it("does not warn for docs-only commits", () => {
    const { shouldWarn, sourceFiles } = classify(["docs/plans/x.md", "README.md"]);
    expect(shouldWarn).toBe(false);
    expect(sourceFiles).toEqual([]);
  });

  it("excludes test/spec files and the e2e app from source", () => {
    expect(isSourceFile("apps/web/components/card/links.test.tsx")).toBe(false);
    expect(isSourceFile("packages/domain/src/registry.spec.ts")).toBe(false);
    expect(isSourceFile("apps/e2e/tests/board.spec.ts")).toBe(false);
    // A commit of only tests does not warn.
    expect(classify(["apps/web/components/card/links.test.tsx"]).shouldWarn).toBe(false);
  });

  it("counts Rust (src-tauri) changes as source", () => {
    expect(isSourceFile("apps/desktop/src-tauri/src/main.rs")).toBe(true);
    expect(classify(["apps/desktop/src-tauri/src/main.rs"]).shouldWarn).toBe(true);
  });

  it("ignores non-workspace files (root config, scripts) as source", () => {
    expect(isSourceFile("package.json")).toBe(false);
    expect(isSourceFile("scripts/check-docs-touched.mjs")).toBe(false);
    expect(isDocFile("docs/units/UNIT-1.md")).toBe(true);
    expect(isDocFile("PLAN.md")).toBe(true);
    expect(isDocFile("README.md")).toBe(false);
  });
});
