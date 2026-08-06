const {
  expect,
  test,
  waitForFullPageStableUi,
  waitForStableUi,
} = require("./support/test-fixtures");

async function expectFrozenFullPage(page, snapshot) {
  const dimensions = await waitForFullPageStableUi(page);
  const session = await page.context().newCDPSession(page);
  let image;
  try {
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height, scale: 1 },
    });
    image = Buffer.from(result.data, "base64");
  } finally {
    await session.detach();
  }

  expect(image.readUInt32BE(16), "screenshot width must equal the frozen viewport").toBe(dimensions.width);
  expect(image.readUInt32BE(20), "screenshot height must equal the settled document").toBe(dimensions.height);
  await expect(image).toMatchSnapshot(snapshot, { maxDiffPixels: 1_500 });
}

async function gotoHome(page) {
  const response = await page.goto("/");
  await expect(page.locator('main[data-react-route="home"]')).toBeVisible();
  await expect(page.locator("#guide-title")).toBeVisible();
  return response;
}

async function gotoHelp(page) {
  const response = await page.goto("/help");
  await expect(page.locator('main[data-react-route="help"]')).toBeVisible();
  await expect(page.locator("#page-title")).toBeVisible();
  return response;
}

test.describe("Phase 4 public routes on the production React server", () => {
  test("home preserves core landmarks, legacy boot script, and the frozen visual", async ({ page }) => {
    const response = await gotoHome(page);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("s-maxage=60");
    expect(await response?.text()).toContain('data-react-route="home"');

    await expect(page.locator("header.site-header")).toHaveCount(1);
    await expect(page.locator("main #guide")).toHaveCount(1);
    await expect(page.locator("#categories, #popular, #collections, #cities, #site-footer")).toHaveCount(5);
    await expect(page.locator('script[src="app.js?v=ui-motion-2"]')).toHaveCount(1);
    await expect(page.locator('script[type="module"]')).toHaveCount(0);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/$/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/$/);

    await expectFrozenFullPage(page, "public-home.png");
  });

  test("help preserves document anchors, metadata, and the frozen visual", async ({ page }) => {
    const response = await gotoHelp(page);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("s-maxage=60");
    expect(await response?.text()).toContain('data-react-route="help"');

    await expect(page.locator("a.skip-link[href='#content']")).toHaveCount(1);
    await expect(page.locator("#faq, #partners, #rules, #privacy, #terms")).toHaveCount(5);
    await expect(page.locator('a[href="#faq"]')).not.toHaveCount(0);
    await expect(page.locator('script[src*="app.js"]')).toHaveCount(0);
    await expect(page.locator('script[type="module"]')).toHaveCount(0);
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/help$/);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/help$/);

    await expectFrozenFullPage(page, "public-help.png");
  });

  test("theme controls cycle deterministically on both migrated routes", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "theme behavior is characterized at the desktop baseline");
    for (const path of ["/", "/help"]) {
      await page.goto(path);
      const toggle = page.locator("[data-theme-toggle]").first();
      await expect(toggle).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "graphite");
      await toggle.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
    }
  });

  test("home mobile menu keeps its frozen interaction contract", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, "mobile navigation baseline is frozen at 390px");
    await gotoHome(page);
    await page.locator(".mobile-menu-toggle").click();
    await expect(page.locator(".mobile-nav")).toBeVisible();
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot("interactive-mobile-menu.png");
  });
});

for (const theme of ["graphite", "midnight"]) {
  test.describe(`Phase 4 ${theme} frozen theme`, () => {
    test.use({ colorTheme: theme });

    for (const [name, path] of [["home", "/"], ["help", "/help"]]) {
      test(`${theme} ${name}`, async ({ page }) => {
        test.skip((page.viewportSize()?.width || 0) !== 1440, "alternate-theme baselines are frozen at 1440px");
        if (path === "/") await gotoHome(page); else await gotoHelp(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectFrozenFullPage(page, `theme-${theme}-${name}.png`);
      });
    }
  });
}
