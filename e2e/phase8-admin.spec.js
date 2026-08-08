const AxeBuilder = require('@axe-core/playwright').default;
const {
  authenticateFixture,
  expect,
  test,
  waitForFullPageStableUi,
  waitForStableUi
} = require('./support/test-fixtures');
const { CROSS_HOST_VISUAL_DIFF_PIXELS } = require('./support/visual-freeze');

function functionalOnly(testInfo) {
  test.skip(testInfo.project.name !== 'chromium', 'functional coverage runs once');
}

function visualOnly(testInfo) {
  test.skip(testInfo.project.name === 'chromium', 'visual freeze runs in fixed viewport projects');
}

function interactiveOnly(testInfo) {
  test.skip(!['visual-390x844', 'visual-1440x900'].includes(testInfo.project.name), 'interactive baseline exists at 390px and 1440px');
}

async function openAdmin(page, path = '/admin/overview') {
  await authenticateFixture(page, 'admin');
  await page.goto(path);
  await expect(page.locator('#admin-shell')).toBeVisible();
}

async function goToView(page, label, path) {
  await page.locator('.admin-sidebar nav').getByRole('button', { name: label }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/${path}$`));
  await expect(page.locator(`[data-view-panel="${path}"]`)).toBeVisible();
}

async function expectCanonicalScreenshot(page, name) {
  const dimensions = await waitForFullPageStableUi(page);
  await expect(page).toHaveScreenshot(name, { fullPage: true, maxDiffPixels: CROSS_HOST_VISUAL_DIFF_PIXELS });
  const proof = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true, scale: 'css' });
  expect(proof.readUInt32BE(16)).toBe(dimensions.width);
  expect(proof.readUInt32BE(20)).toBe(dimensions.height);
}

async function expectInteractiveScreenshot(page, name) {
  await waitForStableUi(page);
  await expect(page).toHaveScreenshot(name);
}

async function expectNoUnexpectedSeriousAxeViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations
    .filter((violation) => ['serious', 'critical'].includes(violation.impact))
    // The immutable legacy palette has known contrast debt. Phase 8 must not
    // turn a technical migration into an unapproved visible redesign.
    .filter((violation) => violation.id !== 'color-contrast');
  expect(violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target)
  }))).toEqual([]);
}

test.describe('Phase 8 admin functional parity', () => {
  test.describe('login action', () => {
    test.use({ expectedHttpErrors: [{ path: '/admin.data', status: 401 }] });

    test('redirects the index, rejects invalid credentials, signs in, keeps routes addressable and logs out', async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    const index = await page.goto('/admin');
    expect(index?.status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/overview$/);
    await expect(page.locator('#admin-login')).toBeVisible();

    const form = page.locator('#admin-login form');
    await form.getByLabel('Логин').fill('editor');
    await form.getByLabel('Пароль').fill('wrong-password');
    await form.getByRole('button', { name: /Войти в панель/ }).click();
    await expect(page.locator('#login-error')).toContainText('Неверный логин или пароль');

    await form.getByLabel('Пароль').fill('fixture-password');
    await form.getByRole('button', { name: /Войти в панель/ }).click();
    await expect(page.locator('#admin-shell')).toBeVisible();
    await expect(page.locator('#admin-view-title')).toHaveText('Добрый день');

    for (const [label, path, title] of [
      [/Модерация/, 'submissions', 'Модерация'],
      [/Отзывы/, 'reviews', 'Отзывы'],
      [/Заведения/, 'venues', 'Каталог заведений'],
      [/Рестораторы/, 'merchants', 'Рестораторы'],
      [/Обзор/, 'overview', 'Добрый день']
    ]) {
      await goToView(page, label, path);
      await expect(page.locator('#admin-view-title')).toHaveText(title);
    }

    await page.goto('/admin/reviews');
    await expect(page.locator('[data-view-panel="reviews"]')).toBeVisible();
    await page.locator('.sidebar-logout').click();
    await expect(page).toHaveURL(/\/admin\/overview$/);
    await expect(page.locator('#admin-login')).toBeVisible();
    expect((await page.context().cookies()).some((cookie) => cookie.name === 'e2e-admin' && cookie.value)).toBe(false);
    });
  });

  test('keeps the rest of the dashboard usable when merchants fail', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await fixtureApi.set({ adminMerchantsError: true });
    await openAdmin(page, '/admin/merchants');
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить рестораторов');
    await goToView(page, /Обзор/, 'overview');
    await expect(page.locator('#stat-venues')).toHaveText('1');
    await expect(page.locator('#overview-submissions')).toContainText('Новый берег');
  });

  test('moderates submissions and reviews only after explicit confirmation', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await openAdmin(page, '/admin/submissions');

    await page.locator('#moderation-list').getByRole('button', { name: 'Одобрить' }).click();
    const confirm = page.getByRole('dialog', { name: /Одобрить «Новый берег»/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Отмена' }).click();
    await expect(page.locator('#moderation-list')).toContainText('Новый берег');

    await page.locator('#moderation-list').getByRole('button', { name: 'Одобрить' }).click();
    await confirm.getByRole('button', { name: 'Одобрить' }).click();
    await expect(page.locator('#moderation-list')).toContainText('Все заявки обработаны');

    await goToView(page, /Отзывы/, 'reviews');
    await page.locator('#reviews-list').getByRole('button', { name: 'Отклонить' }).click();
    const reject = page.getByRole('dialog', { name: /Отклонить «Тихий сад»/ });
    await reject.getByLabel('Причина отказа').fill('Не подтверждено посещение');
    await reject.getByRole('button', { name: 'Отклонить' }).click();
    await expect(page.locator('#reviews-list')).toContainText('Новых отзывов нет');

    expect((await fixtureApi.read()).adminRequestCounters).toMatchObject({
      submissionModeration: 1,
      reviewModeration: 1
    });
  });

  test('creates, edits and deletes a venue with destructive confirmation', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await openAdmin(page, '/admin/venues');
    await page.getByRole('button', { name: '+ Новое заведение' }).click();
    const editor = page.locator('#venue-editor');
    await editor.getByLabel('Название').fill('Сосновый берег');
    await editor.getByLabel('Slug').fill('sosnoviy-bereg');
    await editor.getByLabel('Город').selectOption('Ялта');
    await editor.getByLabel('Категория').fill('Ресторан');
    await editor.getByLabel('Описание').fill('Ресторан с видом на сосны и море.');
    await editor.getByRole('button', { name: 'Сохранить карточку' }).click();
    await expect(page.locator('#venues-table')).toContainText('Сосновый берег');

    const row = page.locator('#venues-table tr', { hasText: 'Сосновый берег' });
    await row.getByRole('button', { name: 'Изменить' }).click();
    await editor.getByLabel('Название').fill('Сосновый берег · обновлено');
    await editor.getByRole('button', { name: 'Сохранить карточку' }).click();
    await expect(page.locator('#venues-table')).toContainText('Сосновый берег · обновлено');

    const updatedRow = page.locator('#venues-table tr', { hasText: 'Сосновый берег · обновлено' });
    await updatedRow.getByRole('button', { name: 'Удалить' }).click();
    const confirm = page.getByRole('dialog', { name: /Удалить «Сосновый берег · обновлено»/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Удалить' }).click();
    await expect(page.locator('#venues-table')).not.toContainText('Сосновый берег · обновлено');
    expect((await fixtureApi.read()).adminRequestCounters).toMatchObject({
      venueCreate: 1,
      venueUpdate: 1,
      venueDelete: 1
    });
  });

  test('manages merchant assignments and removes one-time passwords from the DOM', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await openAdmin(page, '/admin/merchants');
    await page.getByRole('button', { name: '+ Добавить ресторатора' }).click();
    const editor = page.locator('#merchant-editor');
    await editor.getByLabel('Имя ресторатора').fill('Иван Орлов');
    await editor.getByLabel('Логин').fill('ivan.owner');
    await editor.getByLabel(/E-mail/).fill('ivan@example.test');
    await editor.getByLabel('Временный пароль').fill('FixturePass123');
    await editor.getByLabel(/Роль в кабинете/).selectOption('manager');
    await editor.locator('input[name="venueIds"]').first().check({ force: true });
    await editor.getByRole('button', { name: 'Создать аккаунт' }).click();

    const credentials = page.locator('#merchant-credentials');
    await expect(credentials).toBeVisible();
    await expect(credentials).toContainText('FixturePass123');
    await credentials.getByRole('button', { name: 'Готово' }).click();
    await expect(credentials).toHaveCount(0);
    expect(await page.locator('body').textContent()).not.toContain('FixturePass123');

    const row = page.locator('#merchants-table tr', { hasText: 'Иван Орлов' });
    await row.getByRole('button', { name: 'Назначения' }).click();
    await editor.getByLabel('Имя ресторатора').fill('Иван Орлов · владелец');
    await editor.getByLabel(/Роль в кабинете/).selectOption('owner');
    await editor.getByRole('button', { name: 'Сохранить доступ' }).click();
    await expect(page.locator('#merchants-table')).toContainText('Иван Орлов · владелец');

    const updatedRow = page.locator('#merchants-table tr', { hasText: 'Иван Орлов · владелец' });
    await updatedRow.getByRole('button', { name: 'Приостановить' }).click();
    await page.getByRole('dialog', { name: /Приостановить доступ/ }).getByRole('button', { name: 'Приостановить' }).click();
    await expect(updatedRow).toContainText('Приостановлен');

    await updatedRow.getByRole('button', { name: 'Новый пароль' }).click();
    await page.getByRole('dialog', { name: /Создать новый пароль/ }).getByRole('button', { name: 'Создать пароль' }).click();
    await expect(credentials).toContainText('ResetPass123');
    await credentials.getByRole('button', { name: 'Готово' }).click();
    await expect(credentials).toHaveCount(0);
    expect(await page.locator('body').textContent()).not.toContain('ResetPass123');

    expect((await fixtureApi.read()).adminRequestCounters).toMatchObject({
      merchantCreate: 1,
      merchantUpdate: 1,
      merchantStatus: 1,
      merchantPasswordReset: 1
    });
  });

  test('uses semantic tables and has no unexpected serious WCAG violations', async ({ page }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');
    await waitForStableUi(page);
    await expectNoUnexpectedSeriousAxeViolations(page);

    await openAdmin(page, '/admin/overview');
    for (const path of ['overview', 'submissions', 'reviews', 'venues', 'merchants']) {
      await page.goto(`/admin/${path}`);
      await waitForStableUi(page);
      await expectNoUnexpectedSeriousAxeViolations(page);
    }

    await page.goto('/admin/venues');
    const venuesTable = page.getByRole('table', { name: 'Заведения Места' });
    await expect(venuesTable.locator('thead th[scope="col"]')).toHaveCount(5);
    await expect(venuesTable.locator('tbody th[scope="row"]')).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/merchants');
    const merchantsTable = page.getByRole('table', { name: 'Рестораторы и назначенные заведения' });
    await expect(merchantsTable).toBeVisible();
    await expect(merchantsTable.locator('tbody tr').first()).toBeVisible();
  });
});

const canonicalViews = [
  ['admin overview', null, 'overview', 'admin-overview.png'],
  ['admin submissions', /Модерация/, 'submissions', 'admin-submissions.png'],
  ['admin reviews', /Отзывы/, 'reviews', 'admin-reviews.png'],
  ['admin venues', /Заведения/, 'venues', 'admin-venues.png'],
  ['admin merchants', /Рестораторы/, 'merchants', 'admin-merchants.png']
];

test.describe('Phase 8 admin canonical visual freeze', () => {
  test('admin login', async ({ page }, testInfo) => {
    visualOnly(testInfo);
    await page.goto('/admin/overview');
    await expect(page.locator('#admin-login')).toBeVisible();
    await expectCanonicalScreenshot(page, 'canonical-admin-login.png');
  });

  for (const [name, label, path, screenshot] of canonicalViews) {
    test(name, async ({ page }, testInfo) => {
      visualOnly(testInfo);
      await openAdmin(page);
      if (label) await goToView(page, label, path);
      await expectCanonicalScreenshot(page, screenshot);
    });
  }
});

test.describe('Phase 8 admin interactive visual freeze', () => {
  test('venue editor', async ({ page }, testInfo) => {
    interactiveOnly(testInfo);
    await openAdmin(page);
    await page.locator('.topbar-actions').getByRole('button', { name: '+ Добавить заведение' }).click();
    await expectInteractiveScreenshot(page, 'interactive-admin-venue-dialog.png');
  });

  test('database setup alert', async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ adminDatabaseConfigured: false });
    await openAdmin(page);
    await expect(page.locator('#setup-alert')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-admin-setup-alert.png');
  });

  test('empty dashboard', async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ adminEmpty: true });
    await openAdmin(page);
    await expect(page.locator('#stat-venues')).toHaveText('0');
    await expectInteractiveScreenshot(page, 'state-admin-empty-dashboard.png');
  });

  test('empty venues', async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ adminEmpty: true });
    await openAdmin(page, '/admin/venues');
    await expect(page.locator('#venues-table')).toContainText('Постоянных карточек пока нет');
    await expectInteractiveScreenshot(page, 'state-admin-empty-venues.png');
  });

  test('merchant editor', async ({ page }, testInfo) => {
    interactiveOnly(testInfo);
    await openAdmin(page);
    await goToView(page, /Рестораторы/, 'merchants');
    await page.getByRole('button', { name: '+ Добавить ресторатора' }).click();
    await expectInteractiveScreenshot(page, 'state-admin-merchant-editor.png');
  });

  test('merchants partial error', async ({ page, fixtureApi }, testInfo) => {
    interactiveOnly(testInfo);
    await fixtureApi.set({ adminMerchantsError: true });
    await openAdmin(page);
    await goToView(page, /Рестораторы/, 'merchants');
    await expect(page.getByRole('alert')).toContainText('Не удалось загрузить рестораторов');
    await expectInteractiveScreenshot(page, 'state-admin-merchants-error.png');
  });

  test('submission approved', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-1440x900', 'approved baseline is frozen at desktop width');
    await openAdmin(page);
    await goToView(page, /Модерация/, 'submissions');
    await page.locator('#moderation-list').getByRole('button', { name: 'Одобрить' }).click();
    await page.getByRole('dialog', { name: /Одобрить «Новый берег»/ }).getByRole('button', { name: 'Одобрить' }).click();
    await expect(page.locator('#moderation-list')).toContainText('Все заявки обработаны');
    await expectInteractiveScreenshot(page, 'state-admin-submission-approved.png');
  });

  test('one-time credentials', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-1440x900', 'credential baseline is frozen at desktop width');
    await openAdmin(page, '/admin/merchants');
    await page.getByRole('button', { name: '+ Добавить ресторатора' }).click();
    const editor = page.locator('#merchant-editor');
    await editor.getByLabel('Имя ресторатора').fill('Иван Орлов');
    await editor.getByLabel('Логин').fill('ivan.owner');
    await editor.getByLabel(/E-mail/).fill('ivan@example.test');
    await editor.getByLabel('Временный пароль').fill('FixturePass123');
    await editor.locator('input[name="venueIds"]').first().check({ force: true });
    await editor.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.locator('#merchant-credentials')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-admin-one-time-credentials.png');
  });

  test('mobile navigation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-390x844', 'mobile navigation baseline is frozen at 390px');
    await openAdmin(page);
    await page.locator('.admin-sidebar nav').getByRole('button', { name: /Отзывы/ }).focus();
    await expectInteractiveScreenshot(page, 'state-admin-mobile-navigation.png');
  });
});
