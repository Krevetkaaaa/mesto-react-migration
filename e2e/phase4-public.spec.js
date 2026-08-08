const {
  authenticateFixture,
  expect,
  test,
  waitForFullPageStableUi,
  waitForStableUi,
} = require("./support/test-fixtures");

const CROSS_HOST_VISUAL_DIFF_PIXELS = 3_000;

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
  await expect(image).toMatchSnapshot(snapshot, { maxDiffPixels: CROSS_HOST_VISUAL_DIFF_PIXELS });
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
  test("home preserves core landmarks under React hydration and the approved visual", async ({ page }) => {
    const legacyRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/app.js") legacyRequests.push(request.url());
    });
    const response = await gotoHome(page);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("s-maxage=60");
    expect(await response.text()).toMatch(/<script[^>]+type="module"/u);
    expect(await response?.text()).toContain('data-react-route="home"');

    await expect(page.locator("header.site-header")).toHaveCount(1);
    await expect(page.locator("main #guide")).toHaveCount(1);
    await expect(page.locator("#categories, #popular, #collections, #cities, #site-footer")).toHaveCount(5);
    await expect(page.locator('script[src*="app.js"]')).toHaveCount(0);
    expect(legacyRequests).toEqual([]);
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
    await expect(page.locator("body")).toHaveClass(/has-mobile-menu/);
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
    await expect(page.locator("body")).not.toHaveClass(/has-mobile-menu/);

    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await menu.click({ position: { x: 5, y: 5 } });
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator("body")).not.toHaveClass(/has-mobile-menu/);

    await page.keyboard.press("Enter");
    await menu.getByRole("link", { name: "Рестораны" }).click();
    await expect(page).toHaveURL(/\/#popular$/);
    await expect(menu).toBeHidden();
    await expect(page.locator("body")).not.toHaveClass(/has-mobile-menu/);
  });

  test("home removes legacy sentinels and navigates into the React catalog", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "catalog ownership is characterized at the desktop baseline");
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await gotoHome(page);

    await expect(page.locator("#catalog-view, #categories-view, #profile-view")).toHaveCount(0);
    await expect(page.locator("#popular .venue-card.is-extra")).toHaveCount(0);
    await expect(page.locator("#popular .home-featured-venue-card")).toHaveCount(5);
    await expect(page.locator('script[src*="app.js"]')).toHaveCount(0);

    await page.locator("#categories .text-link").click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.locator('main[data-react-route="catalog"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("home database metadata stays legacy-compatible and whole cards use client navigation", async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "card navigation is exercised once at desktop");
    await gotoHome(page);

    const databaseCards = page.locator("#popular .home-database-venue-card");
    await expect(databaseCards).toHaveCount(2);
    for (const card of await databaseCards.all()) {
      await expect(card).toHaveClass(/catalog-venue-card/);
      await expect(card).toHaveClass(/home-stored-card/);
      await expect(card).toHaveAttribute("data-branch-count", "1");
      await expect(card.locator(".venue-meta--source")).not.toBeEmpty();
      await expect(card.locator(".venue-source-note")).toHaveText("Опубликовано в каталоге «Места»");
      await expect(card.locator(".venue-card-description, .card-rating-badge, .venue-amenities, .venue-card-action")).toHaveCount(4);
      await expect(card.locator(".venue-price")).toHaveCount(0);
      await expect(card.locator("a.home-venue-card-link")).toHaveCount(1);
      await expect(card.locator("a")).toHaveCount(1);
    }

    await page.evaluate(() => { window.__mestoClientNavigationMarker = "preserved"; });
    const link = page.locator('[data-venue="marea"] .home-venue-card-link');
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/venue\/barkas\?from=%2F$/);
    expect(await page.evaluate(() => window.__mestoClientNavigationMarker)).toBe("preserved");
    await expect(page.locator("#venue-dialog .dialog-media img")).toHaveAttribute("src", /^\/assets\//);

    await page.locator("#venue-dialog > .dialog-close").click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => window.__mestoClientNavigationMarker)).toBe("preserved");

    await page.goto("/city/simferopol");
    await expect(page.locator("#catalog-view .venue-card .venue-image img").first()).toHaveAttribute("src", /^\/assets\//);
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

  test("home guards and submits the React venue form", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "submission contract is exercised once at desktop");

    await page.goto("/?open=submission#guide");
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    const anonymousReturnTo = new URL(page.url()).searchParams.get("returnTo");
    expect(anonymousReturnTo).toBe("/?open=submission#guide");

    await page.getByLabel("Почта или логин").fill("anna@example.test");
    await page.getByLabel("Пароль").fill("fixture-password");
    await page.locator(".form-dialog-inner form").getByRole("button", { name: /^Войти/ }).click();
    await expect(page).toHaveURL(/\/\?open=submission#guide$/);

    const dialog = page.locator("#submission-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Закрыть" }).click();
    await expect(page).toHaveURL(/\/#guide$/);

    const submissionLink = page.locator("#home-submission-link");
    await expect(submissionLink).toBeFocused();
    await submissionLink.click();
    await expect(page).toHaveURL(/\/\?open=submission#guide$/);
    await expect(dialog).toBeVisible();

    const form = dialog.locator("#submission-form");
    await expect(form.locator('[name="contactName"]')).not.toHaveValue("");
    await expect(form.locator('[name="contactEmail"]')).not.toHaveValue("");
    await form.locator('[name="title"]').fill("React терраса");
    await form.locator('[name="city"]').selectOption("Ялта");
    await form.locator('[name="category"]').selectOption("Рестораны");
    await form.locator('[name="description"]').fill("Тестовая заявка React с видом на море и сезонным меню.");
    await form.locator('[name="consent"]').check();
    const submitted = page.waitForResponse((response) => (
      new URL(response.url()).pathname === "/api/submissions"
      && response.request().method() === "POST"
    ));
    await form.getByRole("button", { name: /Отправить на модерацию/ }).click();
    expect((await submitted).status()).toBe(201);
    await expect(dialog.getByRole("status")).toContainText("Заявка отправлена на модерацию");
    expect((await fixtureApi.read()).submissions).toBe(2);
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

test.describe("Phase 4 submission session recovery", () => {
  test.use({ allowedHttpErrors: [{ path: "/api/auth/session", status: 503 }] });

  test("keeps the requested form recoverable when session restore fails", async ({ page, fixtureApi }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, "session recovery is exercised once at desktop");
    await fixtureApi.set({ authError: true });
    await page.goto("/?open=submission#guide");

    await expect(page).toHaveURL(/\?open=submission/);
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Не удалось проверить сессию");
    await expect(page.locator("#submission-dialog")).toHaveCount(0);

    await fixtureApi.set({ authError: false });
    await authenticateFixture(page, "customer");
    await alert.getByRole("button", { name: "Повторить" }).click();

    await expect(page.locator("#submission-dialog")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
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
