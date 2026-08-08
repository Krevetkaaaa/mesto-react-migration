const AxeBuilder = require("@axe-core/playwright").default;
const {
  authenticateFixture,
  expect,
  test,
  waitForFullPageStableUi,
  waitForStableUi,
} = require("./support/test-fixtures");
const { PASSWORD_ERROR_MESSAGE } = require("../password-policy-core.js");

const secondVenueId = "30000000-0000-4000-8000-000000000002";
const functionalProject = "chromium";
const interactiveProjects = new Set(["visual-390x844", "visual-1440x900"]);

function functionalOnly(testInfo) {
  test.skip(testInfo.project.name !== functionalProject, "functional scenario runs once");
}

function visualOnly(testInfo) {
  test.skip(testInfo.project.name === functionalProject, "visual projects only");
}

function interactiveOnly(testInfo) {
  test.skip(!interactiveProjects.has(testInfo.project.name), "interactive baselines are frozen at 390px and 1440px");
}

async function openMerchant(page, path = "/merchant/overview") {
  await authenticateFixture(page, "merchant");
  await page.goto(path);
  await expect(page.locator("#merchant-app")).toBeVisible();
}

async function selectView(page, label, path) {
  await page.locator(".sidebar-nav").getByRole("button", { name: new RegExp(label) }).click();
  await expect(page).toHaveURL(new RegExp(`/merchant/${path}$`));
  await expect(page.locator(`[data-view-panel="${path}"]`)).toBeVisible();
}

async function expectNoUnexpectedSeriousAxeViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(({ impact }) => impact === "critical" || impact === "serious");
  // The immutable legacy palette has known contrast debt. Phase 7 must not turn
  // a technical migration into an unapproved visible redesign.
  const unexpected = blocking.filter(({ id }) => id !== "color-contrast");
  expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([]);
}

async function expectCanonicalScreenshot(page, name) {
  await waitForFullPageStableUi(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true, maxDiffPixels: 1_500 });
}

async function expectInteractiveScreenshot(page, name) {
  await waitForStableUi(page);
  await expect(page).toHaveScreenshot(name);
}

