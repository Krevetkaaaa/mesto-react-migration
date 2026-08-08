const AxeBuilder = require("@axe-core/playwright").default;
const { authenticateFixture, expect, test, waitForStableUi } = require("./support/test-fixtures");
const { PASSWORD_ERROR_MESSAGE, PASSWORD_PATTERN } = require("../password-policy-core.js");

function functionalOnly(testInfo) {
  test.skip(testInfo.project.name !== "chromium", "functional scenario runs once");
}

async function expectNoUnexpectedSeriousAxeViolations(page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = result.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  // The frozen legacy palette has known contrast debt; changing it is a separate, visible redesign task.
  const unexpected = blocking.filter(({ id }) => id !== "color-contrast");
  expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);
}

test.describe("Phase 6 public account routes", () => {
  test("home account dialogs replace history and restore their keyboard triggers", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/");

    const loginTrigger = page.locator(".login-trigger");
    await loginTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("dialog.form-dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    await expect(loginTrigger).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("dialog[open]")).toHaveCount(0);

    const registerTrigger = page.locator(".register-trigger");
    await registerTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/register$/);
    await page.locator("dialog.form-dialog > .dialog-close").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(registerTrigger).toBeFocused();

    await authenticateFixture(page, "customer");
    await page.goto("/");
    const favoritesTrigger = page.locator(".favorites-button");
    await favoritesTrigger.focus();
    await favoritesTrigger.click();
    await expect(page).toHaveURL(/\/favorites$/);
    await page.locator("dialog.favorites-dialog > .dialog-close").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(favoritesTrigger).toBeFocused();
  });

  test.describe("login action validation", () => {
    test.use({ expectedHttpErrors: [{ path: "/login.data", status: 401 }] });
  test("anonymous guard, failed login and successful session restore", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fprofile$/);
    await expect(page.getByRole("heading", { name: "Войти в аккаунт" })).toBeVisible();

    await page.getByLabel("Почта или логин").fill("anna@example.test");
    await page.getByLabel("Пароль").fill("wrong-password");
    await page.locator(".form-dialog-inner form").getByRole("button", { name: /^Войти/ }).click();
    await expect(page.getByRole("alert")).toContainText("Неверный логин или пароль");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Пароль").fill("fixture-password");
    await page.locator(".form-dialog-inner form").getByRole("button", { name: /^Войти/ }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator("#profile-view")).toBeVisible();
    await expect(page.locator(".login-trigger")).toHaveClass(/profile-button/);
  });
  });

  test("registration creates a session and logout clears it", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/register");
    await page.getByLabel("Имя").fill("Новый пользователь");
    await page.getByLabel("Логин", { exact: true }).fill("new-user");
    await page.getByLabel("Почта").fill("new-user@example.test");
    const password = page.getByLabel("Пароль");
    await expect(password).toHaveAttribute("pattern", PASSWORD_PATTERN);
    await expect(password).toHaveAttribute("title", PASSWORD_ERROR_MESSAGE);
    await password.fill("abcdefghij");
    await page.getByRole("button", { name: /^Создать аккаунт/ }).click();
    await expect(page).toHaveURL(/\/register$/);
    expect(await password.evaluate((input) => input.validity.patternMismatch)).toBe(true);
    expect((await fixtureApi.read()).authRequestCounters.register).toBe(0);

    await password.fill("Password1234");
    await page.getByRole("button", { name: /^Создать аккаунт/ }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "Новый пользователь" })).toBeVisible();

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === "e2e-session" && cookie.value)).toBe(false);
  });

  test("catalog favorites are shared with the protected favorites route", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await authenticateFixture(page, "customer");
    await page.goto("/catalog");
    const firstCard = page.locator(".catalog-venue-card").first();
    await expect(firstCard).toBeVisible();
    await firstCard.locator(".fav").click();
    await expect(page.getByText("Место сохранено в избранном.")).toBeVisible();
    await expect(page.locator(".favorites-count")).toHaveText("1");

    await page.goto("/favorites");
    await expect(page.getByRole("heading", { name: "Избранные места" })).toBeVisible();
    await expect(page.locator(".favorite-row")).toHaveCount(1);
    await page.locator(".favorite-row").click();
    await expect(page).toHaveURL(/\/venue\/tihiy-sad$/);
    await page.locator("#venue-dialog .dialog-heart").click();
    await expect(page.getByText("Место удалено из избранного.")).toBeVisible();
    expect((await fixtureApi.read()).favorites).toBe(0);
  });

  test("expired and revoked customer sessions cannot open protected HTML", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await authenticateFixture(page, "customer");
    for (const mode of ["expired", "revoked"]) {
      await fixtureApi.set({ customerSessionMode: mode });
      await page.goto("/favorites");
      await expect(page).toHaveURL(/\/login\?returnTo=%2Ffavorites$/);
    }
  });

  test("Google fragment completion scrubs the token before creating a session", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/login?returnTo=%2Fprofile#access_token=fixture-oauth-token");
    await expect(page).toHaveURL(/\/profile$/);
    expect(page.url()).not.toContain("access_token");
    await expect(page.locator("#profile-view")).toBeVisible();
  });

  test("Google fragment errors are scrubbed and rendered inline", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/login#error_description=denied");
    await expect(page.getByRole("alert")).toContainText("Вход через Google отменён");
    expect(page.url()).not.toContain("error_description");
  });

  test("Google, Yandex and VK controlled browser flows complete and callback failures stay in UI", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ oauthProviders: { google: true, yandex: true, vk: true }, oauthMode: "success" });
    for (const provider of ["Google", "Яндекс", "ВКонтакте"]) {
      await page.context().clearCookies();
      await page.goto("/login?returnTo=%2Fprofile");
      await page.locator(".social-grid button").filter({ hasText: provider }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.locator("#profile-view")).toBeVisible();
    }

    await page.context().clearCookies();
    await fixtureApi.set({ oauthMode: "denied" });
    await page.goto("/login");
    await page.locator(".social-grid button").filter({ hasText: "ВКонтакте" }).click();
    await expect(page).toHaveURL(/oauthError=OAUTH_DENIED/);
    await expect(page.getByRole("alert")).toContainText("Вход через внешний сервис отменён");
  });

  test.describe("account route outage UI", () => {
    test.describe("session outage", () => {
      // The hydrated account provider repeats the same controlled session
      // probe after the SSR boundary renders; the fixture deliberately keeps
      // that endpoint unavailable for the whole scenario.
      test.use({
        allowedHttpErrors: [{ path: "/api/auth/session", status: 503 }],
        expectedHttpErrors: [{ path: "/login", status: 500 }],
      });

      test("auth outage renders a controlled retry boundary", async ({ page, fixtureApi }, testInfo) => {
        functionalOnly(testInfo);
        await fixtureApi.set({ authError: true });
        const response = await page.goto("/login");
        expect(response?.status()).toBe(500);
        await expect(page.getByRole("heading", { name: "Сервис временно недоступен" })).toBeVisible();
      });
    });

    test.describe("favorites outage", () => {
      test.use({ expectedHttpErrors: [{ path: "/favorites", status: 500 }] });

      test("favorites outage renders a controlled retry boundary", async ({ page, fixtureApi }, testInfo) => {
        functionalOnly(testInfo);
        await fixtureApi.set({ favoritesError: true });
        await authenticateFixture(page, "customer");
        const response = await page.goto("/favorites");
        expect(response?.status()).toBe(500);
        await expect(page.getByRole("heading", { name: "Сервис временно недоступен" })).toBeVisible();
      });
    });
  });

  test("account routes have no unexpected serious WCAG axe violations", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/login");
    await waitForStableUi(page);
    await expectNoUnexpectedSeriousAxeViolations(page);

    await authenticateFixture(page, "customer");
    for (const path of ["/profile", "/favorites"]) {
      await page.goto(path);
      await waitForStableUi(page);
      await expectNoUnexpectedSeriousAxeViolations(page);
    }
  });
});

