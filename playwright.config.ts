import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      grepInvert: /@phone/,
    },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    // The sample document stands in for the database, so the tests need no Supabase project.
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ...process.env, CRAFTABLES_FIXTURE: "1" } as Record<string, string>,
  },
});
