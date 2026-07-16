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

  it("applies attachment storage defaults", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://x" });
    expect(config.UPLOADS_DIR).toBe("./data/uploads");
    expect(config.MAX_UPLOAD_BYTES).toBe(10_485_760);
    expect(config.DATABASE_LIMIT_BYTES).toBe(1_073_741_824);
    expect(config.UPLOADS_LIMIT_BYTES).toBe(5_368_709_120);
  });

  it("coerces attachment byte limits from strings and respects overrides", () => {
    const config = loadConfig({
      DATABASE_URL: "postgres://x",
      UPLOADS_DIR: "/data/uploads",
      MAX_UPLOAD_BYTES: "20971520",
      UPLOADS_LIMIT_BYTES: "10737418240",
    });
    expect(config.UPLOADS_DIR).toBe("/data/uploads");
    expect(config.MAX_UPLOAD_BYTES).toBe(20_971_520);
    expect(config.UPLOADS_LIMIT_BYTES).toBe(10_737_418_240);
  });

  it("rejects a non-numeric byte limit", () => {
    expect(() =>
      loadConfig({ DATABASE_URL: "postgres://x", MAX_UPLOAD_BYTES: "notanumber" }),
    ).toThrow(/Invalid server configuration/);
  });
});
