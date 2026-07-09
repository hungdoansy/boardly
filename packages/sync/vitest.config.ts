import { fileURLToPath } from "node:url";

import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject } from "vitest/config";

// Node environment + fake-indexeddb so Yjs persistence (Unit 1.2) can be
// unit-tested without a browser.
export default defineProject({
  plugins: [tsconfigPaths()],
  test: {
    name: "sync",
    environment: "node",
    setupFiles: [fileURLToPath(new URL("../../vitest.setup.ts", import.meta.url))],
  },
});
