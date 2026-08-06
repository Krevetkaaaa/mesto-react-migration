const AxeBuilder = require("@axe-core/playwright").default;
const {
  authenticateFixture,
  expect,
  test,
  waitForFullPageStableUi,
  waitForStableUi,
} = require("./support/test-fixtures");

async function gotoCatalog(page, path = "/catalog") {
  const response = await page.goto(path);
  await expect(page.locator('main[data-react-route="catalog"]')).toBeVisible();
  await expect(page.locator("#catalog-title")).toBeVisible();
  return response;
}

async function expectNoSeriousAxeViolations(page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe("Phase 5 catalog routes", () => {
  test("SSR catalog is canonical, hydrated once, addressable and restores URL filters", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    const response = await gotoCatalog(page);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("s-maxage=60");
    const html = await response.text();
    expect(html).toContain("Тихий сад");
    expect(html).not.toContain('src="app.js');
    expect(html).toContain('type="module"');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/catalog$/);

    await page.locator("#catalog-category").selectOption("Рестораны");
    await expect(page).toHaveURL(/\/catalog\?category=/);
    await page.locator("#catalog-city").selectOption("Симферополь");
    await expect(page).toHaveURL(/city=/);
    await page.locator("#catalog-cuisine").selectOption("Европейская");
    await page.locator("label:has(#catalog-pet) span").click();
    await expect(page).toHaveURL(/cuisine=.*pet=1/);
    await page.reload();
    await expect(page.locator("#catalog-category")).toHaveValue("Рестораны");
    await expect(page.locator("#catalog-city")).toHaveValue("Симферополь");
    await expect(page.locator("#catalog-pet")).toBeChecked();
    await page.goBack();
    await expect(page.locator("#catalog-pet")).not.toBeChecked();
    await page.goForward();
    await expect(page.locator("#catalog-pet")).toBeChecked();
  });

  test("pagination follows server next offsets and preserves cumulative cards", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    await fixtureApi.set({ catalogPageSize: 1 });
    await gotoCatalog(page);
    await expect(page.locator("#catalog-grid .venue-card")).toHaveCount(1);
    await page.locator("#catalog-load-more").click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("#catalog-grid .venue-card")).toHaveCount(2);
    expect((await fixtureApi.read()).requestCounters.venueList).toBeGreaterThanOrEqual(3);
  });

  test("city route has stable SEO URL and unknown city is a real 404", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    const response = await gotoCatalog(page, "/city/simferopol");
    expect(response?.status()).toBe(200);
    await expect(page.locator("#catalog-title")).toContainText("Симферополь");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/city\/simferopol$/);
    const missing = await page.request.get("/city/not-a-city");
    expect(missing.status()).toBe(404);
  });

  test("venue is SSR-visible, modal, stable and closes back to the filtered catalog", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    const from = "/catalog?city=%D0%A1%D0%B8%D0%BC%D1%84%D0%B5%D1%80%D0%BE%D0%BF%D0%BE%D0%BB%D1%8C";
    const response = await page.goto(`/venue/tihiy-sad?from=${encodeURIComponent(from)}`);
    expect(response?.status()).toBe(200);
    expect(await response.text()).toContain("Тихий сад");
    await expect(page.locator("#venue-dialog")).toBeVisible();
    await expect(page.locator("#venue-dialog-title")).toHaveText("Тихий сад");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/venue\/tihiy-sad$/);
    await page.locator("#venue-dialog .dialog-heart").click();
    await expect(page.getByText(/Авторизируйтесь или зарегистрируйтесь/)).toBeVisible();
    expect((await fixtureApi.read()).favorites).toBe(0);
    await page.locator("#venue-dialog .dialog-close").click();
    await expect(page).toHaveURL(new RegExp(from.replace(/[?]/g, "\\?")));
    expect((await page.request.get("/venue/missing-place")).status()).toBe(404);
    expect((await page.request.get("/venue/INVALID--SLUG")).status()).toBe(400);
  });

  test("guest favorite prompts auth without writing; authenticated favorite saves", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    await gotoCatalog(page);
    const favorite = page.locator("#catalog-grid .fav").first();
    await favorite.click();
    await expect(page.getByText(/Авторизируйтесь или зарегистрируйтесь/)).toBeVisible();
    expect((await fixtureApi.read()).favorites).toBe(0);

    await authenticateFixture(page, "customer");
    await page.reload();
    await favorite.click();
    await expect(favorite).toHaveClass(/is-saved/);
    expect((await fixtureApi.read()).favorites).toBe(1);
  });

  test("catalog exposes loading, fallback error and retry without stale overwrite", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    await fixtureApi.set({ catalogDelayMs: 250 });
    await gotoCatalog(page);
    await page.locator("#catalog-city").selectOption("Ялта");
    await expect(page.locator(".catalog-inner")).toHaveClass(/is-catalog-loading/);
    await expect(page.locator("#catalog-venues-status")).toContainText("Обновляем каталог");
    await expect(page.locator("#catalog-grid .venue-card")).toHaveCount(1);
    await fixtureApi.set({ catalogDelayMs: 0, catalogError: true });
    await page.locator("#catalog-refresh").click();
    await expect(page.getByRole("alert")).toContainText("Показана подборка редакции");
    await fixtureApi.set({ catalogError: false });
    await page.getByRole("button", { name: "Повторить" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("new routes have no serious WCAG axe violations", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "axe contract is exercised once at desktop");
    for (const path of ["/catalog", "/city/simferopol", "/venue/tihiy-sad"]) {
      await page.goto(path);
      await waitForStableUi(page);
      await expectNoSeriousAxeViolations(page);
    }
  });

  test("standalone catalog mobile menu is React-owned and closable", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, "mobile interaction is exercised at the frozen 390px viewport");
    await gotoCatalog(page);
    await page.locator(".mobile-menu-toggle").click();
    await expect(page.locator(".mobile-nav")).toBeVisible();
    await page.locator(".mobile-nav-close").click();
    await expect(page.locator(".mobile-nav")).toBeHidden();
  });
});

