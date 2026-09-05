import { defineConfig, devices } from "@playwright/test";

// The web app's static export bakes NEXT_PUBLIC_API_URL at build time; the
// committed `out/` targets http://localhost:8787 and the server's default CORS
// allows http://localhost:3000 — so we serve the build on :3000 and the API on
// :8787 (no rebuild/override needed). The sync spec + auth flows need the live
// server + Dockerized Postgres (`docker compose up db`, migrations applied).
const WEB_PORT = 3000;
const API_PORT = 8787;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://boardly:boardly@localhost:5433/boardly";

export default defineConfig({
  testDir: "./tests",
  // One shared server + one database → serialize to keep specs deterministic.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  // Refuses to start when `apps/web/out` was built against another API origin
  // — `next build` bakes it in, and `.env.production` points at the Docker
  // production stack. See the file for why this is a hard stop.
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  snapshotDir: "./snapshots",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    colorScheme: "dark",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Serve the static export as-is (NO `-s`): the app is multi-page
      // (`/`, `/login`, `/signup`) and boards are hash-routed on `/`
      // (`/#board/<id>`), so SPA rewriting would clobber /login and /signup.
      command: `npx serve ../web/out -l ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @boardly/server start",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL,
        PORT: String(API_PORT),
        HOST: "127.0.0.1",
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        NODE_ENV: "test",
        // The suite signs up / logs in many times from one IP; lift the login
        // rate limit for e2e (production keeps the default 5/min).
        LOGIN_RATE_MAX: "1000",
      },
    },
  ],
});
