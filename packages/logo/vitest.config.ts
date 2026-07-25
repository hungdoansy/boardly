import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineProject } from "vitest/config";

// jsdom + jest-dom for the <BoardlyMark/> component test.
export default defineProject({
  plugins: [react(), tsconfigPaths()],
  test: {
    name: "logo",
    environment: "jsdom",
    setupFiles: [fileURLToPath(new URL("../../vitest.setup.ts", import.meta.url))],
  },
});
