const AxeBuilder = require('@axe-core/playwright').default;
const { expect, openCatalogFromCategory, openLoginDialog, test, waitForStableUi } = require('./support/test-fixtures');

async function expectNoCriticalViolations(page, testInfo) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  await testInfo.attach('axe-results', {
    body: Buffer.from(JSON.stringify(results.violations, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  const critical = results.violations.filter((violation) => violation.impact === 'critical');
  const summary = critical.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`).join('\n');
  expect(critical, summary || 'no critical axe violations').toEqual([]);
}

test.describe('legacy accessibility smoke', () => {
  test('home page', async ({ page }, testInfo) => {
    await page.goto('/');
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });

  test('catalog with selected filter', async ({ page }, testInfo) => {
    test.skip(true, 'The catalog accessibility gate moved to the React-owned Phase 5 suite.');
    await page.goto('/');
    await openCatalogFromCategory(page);
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });

  test('authentication dialog', async ({ page }, testInfo) => {
    await page.goto('/');
    await openLoginDialog(page);
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });

  test('help page', async ({ page }, testInfo) => {
    await page.goto('/help');
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });

  test('merchant login shell', async ({ page }, testInfo) => {
    await page.goto('/merchant');
    await expect(page.locator('#merchant-login')).toBeVisible();
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });

  test('admin login shell', async ({ page }, testInfo) => {
    await page.goto('/admin');
    await expect(page.locator('#admin-login')).toBeVisible();
    await waitForStableUi(page);
    await expectNoCriticalViolations(page, testInfo);
  });
});
