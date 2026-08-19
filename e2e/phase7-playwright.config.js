const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, defineConfig, devices } = require("@playwright/test");
const { CROSS_HOST_VISUAL_DIFF_PIXELS } = require("./support/visual-freeze");

const bundledChromium = chromium.executablePath();
const systemChrome = process.env.ProgramFiles
  ? join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
  : "";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(bundledChromium) ? "" : existsSync(systemChrome) ? systemChrome : "");

const visualViewports = [
  ["visual-360x800", { width: 360, height: 800 }],
  ["visual-390x844", { width: 390, height: 844 }],
  ["visual-768x1024", { width: 768, height: 1024 }],
  ["visual-1440x900", { width: 1440, height: 900 }],
  ["visual-1920x1080", { width: 1920, height: 1080 }],
];

module.exports = defineConfig({
  testDir: ".",
  testMatch: /phase7-(?:fixture|merchant)\.spec\.js/,
  timeout: 45_000,
  outputDir: "../test-results/phase7",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never", outputFolder: "../playwright-report/phase7" }]],
  // Phase 7 consumes the immutable Phase 1 legacy baselines. A failing comparison
  // is migration evidence and must never create or approve a replacement here.
  snapshotPathTemplate: "{testDir}/__screenshots__/visual.spec.js/{projectName}/{arg}{ext}",
  expect: {
    timeout: 8_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: CROSS_HOST_VISUAL_DIFF_PIXELS, scale: "css" },
  },
  use: {
    baseURL: "http://127.0.0.1:4174",
    browserName: "chromium",
    colorScheme: "light",
    deviceScaleFactor: 1,
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {},
    locale: "ru-RU",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    timezoneId: "Europe/Simferopol",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build:local && node e2e/support/phase4-production-server.mjs",
    cwd: join(__dirname, ".."),
    url: "http://127.0.0.1:4174/__phase4/health",
    reuseExistingServer: false,
    timeout: 90_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    ...visualViewports.map(([name, viewport]) => ({ name, use: { viewport } })),
  ],
});
