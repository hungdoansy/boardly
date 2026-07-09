import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index";

describe("@boardly/domain", () => {
  it("exposes its package name (sample test — harness smoke check)", () => {
    expect(PACKAGE_NAME).toBe("@boardly/domain");
  });
});