test.describe("Phase 5 favorite rollback", () => {
  test.use({ expectedHttpErrors: [{ path: "/api/favorites", status: 503 }] });

  test("authenticated favorite rolls back a failed removal", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "functional contract is exercised once at desktop");
    await authenticateFixture(page, "customer");
    await gotoCatalog(page);
    const favorite = page.locator("#catalog-grid .fav").first();
    await favorite.click();
    await expect(favorite).toHaveClass(/is-saved/);
    await fixtureApi.set({ favoritesFailNext: true });
    await favorite.click();
    await expect(page.getByText(/Не удалось изменить избранное/)).toBeVisible();
    await expect(favorite).toHaveClass(/is-saved/);
    expect((await fixtureApi.read()).favorites).toBe(1);
  });
});

for (const [name, path] of [
  ["catalog", "/catalog"],
  ["city-simferopol", "/city/simferopol"],
  ["venue-tihiy-sad", "/venue/tihiy-sad"],
]) {
  test(`Phase 5 visual ${name}`, async ({ page }) => {
    await page.goto(path);
    if (name.startsWith("venue")) await expect(page.locator("#venue-dialog")).toBeVisible();
    else await waitForFullPageStableUi(page);
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: !name.startsWith("venue") });
  });
}

for (const theme of ["graphite", "midnight"]) {
  test.describe(`Phase 5 ${theme} theme`, () => {
    test.use({ colorTheme: theme });
    for (const [name, path] of [["catalog", "/catalog"], ["venue", "/venue/tihiy-sad"]]) {
      test(`Phase 5 theme ${theme} ${name}`, async ({ page }) => {
        test.skip((page.viewportSize()?.width || 0) !== 1440, "theme baseline is frozen at 1440px");
        await page.goto(path);
        if (name === "venue") await expect(page.locator("#venue-dialog")).toBeVisible();
        await waitForStableUi(page);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (name === "catalog") {
          const expectedBrandColor = theme === "graphite" ? "rgb(242, 239, 233)" : "rgb(237, 243, 251)";
          await expect(page.locator(".site-header .brand-word")).toHaveCSS("color", expectedBrandColor);
          await expect(page.locator(".site-footer .brand-word")).toHaveCSS("color", expectedBrandColor);
        }
        await expectNoSeriousAxeViolations(page);
        await expect(page).toHaveScreenshot(`theme-${theme}-${name}.png`, { fullPage: name === "catalog" });
      });
    }
  });
}