test.describe("Phase 7 merchant functional routes", () => {
  test.describe("login action", () => {
    test.use({ expectedHttpErrors: [{ path: "/merchant", status: 401 }] });

    test("redirects the index, signs in, keeps views addressable and logs out", async ({ page }, testInfo) => {
      functionalOnly(testInfo);
      await page.goto("/merchant");
      await expect(page).toHaveURL(/\/merchant\/overview$/);
      await expect(page.locator("#merchant-login")).toBeVisible();

      const login = page.locator("#merchant-login form");
      await login.getByLabel("Логин или e-mail").fill("merchant.owner");
      await login.locator("input[name='password']").fill("wrong-password");
      await login.getByRole("button", { name: /^Войти/ }).click();
      await expect(page.locator("#login-message")).toContainText("Неверный логин или пароль");

      await login.locator("input[name='password']").fill("fixture-password");
      await login.getByRole("button", { name: /^Войти/ }).click();
      await expect(page).toHaveURL(/\/merchant\/overview$/);
      await expect(page.locator("#venue-spotlight-title")).toHaveText("Тихий сад");

      for (const [label, path, title] of [
        ["О заведении", "venue", "О заведении"],
        ["Меню", "menu", "Меню"],
        ["Акции", "promotions", "Акции"],
        ["Отзывы", "reviews", "Отзывы"],
        ["Обзор", "overview", "Добрый день"],
      ]) {
        await selectView(page, label, path);
        await expect(page.locator("#view-title")).toHaveText(title);
      }

      await page.goto("/merchant/menu");
      await expect(page.locator('[data-view-panel="menu"]')).toBeVisible();
      await page.locator("#merchant-logout").click();
      await expect(page).toHaveURL(/\/merchant\/overview$/);
      await expect(page.locator("#merchant-login")).toBeVisible();
      expect((await page.context().cookies()).some((cookie) => cookie.name === "e2e-session" && cookie.value)).toBe(false);
    });
  });

  test("enforces membership navigation gates for analyst and content editor", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ merchantRole: "analyst" });
    await openMerchant(page, "/merchant/reviews");
    await expect(page.locator('[data-view-panel="reviews"]')).toBeVisible();
    await expect(page.locator(".sidebar-nav").getByRole("button", { name: /Отзывы/ })).toBeVisible();
    for (const label of ["О заведении", "Меню", "Акции"]) {
      await expect(page.locator(".sidebar-nav").getByRole("button", { name: new RegExp(label) })).toHaveCount(0);
    }
    await page.goto("/merchant/venue");
    await expect(page.locator('[data-view-panel="overview"]')).toBeVisible();

    await fixtureApi.set({ merchantRole: "content_editor" });
    await page.goto("/merchant/menu");
    await expect(page.locator('[data-view-panel="menu"]')).toBeVisible();
    await expect(page.locator(".sidebar-nav").getByRole("button", { name: /Отзывы/ })).toHaveCount(0);
    await page.goto("/merchant/reviews");
    await expect(page.locator('[data-view-panel="overview"]')).toBeVisible();
  });

  test("persists a multi-venue selection across route loads", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ merchantMultiVenue: true });
    await openMerchant(page);
    const switcher = page.locator("#venue-switcher");
    await expect(switcher.locator("option")).toHaveCount(2);
    await switcher.selectOption(secondVenueId);
    await expect(page.locator("#venue-spotlight-title")).toHaveText("Морской свет");
    await expect(page.locator("#merchant-toast")).toContainText("Выбрано: Морской свет");
    expect(await page.evaluate(() => localStorage.getItem("mesto-merchant-venue"))).toBe(secondVenueId);

    await page.goto("/merchant/venue");
    await expect(switcher).toHaveValue(secondVenueId);
    await expect(page.locator("#venue-editor-name")).toHaveText("Морской свет");
  });

  test("saves a venue only once after a rapid double click", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ merchantMutationDelayMs: 300 });
    await openMerchant(page, "/merchant/venue");
    const form = page.locator("#venue-form");
    await form.locator('[name="title"]').fill("Тихий сад · React");
    const save = form.getByRole("button", { name: /Сохранить изменения/ });
    await save.dblclick();
    await expect(form).toHaveAttribute("inert", "");
    await expect(form).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#merchant-toast")).toContainText("Карточка заведения обновлена");
    await expect(form.locator('[name="title"]')).toHaveValue("Тихий сад · React");
    expect((await fixtureApi.read()).merchantRequestCounters.venueUpdate).toBe(1);
  });

  test("creates, edits and deletes menu items through confirmed server results", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await openMerchant(page, "/merchant/menu");
    await page.getByRole("button", { name: "Добавить позицию" }).click();
    const form = page.locator("#menu-form");
    await form.locator('[name="section"]').fill("Десерты");
    await form.locator('[name="title"]').fill("Медовик");
    await form.locator('[name="description"]').fill("Тонкие коржи и сливочный крем");
    await form.locator('[name="price"]').fill("480");
    await form.getByRole("button", { name: "Сохранить позицию" }).click();
    await expect(page.locator("#menu-list")).toContainText("Медовик");

    await page.getByRole("button", { name: "Редактировать «Медовик»" }).click();
    await form.locator('[name="title"]').fill("Медовик с мёдом");
    await form.getByRole("button", { name: "Сохранить позицию" }).click();
    await expect(page.locator("#menu-list")).toContainText("Медовик с мёдом");

    await page.getByRole("button", { name: "Удалить «Медовик с мёдом»" }).click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    await page.locator("#confirm-accept").click();
    await expect(page.locator("#menu-list")).not.toContainText("Медовик с мёдом");
    expect((await fixtureApi.read()).merchantRequestCounters).toMatchObject({
      menuCreate: 1,
      menuUpdate: 1,
      menuDelete: 1,
    });
  });

  test("creates, edits and deletes promotions with date validation", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await openMerchant(page, "/merchant/promotions");
    await page.getByRole("button", { name: "Новая акция" }).click();
    const form = page.locator("#promotion-form");
    const title = form.locator('[name="title"]');
    const description = form.locator('[name="description"]');
    await title.fill("Ужин в саду");
    await expect(title).toHaveValue("Ужин в саду");
    await description.fill("Сезонное предложение");
    await expect(title).toHaveValue("Ужин в саду");
    await expect(description).toHaveValue("Сезонное предложение");
    await form.locator('[name="startsAt"]').fill("2026-08-10T12:00");
    await form.locator('[name="endsAt"]').fill("2026-08-09T12:00");
    await form.getByRole("button", { name: "Сохранить акцию" }).click();
    await expect(page.locator("#promotion-form-message")).toContainText("Дата завершения");
    await form.locator('[name="endsAt"]').fill("2026-08-31T22:00");
    await form.locator('[name="status"]').selectOption("active");
    await form.getByRole("button", { name: "Сохранить акцию" }).click();
    await expect(page.locator("#promotion-list")).toContainText("Ужин в саду");
    const savedPromotion = (await fixtureApi.read()).merchantPromotions
      .find((item) => item.title === "Ужин в саду");
    expect(savedPromotion).toMatchObject({
      starts_at: "2026-08-10T09:00:00.000Z",
      ends_at: "2026-08-31T19:00:00.000Z",
    });

    await page.getByRole("button", { name: "Редактировать «Ужин в саду»" }).click();
    await form.locator('[name="title"]').fill("Ужин под звёздами");
    await form.getByRole("button", { name: "Сохранить акцию" }).click();
    await expect(page.locator("#promotion-list")).toContainText("Ужин под звёздами");

    await page.getByRole("button", { name: "Удалить «Ужин под звёздами»" }).click();
    await page.locator("#confirm-accept").click();
    await expect(page.locator("#promotion-list")).not.toContainText("Ужин под звёздами");
    expect((await fixtureApi.read()).merchantRequestCounters).toMatchObject({
      promotionCreate: 1,
      promotionUpdate: 1,
      promotionDelete: 1,
    });
  });

  test("completes the non-dismissible forced-password flow", async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ merchantMustChangePassword: true });
    await openMerchant(page);
    const dialog = page.locator("#password-dialog");
    const form = page.locator("#password-form");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-forced", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await form.getByLabel("Новый пароль").fill("short");
    await form.getByLabel("Повторите пароль").fill("short");
    await form.getByRole("button", { name: "Сохранить пароль" }).click();
    expect(await form.getByLabel("Новый пароль").evaluate((input) => input.validity.tooShort)).toBe(true);
    await expect(dialog).toBeVisible();

    await form.getByLabel("Новый пароль").fill("abcdefghij");
    await form.getByLabel("Повторите пароль").fill("abcdefghij");
    await form.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(page.locator("#password-form-message")).toHaveText(PASSWORD_ERROR_MESSAGE);
    await expect(dialog).toBeVisible();

    await form.getByLabel("Новый пароль").fill("NewFixture123");
    await form.getByLabel("Повторите пароль").fill("Different123");
    await form.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(page.locator("#password-form-message")).toContainText("Пароли не совпадают");

    await form.getByLabel("Повторите пароль").fill("NewFixture123");
    await form.getByRole("button", { name: "Сохранить пароль" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("#merchant-toast")).toContainText("Новый пароль сохранён");
    expect((await fixtureApi.read()).scenario.merchantMustChangePassword).toBe(false);
  });

  test("opens, traps and closes the mobile sidebar while navigating", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.setViewportSize({ width: 390, height: 844 });
    await openMerchant(page);
    await page.locator("#mobile-menu").click();
    await expect(page.locator("#merchant-sidebar")).toHaveClass(/is-open/);
    await expect(page.locator("#sidebar-close")).toBeFocused();
    await page.locator(".sidebar-nav").getByRole("button", { name: /Меню/ }).click();
    await expect(page).toHaveURL(/\/merchant\/menu$/);
    await expect(page.locator("#merchant-sidebar")).not.toHaveClass(/is-open/);
    await expect(page.locator("#mobile-menu")).toBeFocused();
  });

  test.describe("dashboard outage", () => {
    test.use({ expectedHttpErrors: [{ path: "/merchant/overview", status: 503 }] });

    test("renders a controlled dashboard outage and recovers through retry", async ({ page, fixtureApi }, testInfo) => {
      functionalOnly(testInfo);
      await fixtureApi.set({ merchantDashboardFailNext: true });
      await authenticateFixture(page, "merchant");
      const response = await page.goto("/merchant/overview");
      expect(response?.status()).toBe(503);
      await expect(page.locator("#merchant-login")).toBeVisible();
      await expect(page.locator("#login-message")).toContainText("временно недоступен");
      await page.getByRole("button", { name: "Попробовать снова" }).click();
      await expect(page.locator("#merchant-app")).toBeVisible();
    });
  });

  test("has no unexpected serious WCAG violations across merchant routes and dialogs", async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto("/merchant/overview");
    await waitForStableUi(page);
    await expectNoUnexpectedSeriousAxeViolations(page);

    await authenticateFixture(page, "merchant");
    for (const path of ["overview", "venue", "menu", "promotions", "reviews"]) {
      await page.goto(`/merchant/${path}`);
      await waitForStableUi(page);
      await expectNoUnexpectedSeriousAxeViolations(page);
    }

    await page.goto("/merchant/menu");
    await page.getByRole("button", { name: "Добавить позицию" }).click();
    await expectNoUnexpectedSeriousAxeViolations(page);
    await page.locator("#menu-form").getByRole("button", { name: "Отмена" }).click();
    await page.getByRole("button", { name: "Удалить «Черноморская рыба»" }).click();
    await expectNoUnexpectedSeriousAxeViolations(page);
  });
});

