const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { chromium, defineConfig, devices } = require('@playwright/test');

const bundledChromium = chromium.executablePath();
const systemChrome = process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe') : '';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync(bundledChromium) ? '' : existsSync(systemChrome) ? systemChrome : '');

const visualViewports = [
  ['visual-360x800', { width: 360, height: 800 }],
  ['visual-390x844', { width: 390, height: 844 }],
  ['visual-768x1024', { width: 768, height: 1024 }],
  ['visual-1440x900', { width: 1440, height: 900 }],
  ['visual-1920x1080', { width: 1920, height: 1080 }]
];

module.exports = defineConfig({
  testDir: './e2e',
  // This config is the retained legacy safety net. React-owned route suites have
  // dedicated Phase 4-8 configs and must not run against the raw legacy server.
  testMatch: /(?:accessibility|legacy-public|legacy-shells|visual)\.spec\.js/,
  timeout: 45_000,
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}',
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 500,
      scale: 'css'
    }
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {},
    locale: 'ru-RU',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Simferopol',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node e2e/support/legacy-server.mjs',
    url: 'http://127.0.0.1:4173/__health',
    reuseExistingServer: false,
    timeout: 20_000
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /visual\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 }
      }
    },
    ...visualViewports.map(([name, viewport]) => ({
      name,
      testMatch: /visual\.spec\.js/,
      use: { browserName: 'chromium', viewport }
    }))
  ]
});