test.describe("Phase 6 visual freeze", () => {
  test("login and registration overlays", async ({ page }, testInfo) => {
    test.skip(!["visual-390x844", "visual-1440x900"].includes(testInfo.project.name), "approved auth viewports");
    await page.goto("/login");
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot("login.png");

    await page.goto("/register");
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot("register.png");
  });

  test("profile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium", "visual projects only");
    await authenticateFixture(page, "customer");
    await page.goto("/profile");
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot("profile.png", { fullPage: true });
  });

  test("favorites overlay", async ({ page, fixtureApi }, testInfo) => {
    test.skip(!["visual-390x844", "visual-1440x900"].includes(testInfo.project.name), "approved favorites viewports");
    await authenticateFixture(page, "customer");
    await fixtureApi.set({ favorites: [{
      venue_key: "tihiy-sad",
      venue_id: "30000000-0000-4000-8000-000000000001",
      external_venue_id: null,
      snapshot: {
        slug: "tihiy-sad",
        title: "Тихий сад",
        type: "Ресторан · Симферополь",
        rating: "4.9",
        image: "/assets/real-dining-night.jpg",
        text: "Спокойный ресторан с внутренним садом.",
      },
      created_at: "2026-08-05T09:00:00.000Z",
    }] });
    await page.goto("/favorites");
    await waitForStableUi(page);
    await expect(page).toHaveScreenshot("favorites.png");
  });
});
