const {
  authenticateFixture,
  expect,
  openCatalogFromCategory,
  openLoginDialog,
  openRegisterDialog,
  savedFavorite,
  test,
  waitForFullPageStableUi,
  waitForStableUi
} = require('./support/test-fixtures');

async function gotoHome(page) {
  const catalog = page.waitForResponse((response) => response.url().includes('/api/venues'));
  await page.goto('/');
  await catalog;
  await expect(page.getByRole('heading', { level: 1, name: /Лучшие места/ })).toBeVisible();
  await expect(page.locator('[data-category-count="Рестораны"]').first()).toHaveText('2 места');
}

async function gotoMerchant(page) {
  await authenticateFixture(page, 'merchant');
  await page.goto('/merchant');
  await expect(page.locator('#merchant-app')).toBeVisible();
  await expect(page.locator('#venue-spotlight-title')).toHaveText('Тихий сад');
}

async function gotoAdmin(page) {
  await authenticateFixture(page, 'admin');
  await page.goto('/admin');
  await expect(page.locator('#admin-shell')).toBeVisible();
  await expect(page.locator('#admin-view-title')).toHaveText('Добрый день');
}

async function selectMerchantView(page, view) {
  const button = page.locator(`.sidebar-nav [data-merchant-view="${view}"]`);
  if ((page.viewportSize()?.width || 0) <= 900) {
    await page.locator('#mobile-menu').click();
    await expect(page.locator('#merchant-sidebar')).toHaveClass(/is-open/);
    await page.waitForTimeout(300);
  }
  await button.click();
  await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
}

async function selectAdminView(page, view) {
  await page.locator(`.admin-sidebar [data-admin-view="${view}"]`).click();
  await expect(page.locator(`[data-view-panel="${view}"]`)).toBeVisible();
}

async function expectCanonicalScreenshot(page, name) {
  const dimensions = await waitForFullPageStableUi(page);
  if (await page.locator('body.is-home-view').count()) {
    for (const selector of [
      '.hero-content h1',
      '.category-card:first-child',
      '#popular .venue-card:first-child',
      '.app-promo-copy',
      '.how-grid article:first-child',
      '.collection-card:first-child',
      '.city-card:first-child'
    ]) {
      await expect(page.locator(selector), `${selector} must be revealed before full-page capture`).toHaveCSS('opacity', '1');
    }
  }
  let screenshot;
  const hasStickyApplicationShell = await page.locator('#merchant-app:not([hidden]), #admin-shell:not([hidden])').count();
  if (hasStickyApplicationShell) {
    await expect(page).toHaveScreenshot(name, { fullPage: true, maxDiffPixels: 1_500 });
    const dimensionProof = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true, scale: 'css' });
    expect(dimensionProof.readUInt32BE(16), 'canonical PNG width must equal the document viewport').toBe(dimensions.width);
    expect(dimensionProof.readUInt32BE(20), 'canonical PNG height must equal the full document height').toBe(dimensions.height);
    return;
  } else {
    // Chrome includes the transformed, visually clipped hero in body.scrollWidth,
    // which makes Playwright's fullPage canvas wider than the document viewport.
    // CDP captures the complete stable document height at the actual viewport width.
    const session = await page.context().newCDPSession(page);
    try {
      const result = await session.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: dimensions.width, height: dimensions.height, scale: 1 }
      });
      screenshot = Buffer.from(result.data, 'base64');
    } finally {
      await session.detach();
    }
  }

  const pngWidth = screenshot.readUInt32BE(16);
  const pngHeight = screenshot.readUInt32BE(20);
  expect(pngWidth, 'canonical PNG width must equal the document viewport').toBe(dimensions.width);
  expect(pngHeight, 'canonical PNG height must equal the full document height').toBe(dimensions.height);
  if (dimensions.height > (page.viewportSize()?.height || 0)) {
    expect(pngHeight, 'scrolling canonical pages must extend beyond one viewport').toBeGreaterThan(page.viewportSize().height);
  }
  await expect(screenshot).toMatchSnapshot(name, { maxDiffPixels: 1_500 });
}

async function expectInteractiveScreenshot(page, name) {
  await waitForStableUi(page);
  await expect(page).toHaveScreenshot(name);
}

function skipUnlessInteractiveViewport(page) {
  const width = page.viewportSize()?.width || 0;
  test.skip(![390, 1440].includes(width), 'interactive baselines are fixed at 390px and 1440px');
}

