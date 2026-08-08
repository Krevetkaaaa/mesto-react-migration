const { authenticateFixture, expect, test } = require('./support/test-fixtures');
const {
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_REQUIREMENTS_LEAD,
  TEMPORARY_PASSWORD_ERROR_MESSAGE,
  TEMPORARY_PASSWORD_HINT
} = require('../password-policy-core.js');

async function openMerchantWorkspace(page) {
  await authenticateFixture(page, 'merchant');
  await page.goto('/merchant');
  await expect(page.locator('#merchant-app')).toBeVisible();
  await expect(page.locator('#venue-spotlight-title')).toHaveText('Тихий сад');
}

async function openAdminDashboard(page) {
  await authenticateFixture(page, 'admin');
  await page.goto('/admin');
  await expect(page.locator('#admin-shell')).toBeVisible();
  await expect(page.locator('#admin-view-title')).toHaveText('Добрый день');
}

test.describe('legacy role shells', () => {
  test('merchant signs in and reaches the deterministic workspace', async ({ page }) => {
    await page.goto('/merchant');
    await expect(page.locator('#merchant-login')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Войдите в кабинет' })).toBeVisible();

    const form = page.locator('#merchant-login-form');
    await form.getByLabel('Логин или e-mail').fill('merchant.owner');
    await form.locator('input[name="password"]').fill('fixture-password');
    const dashboardRequest = page.waitForResponse((response) => response.url().includes('/api/merchant/dashboard'));
    await form.getByRole('button', { name: 'Войти' }).click();
    await dashboardRequest;

    await expect(page.locator('#merchant-app')).toBeVisible();
    await expect(page.locator('#venue-spotlight-title')).toHaveText('Тихий сад');
    await expect(page.locator('#stat-menu')).toHaveText('1');
    await expect(page.locator('#sidebar-user-name')).toHaveText('Мария Волкова');
  });

  test('administrator signs in and reaches the deterministic dashboard', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('#admin-login')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Управление каталогом' })).toBeVisible();

    const form = page.locator('#admin-login-form');
    await form.getByLabel('Логин').fill('editor');
    await form.getByLabel('Пароль').fill('fixture-password');
    const dashboardRequest = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard'));
    await form.getByRole('button', { name: /Войти в панель/ }).click();
    await dashboardRequest;

    await expect(page.locator('#admin-shell')).toBeVisible();
    await expect(page.locator('#admin-view-title')).toHaveText('Добрый день');
    await expect(page.locator('#stat-venues')).toHaveText('1');
    await expect(page.locator('#overview-submissions')).toContainText('Новый берег');
  });

  test('merchant navigates views and saves venue changes', async ({ page }) => {
    await openMerchantWorkspace(page);
    const venueNav = page.locator('.sidebar-nav [data-merchant-view="venue"]');
    await venueNav.click();
    await expect(page.locator('[data-view-panel="venue"]')).toBeVisible();
    await expect(page.locator('#view-title')).toHaveText('О заведении');

    const form = page.locator('#venue-form');
    await form.locator('[name="title"]').fill('Тихий сад · обновлено');
    const saved = page.waitForResponse((response) => response.url().includes('/api/merchant/venue') && response.request().method() === 'PATCH');
    const reloaded = page.waitForResponse((response) => response.url().includes('/api/merchant/dashboard') && response.request().method() === 'GET');
    await form.getByRole('button', { name: /Сохранить изменения/ }).click();
    await saved;
    await reloaded;

    await expect(form.locator('[name="title"]')).toHaveValue('Тихий сад · обновлено');
    await expect(page.locator('#venue-editor-name')).toHaveText('Тихий сад · обновлено');
    await expect(page.locator('#merchant-toast')).toContainText('Карточка заведения обновлена');

    for (const [view, title] of [['menu', 'Меню'], ['promotions', 'Акции'], ['reviews', 'Отзывы'], ['overview', 'Добрый день']]) {
      await page.locator(`.sidebar-nav [data-merchant-view="${view}"]`).click();
      await expect(page.locator('#view-title')).toHaveText(title);
      await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
    }
  });

  test('merchant creates a menu item and a promotion through dialogs', async ({ page }) => {
    await openMerchantWorkspace(page);

    await page.locator('.sidebar-nav [data-merchant-view="menu"]').click();
    await page.locator('[data-view-panel="menu"] [data-new-menu]').click();
    const menuForm = page.locator('#menu-form');
    await expect(page.locator('#menu-dialog')).toBeVisible();
    await menuForm.locator('[name="section"]').fill('Десерты');
    await menuForm.locator('[name="title"]').fill('Медовик');
    await menuForm.locator('[name="description"]').fill('Тонкие коржи и сливочный крем');
    await menuForm.locator('[name="price"]').fill('480');
    const menuSaved = page.waitForResponse((response) => response.url().includes('/api/merchant/menu') && response.request().method() === 'POST');
    await menuForm.getByRole('button', { name: 'Сохранить позицию' }).click();
    await menuSaved;
    await expect(page.locator('#menu-list')).toContainText('Медовик');
    await expect(page.locator('#menu-summary')).toContainText('2 позиции');

    await page.locator('.sidebar-nav [data-merchant-view="promotions"]').click();
    await page.locator('[data-view-panel="promotions"] [data-new-promotion]').click();
    const promotionForm = page.locator('#promotion-form');
    await expect(page.locator('#promotion-dialog')).toBeVisible();
    await promotionForm.locator('[name="title"]').fill('Ужин в саду');
    await promotionForm.locator('[name="description"]').fill('Сезонное предложение для вечернего меню.');
    await promotionForm.locator('[name="startsAt"]').fill('2026-08-05T12:00');
    await promotionForm.locator('[name="endsAt"]').fill('2026-08-31T22:00');
    await promotionForm.locator('[name="status"]').selectOption('active');
    const promotionSaved = page.waitForResponse((response) => response.url().includes('/api/merchant/promotions') && response.request().method() === 'POST');
    await promotionForm.getByRole('button', { name: 'Сохранить акцию' }).click();
    await promotionSaved;
    await expect(page.locator('#promotion-list')).toContainText('Ужин в саду');
    await expect(page.locator('#stat-promotions')).toHaveText('2');
  });

  test('merchant analyst role exposes reviews but gates write views', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ merchantRole: 'analyst' });
    await openMerchantWorkspace(page);

    await expect(page.locator('.sidebar-nav [data-merchant-view="venue"]')).toBeHidden();
    await expect(page.locator('.sidebar-nav [data-merchant-view="menu"]')).toBeHidden();
    await expect(page.locator('.sidebar-nav [data-merchant-view="promotions"]')).toBeHidden();
    const reviews = page.locator('.sidebar-nav [data-merchant-view="reviews"]');
    await expect(reviews).toBeVisible();
    await reviews.click();
    await expect(page.locator('[data-view-panel="reviews"]')).toBeVisible();
    await expect(page.locator('#reviews-list')).toContainText('Очень спокойное место');
  });

  test('merchant content editor role gates reviews but keeps content tools', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ merchantRole: 'content_editor' });
    await openMerchantWorkspace(page);

    await expect(page.locator('.sidebar-nav [data-merchant-view="venue"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav [data-merchant-view="menu"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav [data-merchant-view="promotions"]')).toBeVisible();
    await expect(page.locator('.sidebar-nav [data-merchant-view="reviews"]')).toBeHidden();
  });

  test('merchant characterizes wrong-role and expired sessions', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ merchantSessionMode: 'wrong-role' });
    await authenticateFixture(page, 'merchant');
    await page.goto('/merchant');
    await expect(page.locator('#merchant-login')).toBeVisible();
    await expect(page.locator('#login-message')).toHaveText('Этот аккаунт не имеет доступа к кабинету ресторатора.');

    await fixtureApi.set({ merchantSessionMode: 'expired' });
    await page.reload();
    await expect(page.locator('#merchant-login')).toBeVisible();
    await expect(page.locator('#login-message')).toBeEmpty();
  });

  test('merchant retains unsaved edits until refresh and deletes a menu item with confirmation', async ({ page }) => {
    await openMerchantWorkspace(page);
    await page.locator('.sidebar-nav [data-merchant-view="venue"]').click();
    const title = page.locator('#venue-form [name="title"]');
    await title.fill('Несохранённое название');
    await page.locator('.sidebar-nav [data-merchant-view="overview"]').click();
    await page.locator('.sidebar-nav [data-merchant-view="venue"]').click();
    await expect(title).toHaveValue('Несохранённое название');

    const refreshed = page.waitForResponse((response) => response.url().includes('/api/merchant/dashboard'));
    await page.locator('#refresh-workspace').click();
    await refreshed;
    await expect(title).toHaveValue('Тихий сад');

    await page.locator('.sidebar-nav [data-merchant-view="menu"]').click();
    await page.getByRole('button', { name: 'Удалить «Черноморская рыба»' }).click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    const deleted = page.waitForResponse((response) => response.url().includes('/api/merchant/menu') && response.request().method() === 'DELETE');
    await page.locator('#confirm-accept').click();
    await deleted;
    await expect(page.locator('#menu-list')).not.toContainText('Черноморская рыба');
  });

  test('merchant persists a multi-venue selection across reload', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ merchantMultiVenue: true });
    await openMerchantWorkspace(page);
    const switcher = page.locator('#venue-switcher');
    await expect(switcher.locator('option')).toHaveCount(2);
    await switcher.selectOption('30000000-0000-4000-8000-000000000002');
    await expect(page.locator('#venue-spotlight-title')).toHaveText('Морской свет');
    await expect(page.locator('#merchant-toast')).toContainText('Выбрано: Морской свет');
    expect(await page.evaluate(() => localStorage.getItem('mesto-merchant-venue'))).toBe('30000000-0000-4000-8000-000000000002');

    const reloaded = page.waitForResponse((response) => response.url().includes('/api/merchant/dashboard'));
    await page.reload();
    await reloaded;
    await expect(switcher).toHaveValue('30000000-0000-4000-8000-000000000002');
    await expect(page.locator('#venue-spotlight-title')).toHaveText('Морской свет');
  });

  test('merchant completes the forced-password flow', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ merchantMustChangePassword: true });
    await openMerchantWorkspace(page);
    const dialog = page.locator('#password-dialog');
    const form = page.locator('#password-form');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-forced', 'true');
    await expect(page.locator('#current-password-field')).toBeHidden();
    await expect(form.locator('[name="currentPassword"]')).toBeDisabled();
    await expect(form.locator('[data-password-requirements]')).toHaveText(PASSWORD_REQUIREMENTS_LEAD);
    await expect(form.locator('[name="password"]')).toHaveAttribute('minlength', String(PASSWORD_MIN_LENGTH));
    await expect(form.locator('[name="password"]')).toHaveAttribute('pattern', PASSWORD_PATTERN);
    await form.locator('[name="password"]').fill('abcdefghij');
    await form.locator('[name="confirmPassword"]').fill('abcdefghij');
    await form.locator('[type="submit"]').click();
    await expect(page.locator('#password-form-message')).toHaveText(PASSWORD_ERROR_MESSAGE);
    expect((await fixtureApi.read()).scenario.merchantMustChangePassword).toBe(true);
    await form.locator('[name="password"]').fill('NewFixture123');
    await form.locator('[name="confirmPassword"]').fill('NewFixture123');
    const saved = page.waitForResponse((response) => response.url().includes('/api/auth/password') && response.request().method() === 'POST');
    await form.locator('[type="submit"]').click();
    expect((await saved).status()).toBe(200);

    await expect(dialog).not.toBeVisible();
    await expect(page.locator('#password-alert')).toBeHidden();
    await expect(page.locator('#merchant-toast')).toContainText('Новый пароль сохранён');
  });

  test('administrator navigates moderation, reviews, venues, and merchants', async ({ page }) => {
    await openAdminDashboard(page);
    for (const [view, title] of [['moderation', 'Модерация'], ['reviews', 'Отзывы'], ['venues', 'Каталог заведений'], ['merchants', 'Рестораторы'], ['overview', 'Добрый день']]) {
      await page.locator(`.admin-sidebar [data-admin-view="${view}"]`).click();
      await expect(page.locator('#admin-view-title')).toHaveText(title);
      await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
    }
  });

  test('administrator moderates a submission and a review', async ({ page }) => {
    await openAdminDashboard(page);

    await page.locator('.admin-sidebar [data-admin-view="moderation"]').click();
    const submissionReload = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard') && response.request().method() === 'GET');
    await page.locator('#moderation-list [data-moderate="approved"]').click();
    await submissionReload;
    await expect(page.locator('#moderation-list')).toContainText('Все заявки обработаны');
    await expect(page.locator('#admin-toast')).toContainText('Заявка одобрена');

    await page.locator('.admin-sidebar [data-admin-view="reviews"]').click();
    const reviewReload = page.waitForResponse((response) => response.url().includes('/api/admin/dashboard') && response.request().method() === 'GET');
    await page.locator('#reviews-list [data-review-decision="approved"]').click();
    await reviewReload;
    await expect(page.locator('#reviews-list')).toContainText('Новых отзывов нет');
    await expect(page.locator('#admin-toast')).toContainText('Отзыв опубликован');
  });

  test('administrator creates a venue through the editor', async ({ page }) => {
    await openAdminDashboard(page);
    await page.locator('.admin-sidebar [data-admin-view="venues"]').click();
    await page.locator('.topbar-actions [data-new-venue]').click();
    const form = page.locator('#venue-editor-form');
    await expect(page.locator('#venue-editor')).toBeVisible();
    await form.locator('[name="title"]').fill('Сосновый берег');
    await form.locator('[name="slug"]').fill('sosnoviy-bereg');
    await form.locator('[name="city"]').selectOption('Ялта');
    await form.locator('[name="category"]').fill('Ресторан');
    await form.locator('[name="description"]').fill('Ресторан с видом на сосны и море.');
    await form.locator('[name="status"]').selectOption('published');
    const saved = page.waitForResponse((response) => response.url().includes('/api/admin/venues') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Сохранить карточку' }).click();
    await saved;
    await expect(page.locator('#venues-table')).toContainText('Сосновый берег');
    await expect(page.locator('#admin-toast')).toContainText('Карточка сохранена');
  });

  test('administrator deletes a venue through the native confirmation event', async ({ page }) => {
    await openAdminDashboard(page);
    await page.locator('.admin-sidebar [data-admin-view="venues"]').click();
    let confirmation = '';
    page.once('dialog', async (dialog) => {
      confirmation = dialog.message();
      await dialog.accept();
    });
    const deleted = page.waitForResponse((response) => response.url().includes('/api/admin/venues') && response.request().method() === 'DELETE');
    await page.locator('#venues-table [data-delete-venue]').click();
    await deleted;
    expect(confirmation).toContain('Удалить «Тихий сад»?');
    await expect(page.locator('#venues-table')).toContainText('Постоянных карточек пока нет');
  });
});

