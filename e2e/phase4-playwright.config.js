const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, defineConfig } = require("@playwright/test");
const { CROSS_HOST_VISUAL_DIFF_PIXELS } = require("./support/visual-freeze");

const bundledChromium = chromium.executablePath();
const systemChrome = process.env.ProgramFiles
  ? join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
  : "";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(bundledChromium) ? "" : existsSync(systemChrome) ? systemChrome : "");

module.exports = defineConfig({
  testDir: ".",
  testMatch: /phase4-.*\.spec\.js/,
  timeout: 45_000,
  outputDir: "../test-results/phase4",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never", outputFolder: "../playwright-report/phase4" }]],
  // Phase 4 intentionally consumes the frozen Phase 3 public baselines. It never
  // creates a second snapshot set or updates an existing baseline.
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
    command: "npm run build && node e2e/support/phase4-production-server.mjs",
    cwd: join(__dirname, ".."),
    url: "http://127.0.0.1:4174/__phase4/health",
    reuseExistingServer: false,
    timeout: 90_000,
  },
  projects: [
    { name: "visual-360x800", use: { viewport: { width: 360, height: 800 } } },
    { name: "visual-390x844", use: { viewport: { width: 390, height: 844 } } },
    { name: "visual-768x1024", use: { viewport: { width: 768, height: 1024 } } },
    { name: "visual-1440x900", use: { viewport: { width: 1440, height: 900 } } },
    { name: "visual-1920x1080", use: { viewport: { width: 1920, height: 1080 } } },
  ],
});