test.describe('legacy canonical full-page visual freeze', () => {
  test('public home', async ({ page }) => {
    await gotoHome(page);
    await expectCanonicalScreenshot(page, 'public-home.png');
  });

  test('public categories', async ({ page }) => {
    await gotoHome(page);
    await page.locator('.categories-section [data-open-categories]').click();
    await expect(page.locator('#categories-view')).toBeVisible();
    await expectCanonicalScreenshot(page, 'public-categories.png');
  });

  test('public catalog populated', async ({ page }) => {
    test.skip(true, 'The catalog visual baseline moved to the React-owned Phase 5 suite.');
    await gotoHome(page);
    await openCatalogFromCategory(page);
    await expect(page.locator('#catalog-grid .venue-card')).not.toHaveCount(0);
    await expectCanonicalScreenshot(page, 'public-catalog-populated.png');
  });

  test('public catalog empty', async ({ page }) => {
    test.skip(true, 'The catalog visual baseline moved to the React-owned Phase 5 suite.');
    await gotoHome(page);
    await openCatalogFromCategory(page);
    const cityRequest = page.waitForResponse((response) => response.url().includes('/api/venues'));
    await page.locator('#catalog-city').selectOption('Керчь');
    await cityRequest;
    const categoryRequest = page.waitForResponse((response) => response.url().includes('/api/venues'));
    await page.locator('#catalog-category').selectOption('Суши-бары');
    await categoryRequest;
    await expect(page.locator('#catalog-grid .catalog-empty')).toBeVisible();
    await expectCanonicalScreenshot(page, 'public-catalog-empty.png');
  });

  test('public profile', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ favorites: [savedFavorite] });
    await authenticateFixture(page, 'customer');
    await page.goto('/?open=profile');
    await expect(page.locator('#profile-view')).toBeVisible();
    await expect(page.locator('#profile-saved-list')).toContainText('Баркас');
    await expectCanonicalScreenshot(page, 'public-profile.png');
  });

  test('public help', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1, name: /Всё важное/ })).toBeVisible();
    await expectCanonicalScreenshot(page, 'public-help.png');
  });

  test('merchant login', async ({ page }) => {
    await page.goto('/merchant');
    await expect(page.locator('#merchant-login')).toBeVisible();
    await expectCanonicalScreenshot(page, 'canonical-merchant-login.png');
  });

  test('merchant overview', async ({ page }) => {
    await gotoMerchant(page);
    await expectCanonicalScreenshot(page, 'merchant-overview.png');
  });

  test('merchant venue', async ({ page }) => {
    await gotoMerchant(page);
    await selectMerchantView(page, 'venue');
    await expectCanonicalScreenshot(page, 'merchant-venue.png');
  });

  test('merchant menu', async ({ page }) => {
    await gotoMerchant(page);
    await selectMerchantView(page, 'menu');
    await expectCanonicalScreenshot(page, 'merchant-menu.png');
  });

  test('merchant promotions', async ({ page }) => {
    await gotoMerchant(page);
    await selectMerchantView(page, 'promotions');
    await expectCanonicalScreenshot(page, 'merchant-promotions.png');
  });

  test('merchant reviews', async ({ page }) => {
    await gotoMerchant(page);
    await selectMerchantView(page, 'reviews');
    await expectCanonicalScreenshot(page, 'merchant-reviews.png');
  });

  test('admin login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('#admin-login')).toBeVisible();
    await expectCanonicalScreenshot(page, 'canonical-admin-login.png');
  });

  test('admin overview', async ({ page }) => {
    await gotoAdmin(page);
    await expectCanonicalScreenshot(page, 'admin-overview.png');
  });

  test('admin submissions', async ({ page }) => {
    await gotoAdmin(page);
    await selectAdminView(page, 'moderation');
    await expectCanonicalScreenshot(page, 'admin-submissions.png');
  });

  test('admin reviews', async ({ page }) => {
    await gotoAdmin(page);
    await selectAdminView(page, 'reviews');
    await expectCanonicalScreenshot(page, 'admin-reviews.png');
  });

  test('admin venues', async ({ page }) => {
    await gotoAdmin(page);
    await selectAdminView(page, 'venues');
    await expectCanonicalScreenshot(page, 'admin-venues.png');
  });

  test('admin merchants', async ({ page }) => {
    await gotoAdmin(page);
    await selectAdminView(page, 'merchants');
    await expect(page.locator('#merchants-table')).toContainText('Мария Волкова');
    await expectCanonicalScreenshot(page, 'admin-merchants.png');
  });
});

