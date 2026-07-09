import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "server",
    environment: "node",
    // Only source tests — never the compiled copies under dist/ (from `tsc`).
    include: ["src/**/*.test.ts"],
  },
});