test.describe('legacy admin merchant pattern characterization', () => {
  const invalidPatternMessage = 'Pattern attribute value [A-Za-z0-9._-]{3,48} is not a valid regular expression';
  test.use({ expectedConsolePatterns: [invalidPatternMessage] });

  test('documents the invalid legacy pattern while creating a merchant account', async ({ page }) => {
    await openAdminDashboard(page);
    await page.locator('.admin-sidebar [data-admin-view="merchants"]').click();
    await page.locator('[data-view-panel="merchants"] [data-new-merchant]').click();
    const form = page.locator('#merchant-editor-form');
    const login = form.locator('[name="login"]');
    const password = form.locator('[name="password"]');
    await expect(password).toHaveAttribute('minlength', String(PASSWORD_MIN_LENGTH));
    await expect(password).toHaveAttribute('pattern', PASSWORD_PATTERN);
    await expect(password).toHaveAttribute('title', TEMPORARY_PASSWORD_ERROR_MESSAGE);
    await expect(form.locator('[data-password-hint]')).toHaveText(TEMPORARY_PASSWORD_HINT);
    const patternFailure = await login.evaluate((input) => {
      try {
        new RegExp(input.pattern, 'v');
        return '';
      } catch (error) {
        return error.message;
      }
    });
    expect(patternFailure).toContain('Invalid character in character class');

    await form.locator('[name="name"]').fill('Иван Орлов');
    await login.fill('ivan.owner');
    await form.locator('[name="email"]').fill('ivan@example.test');
    await password.fill('FixturePass123');
    await form.locator('[name="membershipRole"]').selectOption('manager');
    await form.locator('[name="venueIds"]').first().check({ force: true });
    const created = page.waitForResponse((response) => response.url().includes('/api/admin/merchants') && response.request().method() === 'POST');
    await form.getByRole('button', { name: 'Создать аккаунт' }).click();
    await created;

    await expect(page.locator('#merchant-credentials')).toBeVisible();
    await expect(page.locator('#credential-login')).toHaveText('ivan.owner');
    await expect(page.locator('#credential-password')).toHaveText('FixturePass123');
    await page.locator('[data-credentials-close]').click();
    await expect(page.locator('#merchant-credentials')).not.toBeVisible();
    await expect(page.locator('#credential-password')).toHaveText('—');
    await expect(page.locator('#merchants-table')).toContainText('Иван Орлов');
  });
});
