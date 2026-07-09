import { describe, expect, it } from "vitest";

import { loadConfig } from "./config";

describe("loadConfig", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => loadConfig({})).toThrow(/Invalid server configuration/);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("parses a valid env and applies defaults", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://u:p@localhost:5433/boardly" });
    expect(config.DATABASE_URL).toBe("postgres://u:p@localhost:5433/boardly");
    expect(config.PORT).toBe(8787);
    expect(config.HOST).toBe("0.0.0.0");
  });

  it("coerces PORT from a string and respects overrides", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://x",
      PORT: "9000",
      HOST: "127.0.0.1",
    });
    expect(config.PORT).toBe(9000);
    expect(config.HOST).toBe("127.0.0.1");
  });
});