test.describe('legacy interactive visual freeze', () => {
  test('venue dialog', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoHome(page);
    await page.locator('#popular [data-venue="marea"]').click();
    await expect(page.locator('#venue-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'interactive-venue-dialog.png');
  });

  test('login dialog', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoHome(page);
    await openLoginDialog(page);
    await expectInteractiveScreenshot(page, 'interactive-auth-login.png');
  });

  test('registration dialog', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoHome(page);
    await openRegisterDialog(page);
    await expectInteractiveScreenshot(page, 'interactive-auth-register.png');
  });

  test('catalog select menu', async ({ page }) => {
    test.skip(true, 'The catalog interaction baseline moved to the React-owned Phase 5 suite.');
    skipUnlessInteractiveViewport(page);
    await gotoHome(page);
    await openCatalogFromCategory(page);
    await page.locator('.pretty-select:has(#catalog-city) .pretty-select-button').click();
    await expect(page.locator('.pretty-select:has(#catalog-city)')).toHaveClass(/is-open/);
    await expectInteractiveScreenshot(page, 'interactive-catalog-select.png');
  });

  test('merchant menu editor', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoMerchant(page);
    await selectMerchantView(page, 'menu');
    await page.locator('[data-view-panel="menu"] [data-new-menu]').click();
    await expect(page.locator('#menu-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'interactive-merchant-menu-dialog.png');
  });

  test('admin venue editor', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoAdmin(page);
    await page.locator('.topbar-actions [data-new-venue]').click();
    await expect(page.locator('#venue-editor')).toBeVisible();
    await expectInteractiveScreenshot(page, 'interactive-admin-venue-dialog.png');
  });

  test('mobile navigation menu', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile menu baseline is fixed at 390px');
    await gotoHome(page);
    await page.locator('.mobile-menu-toggle').click();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expectInteractiveScreenshot(page, 'interactive-mobile-menu.png');
  });
});

test.describe('legacy public state visual characterization', () => {
  test('catalog loading', async ({ page, fixtureApi }) => {
    test.skip(true, 'The catalog loading baseline moved to the React-owned Phase 5 suite.');
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ catalogDelayMs: 5_000 });
    await page.goto('/');
    await page.locator('.category-card[data-filter-category="Рестораны"]').click();
    await expect(page.locator('#catalog-view')).toHaveClass(/is-catalog-loading/);
    await expect(page.locator('#catalog-venues-status')).toHaveText('Обновляем каталог…');
    await expectInteractiveScreenshot(page, 'state-public-catalog-loading.png');
  });

  test('review dialog', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await authenticateFixture(page, 'customer');
    await gotoHome(page);
    await page.locator('#popular [data-venue="marea"]').click();
    await page.locator('#venue-dialog [data-open-review]').click();
    await expect(page.locator('#review-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-public-review-dialog.png');
  });

  test('submission dialog', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await authenticateFixture(page, 'customer');
    await page.goto('/?open=profile');
    await expect(page.locator('#profile-view')).toBeVisible();
    await page.locator('#profile-view [data-open-submission]').click();
    await expect(page.locator('#submission-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-public-submission-dialog.png');
  });

  test('favorites dialog', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ favorites: [savedFavorite] });
    await authenticateFixture(page, 'customer');
    await gotoHome(page);
    if (await page.locator('.favorites-button').isVisible()) {
      await page.locator('.favorites-button').click();
    } else {
      await page.locator('.mobile-menu-toggle').click();
      await page.locator('.mobile-nav [data-open-favorites]').click();
    }
    await expect(page.locator('#favorites-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-public-favorites-dialog.png');
  });

  test('keyboard focus', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoHome(page);
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-public-keyboard-focus.png');
  });
});

