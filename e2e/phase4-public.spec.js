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
    await expect(page.locator('script[src="app.js?v=ui-motion-3"]')).toHaveCount(1);
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

  test("home mobile menu traps real keyboard focus and gates the background", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, "mobile navigation keyboard contract is exercised at 390px");
    await gotoHome(page);

    const toggle = page.locator(".mobile-menu-toggle");
    const menu = page.locator(".mobile-nav");
    const close = menu.locator(".mobile-nav-close");
    const menuItems = [
      ...await menu.locator(".mobile-nav-panel > a").all(),
      ...await menu.locator(".mobile-nav-panel > .mobile-nav-action").all(),
    ];

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(close).toBeFocused();
    await expect(page.locator("header.site-header")).toHaveAttribute("inert", "");
    await expect(page.locator("main")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("banner")).toHaveCount(0);

    for (const item of menuItems) {
      await page.keyboard.press("Tab");
      await expect(item).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(menuItems.at(-1)).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator("header.site-header")).not.toHaveAttribute("inert", "");
    await expect(page.locator("main")).not.toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("banner")).toHaveCount(1);
  });

  test("home keeps an empty legacy catalog sentinel and navigates into the React catalog", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "catalog ownership is characterized at the desktop baseline");
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoHome(page);

    const sentinel = page.locator("#catalog-view");
    await expect(sentinel).toBeHidden();
    expect(await sentinel.getAttribute("aria-labelledby")).toBeNull();
    expect(await sentinel.locator(":scope > *").count()).toBe(0);
    await expect(page.locator("#popular .venue-card.is-extra")).toHaveCount(0);
    await expect(page.locator("#popular .venue-grid > .venue-card:not(.home-stored-card)")).toHaveCount(3);

    await page.locator("[data-open-categories]").first().click();
    await expect(page.locator("#categories-view")).toBeVisible();
    await page.locator("#categories-view [data-home-link]").click();
    await expect(page.locator("#guide")).toBeVisible();

    await page.locator('#categories [data-filter-category="Рестораны"]').click();
    await expect(page).toHaveURL(/\/catalog\?category=/);
    await expect(page.locator('main[data-react-route="catalog"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("home summary is identical in raw SSR and hydrated fixture DOM", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "summary contract is exercised once at desktop");
    const response = await gotoHome(page);
    const html = await response.text();

    expect(html).toContain('data-home-catalog-source="database"');
    expect(html).toContain('data-category-count="Кофейни">1 место');
    expect(html).toContain('data-city-count="Ялта">1 место');
    expect(html).toContain('data-venue-total-label="venues"><strong data-venue-count="" aria-label="3">3</strong> заведения');

    await expect(page.locator('[data-venue-count]')).toHaveText(["3", "3", "3"]);
    await expect(page.locator('#categories [data-category-count="Кофейни"]')).toHaveText("1 место");
    await expect(page.locator('[data-city-count="Ялта"]')).toHaveText("1 место");
    await expect(page.locator('[data-venue-total-label="venues"]')).toHaveText("3 заведения");
    await expect(page.locator('[data-venue-total-label="catalog-stat"]')).toHaveText("заведения в каталоге");

    const categoryHref = await page.locator('#categories [data-filter-category="Кофейни"]').getAttribute("href");
    const cityHref = await page.locator('[data-city-filter="Ялта"]').getAttribute("href");
    expect(new URL(categoryHref, "http://fixture").searchParams.get("category")).toBe("Кофейни");
    expect(new URL(cityHref, "http://fixture").searchParams.get("city")).toBe("Ялта");
    expect((await fixtureApi.read()).requestCounters.venueList).toBe(2);
  });
});

test.describe("Phase 4 home editorial fallback", () => {
  test.use({ allowedHttpErrors: [{ path: "/api/venues", status: 503 }] });

  test("unavailable summary keeps the server editorial aggregate through hydration", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "fallback contract is exercised once at desktop");
    await fixtureApi.set({ catalogError: true });
    const response = await gotoHome(page);
    const html = await response.text();

    expect(html).toContain('data-home-catalog-source="editorial-fallback"');
    expect(html).toContain('data-venue-total-label="venues"><strong data-venue-count="" aria-label="7">7</strong> заведений');
    await expect(page.locator('[data-venue-count]')).toHaveText(["7", "7", "7"]);
    await expect(page.locator('[data-category-count="Рестораны"]').first()).toHaveText("7 мест");
    await expect(page.locator('[data-city-count="Ялта"]')).toHaveText("2 места");
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
