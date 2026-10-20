import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || "38790";
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // Tests teilen sich eine Datenbank und legen Daten an → nacheinander ausführen
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "de-DE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Pflege und Reinigung arbeiten am Smartphone/iPad – dort zusätzlich testen
    { name: "smartphone", use: { ...devices["Pixel 7"] }, grep: /@mobil/ },
  ],
  webServer: {
    command: "node start-server.js",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: PORT },
  },
});