test.describe('legacy merchant state visual characterization', () => {
  test('boot loading', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ merchantDelayMs: 5_000 });
    await authenticateFixture(page, 'merchant');
    await page.goto('/merchant');
    await expect(page.locator('#loading-screen')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-merchant-boot-loading.png');
  });

  test('wrong role', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ merchantSessionMode: 'wrong-role' });
    await authenticateFixture(page, 'merchant');
    await page.goto('/merchant');
    await expect(page.locator('#login-message')).toHaveText('Этот аккаунт не имеет доступа к кабинету ресторатора.');
    await expectInteractiveScreenshot(page, 'state-merchant-wrong-role.png');
  });

  test('empty workspace', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ merchantEmptyWorkspace: true });
    await authenticateFixture(page, 'merchant');
    await page.goto('/merchant');
    await expect(page.locator('#merchant-app')).toBeVisible();
    await expect(page.locator('#workspace-empty')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-merchant-empty-workspace.png');
  });

  test('multi venue selector', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ merchantMultiVenue: true });
    await gotoMerchant(page);
    await expect(page.locator('#venue-switcher option')).toHaveCount(2);
    await expectInteractiveScreenshot(page, 'state-merchant-multi-venue.png');
  });

  test('forced password dialog', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ merchantMustChangePassword: true });
    await gotoMerchant(page);
    await expect(page.locator('#password-dialog')).toBeVisible();
    await expect(page.locator('#password-dialog')).toHaveAttribute('data-forced', 'true');
    await expectInteractiveScreenshot(page, 'state-merchant-forced-password.png');
  });

  test('promotion editor', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoMerchant(page);
    await selectMerchantView(page, 'promotions');
    await page.locator('[data-view-panel="promotions"] [data-new-promotion]').click();
    await expect(page.locator('#promotion-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-merchant-promotion-dialog.png');
  });

  test('delete confirmation', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoMerchant(page);
    await selectMerchantView(page, 'menu');
    await page.getByRole('button', { name: 'Удалить «Черноморская рыба»' }).click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-merchant-delete-confirm.png');
  });

  test('unsaved venue edit', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, 'unsaved form baseline is fixed at desktop width');
    await gotoMerchant(page);
    await selectMerchantView(page, 'venue');
    await page.locator('#venue-form [name="title"]').fill('Несохранённое название');
    await page.locator('#venue-form [name="description"]').fill('Изменённый текст ещё не отправлен на сервер.');
    await expectInteractiveScreenshot(page, 'state-merchant-unsaved.png');
  });

  test('mobile sidebar', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, 'mobile sidebar baseline is fixed at 390px');
    await gotoMerchant(page);
    await page.locator('#mobile-menu').click();
    await page.waitForTimeout(300);
    await expect(page.locator('#merchant-sidebar')).toHaveClass(/is-open/);
    await expectInteractiveScreenshot(page, 'state-merchant-mobile-sidebar.png');
  });
});

test.describe('legacy admin state visual characterization', () => {
  test('database setup alert', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ adminDatabaseConfigured: false });
    await gotoAdmin(page);
    await expect(page.locator('#setup-alert')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-admin-setup-alert.png');
  });

  test('empty dashboard', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ adminEmpty: true });
    await gotoAdmin(page);
    await expect(page.locator('#stat-venues')).toHaveText('0');
    await expectInteractiveScreenshot(page, 'state-admin-empty-dashboard.png');
  });

  test('empty venues table', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ adminEmpty: true });
    await gotoAdmin(page);
    await selectAdminView(page, 'venues');
    await expect(page.locator('#venues-table')).toContainText('Постоянных карточек пока нет');
    await expectInteractiveScreenshot(page, 'state-admin-empty-venues.png');
  });

  test('merchants table loading', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ adminMerchantsDelayMs: 5_000 });
    await authenticateFixture(page, 'admin');
    await page.goto('/admin');
    await expect(page.locator('#admin-shell')).toBeVisible();
    await page.locator('.admin-sidebar [data-admin-view="merchants"]').click();
    await expect(page.locator('#merchants-table')).toContainText('Загружаем аккаунты');
    await expectInteractiveScreenshot(page, 'state-admin-merchants-loading.png');
  });

  test('submission decision state', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, 'decision-event baseline is fixed at desktop width');
    await gotoAdmin(page);
    await selectAdminView(page, 'moderation');
    await page.locator('#moderation-list [data-moderate="approved"]').click();
    await expect(page.locator('#moderation-list')).toContainText('Все заявки обработаны');
    await expect(page.locator('#admin-toast')).toContainText('Заявка одобрена');
    await expectInteractiveScreenshot(page, 'state-admin-submission-approved.png');
  });

  test('merchant editor', async ({ page }) => {
    skipUnlessInteractiveViewport(page);
    await gotoAdmin(page);
    await selectAdminView(page, 'merchants');
    await page.locator('[data-view-panel="merchants"] [data-new-merchant]').click();
    await expect(page.locator('#merchant-editor')).toBeVisible();
    await expectInteractiveScreenshot(page, 'state-admin-merchant-editor.png');
  });

  test('mobile navigation', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 390, 'admin mobile navigation baseline is fixed at 390px');
    await gotoAdmin(page);
    await page.locator('.admin-sidebar [data-admin-view="reviews"]').focus();
    await expectInteractiveScreenshot(page, 'state-admin-mobile-navigation.png');
  });
});