const canonicalViews = [
  ["merchant overview", "/merchant/overview", "merchant-overview.png"],
  ["merchant venue", "/merchant/venue", "merchant-venue.png"],
  ["merchant menu", "/merchant/menu", "merchant-menu.png"],
  ["merchant promotions", "/merchant/promotions", "merchant-promotions.png"],
  ["merchant reviews", "/merchant/reviews", "merchant-reviews.png"],
];

test.describe("Phase 7 merchant canonical visual freeze", () => {
  test("merchant login", async ({ page }, testInfo) => {
    visualOnly(testInfo);
    await page.goto("/merchant/overview");
    await expect(page.locator("#merchant-login")).toBeVisible();
    await expectCanonicalScreenshot(page, "canonical-merchant-login.png");
  });

  for (const [name, path, screenshot] of canonicalViews) {
    test(name, async ({ page }, testInfo) => {
      visualOnly(testInfo);
      await openMerchant(page, path);
      await expectCanonicalScreenshot(page, screenshot);
    });
  }
});

test.describe("Phase 7 merchant interactive visual freeze", () => {
  test("menu editor", async ({ page }, testInfo) => {
    interactiveOnly(testInfo);
    await openMerchant(page, "/merchant/menu");
    await page.getByRole("button", { name: "Добавить позицию" }).click();
    await expectInteractiveScreenshot(page, "interactive-merchant-menu-dialog.png");
  });

  test("boot loading", async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await openMerchant(page);
    await fixtureApi.set({ merchantDelayMs: 5_000 });
    await page.locator("#refresh-workspace").click();
    await expect(page.locator("#loading-screen")).toBeVisible();
    await expectInteractiveScreenshot(page, "state-merchant-boot-loading.png");
  });

  test("wrong role", async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ merchantSessionMode: "wrong-role" });
    await authenticateFixture(page, "merchant");
    await page.goto("/merchant/overview");
    await expect(page.locator("#login-message")).not.toBeEmpty();
    await expectInteractiveScreenshot(page, "state-merchant-wrong-role.png");
  });

  test("empty workspace", async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ merchantEmptyWorkspace: true });
    await openMerchant(page);
    await expect(page.locator("#workspace-empty")).toBeVisible();
    await expectInteractiveScreenshot(page, "state-merchant-empty-workspace.png");
  });

  test("multi venue selector", async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ merchantMultiVenue: true });
    await openMerchant(page);
    await expect(page.locator("#venue-switcher option")).toHaveCount(2);
    await expectInteractiveScreenshot(page, "state-merchant-multi-venue.png");
  });

  test("forced password", async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ merchantMustChangePassword: true });
    await openMerchant(page);
    await expect(page.locator("#password-dialog")).toBeVisible();
    await expectInteractiveScreenshot(page, "state-merchant-forced-password.png");
  });

  test("promotion editor", async ({ page }, testInfo) => {
    interactiveOnly(testInfo);
    await openMerchant(page, "/merchant/promotions");
    await page.getByRole("button", { name: "Новая акция" }).click();
    await expectInteractiveScreenshot(page, "state-merchant-promotion-dialog.png");
  });

  test("delete confirmation", async ({ page }, testInfo) => {
    interactiveOnly(testInfo);
    await openMerchant(page, "/merchant/menu");
    await page.getByRole("button", { name: "Удалить «Черноморская рыба»" }).click();
    await expectInteractiveScreenshot(page, "state-merchant-delete-confirm.png");
  });

  test("unsaved venue edit", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "visual-1440x900", "unsaved baseline is frozen at desktop width");
    await openMerchant(page, "/merchant/venue");
    await page.locator('#venue-form [name="title"]').fill("Несохранённое название");
    await page.locator('#venue-form [name="description"]').fill("Изменённый текст ещё не отправлен на сервер.");
    await expectInteractiveScreenshot(page, "state-merchant-unsaved.png");
  });

  test("mobile sidebar", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "visual-390x844", "mobile sidebar baseline is frozen at 390px");
    await openMerchant(page);
    await page.locator("#mobile-menu").click();
    await expect(page.locator("#merchant-sidebar")).toHaveClass(/is-open/);
    await expectInteractiveScreenshot(page, "state-merchant-mobile-sidebar.png");
  });
});
