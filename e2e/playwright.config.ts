import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://127.0.0.1:5188", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // test the production build (bundling bugs, e.g. a missing map worker, only show up there)
    command:
      "pnpm --filter @zugx/web exec vp build && pnpm --filter @zugx/web exec vp preview --port 5188 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