test.describe('legacy admin partial-error visual characterization', () => {
  test.use({ expectedHttpErrors: [{ path: '/api/admin/merchants', status: 503 }] });

  test('merchants partial error', async ({ page, fixtureApi }) => {
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ adminMerchantsError: true });
    await gotoAdmin(page);
    await selectAdminView(page, 'merchants');
    await expect(page.locator('#merchants-table')).toContainText('Не удалось загрузить рестораторов');
    await expectInteractiveScreenshot(page, 'state-admin-merchants-error.png');
  });
});

test.describe('legacy one-time credentials visual characterization', () => {
  test.use({ expectedConsolePatterns: ['Pattern attribute value [A-Za-z0-9._-]{3,48} is not a valid regular expression'] });

  test('one-time credentials visible', async ({ page }) => {
    test.skip((page.viewportSize()?.width || 0) !== 1440, 'one-time secret baseline is fixed at desktop width');
    await gotoAdmin(page);
    await selectAdminView(page, 'merchants');
    await page.locator('[data-view-panel="merchants"] [data-new-merchant]').click();
    const form = page.locator('#merchant-editor-form');
    await form.locator('[name="name"]').fill('Иван Орлов');
    await form.locator('[name="login"]').fill('ivan.owner');
    await form.locator('[name="email"]').fill('ivan@example.test');
    await form.locator('[name="password"]').fill('FixturePass123');
    await form.locator('[name="venueIds"]').first().check({ force: true });
    await form.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.locator('#merchant-credentials')).toBeVisible();
    await expect(page.locator('#credential-password')).toHaveText('FixturePass123');
    await expectInteractiveScreenshot(page, 'state-admin-one-time-credentials.png');
  });
});

test.describe('legacy graphite theme visual characterization', () => {
  test.use({ colorTheme: 'graphite' });

  for (const [name, path] of [['home', '/'], ['help', '/help']]) {
    test(`graphite ${name}`, async ({ page }) => {
      test.skip((page.viewportSize()?.width || 0) !== 1440, 'alternate theme baselines are fixed at desktop width');
      if (path === '/') await gotoHome(page); else await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'graphite');
      await expectCanonicalScreenshot(page, `theme-graphite-${name}.png`);
    });
  }
});

test.describe('legacy midnight theme visual characterization', () => {
  test.use({ colorTheme: 'midnight' });

  for (const [name, path] of [['home', '/'], ['help', '/help']]) {
    test(`midnight ${name}`, async ({ page }) => {
      test.skip((page.viewportSize()?.width || 0) !== 1440, 'alternate theme baselines are fixed at desktop width');
      if (path === '/') await gotoHome(page); else await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
      await expectCanonicalScreenshot(page, `theme-midnight-${name}.png`);
    });
  }
});

test.describe('legacy catalog error visual characterization', () => {
  test.use({ expectedHttpErrors: [{ path: '/api/venues', status: 503 }] });

  test('catalog error fallback', async ({ page, fixtureApi }) => {
    test.skip(true, 'The catalog error baseline moved to the React-owned Phase 5 suite.');
    skipUnlessInteractiveViewport(page);
    await fixtureApi.set({ catalogError: true });
    await page.goto('/');
    await page.locator('.category-card[data-filter-category="Рестораны"]').click();
    await expect(page.locator('#catalog-venues-status')).toHaveText('Показана подборка редакции');
    await expect(page.locator('.toast')).toContainText('Каталог временно недоступен');
    await expectInteractiveScreenshot(page, 'interactive-catalog-error.png');
  });
});
