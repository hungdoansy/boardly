import { defineConfig } from "vitest/config";

// Root Vitest config using `test.projects` (replaces the deprecated
// vitest.workspace). Each project owns its own config so `turbo run test`
// can run them independently with caching, while `vitest run` at the root
// runs the whole suite in one pass.
export default defineConfig({
  test: {
    projects: [
      "packages/domain",
      "packages/sync",
      "packages/commands",
      "packages/ui",
      "apps/web",
      "apps/server",
      "apps/mcp",
    ],
  },
});
