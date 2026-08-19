const {
  authenticateFixture,
  expect,
  openCatalogFromCategory,
  openLoginDialog,
  openRegisterDialog,
  savedFavorite,
  test
} = require('./support/test-fixtures');
const { PASSWORD_ERROR_MESSAGE, PASSWORD_PATTERN } = require('../password-policy-core.js');

function isVenuesRequest(response) {
  return response.url().includes('/api/venues') && response.request().method() === 'GET';
}

test.describe('legacy public experience', () => {
  test('loads the home page, opens the catalog, filters results, and opens a venue card', async ({ page }) => {
    test.skip(true, 'The catalog is React-owned since Phase 5; its replacement contract runs in phase5-public.spec.js.');
    const initialCatalog = page.waitForResponse(isVenuesRequest);
    await page.goto('/');
    await initialCatalog;

    await expect(page.getByRole('heading', { level: 1, name: /Лучшие места/ })).toBeVisible();
    await expect(page.locator('#popular .venue-card[data-venue="marea"]')).toBeVisible();

    await openCatalogFromCategory(page);

    await expect(page.locator('#catalog-title')).toHaveText('Рестораны');
    await expect(page.locator('#catalog-grid .venue-card')).not.toHaveCount(0);

    const venue = page.locator('#catalog-grid [data-venue="marea"]');
    await expect(venue).toBeVisible();
    await venue.click();
    await expect(page.locator('#venue-dialog')).toBeVisible();
    await expect(page.locator('#venue-dialog-title')).toHaveText('Баркас');
    await expect(page.locator('#venue-dialog .dialog-description')).toContainText('черноморской кухни');
    await page.locator('#venue-dialog .dialog-close').click();

    await page.locator('label.filter-toggle').filter({ has: page.locator('#catalog-pet') }).click();
    await expect(page.locator('#catalog-pet')).toBeChecked();
    const visibleCards = page.locator('#catalog-grid .venue-card');
    await expect(visibleCards).not.toHaveCount(0);
    expect(await visibleCards.evaluateAll((cards) => cards.every((card) => card.dataset.pet === '1'))).toBe(true);
  });

  test('shows an empty catalog state after real select interactions', async ({ page }) => {
    test.skip(true, 'The catalog is React-owned since Phase 5; its replacement contract runs in phase5-public.spec.js.');
    await page.goto('/');
    await openCatalogFromCategory(page);

    const cityRequest = page.waitForResponse(isVenuesRequest);
    await page.locator('#catalog-city').selectOption('Керчь');
    await cityRequest;
    const categoryRequest = page.waitForResponse(isVenuesRequest);
    await page.locator('#catalog-category').selectOption('Суши-бары');
    await categoryRequest;

    await expect(page.locator('#catalog-grid .catalog-empty')).toHaveText(/По этим параметрам пока нет заведений/);
    await expect(page.locator('#catalog-count')).toHaveText('0 мест');
  });

  test('logs in through the public auth dialog and restores the fixture session', async ({ page }) => {
    await page.goto('/');
    await openLoginDialog(page);

    const form = page.locator('#auth-form');
    await form.getByLabel('Почта или логин').fill('anna@example.test');
    await form.getByLabel('Пароль').fill('fixture-password');
    await form.getByRole('button', { name: /^Войти/ }).click();

    await expect(page.locator('#auth-dialog')).not.toBeVisible();
    await expect(page.locator('.login-trigger')).toHaveText('АП');
    await expect(page.locator('.toast')).toContainText('Вход выполнен');
  });

  test('switches to registration and fills the registration UI', async ({ page }) => {
    await page.goto('/');
    await openRegisterDialog(page);

    const form = page.locator('#register-form');
    await form.getByLabel('Имя').fill('Елена Смирнова');
    await form.getByLabel('Логин').fill('elena.s');
    await form.getByLabel('Почта').fill('elena@example.test');
    await form.getByLabel('Пароль').fill('StrongPass123');
    await expect(form.getByLabel('Имя')).toHaveValue('Елена Смирнова');
    await expect(form.getByRole('button', { name: /^Создать аккаунт/ })).toBeEnabled();
  });

  test('navigates through the help page contents', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { level: 1, name: /Всё важное/ })).toBeVisible();
    await page.getByRole('link', { name: /Открыть FAQ/ }).click();
    await expect(page).toHaveURL(/\/help#faq$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Вопросы и ответы' })).toBeVisible();
  });

  test('restores an authenticated profile and logs out through the UI', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ favorites: [savedFavorite] });
    await authenticateFixture(page, 'customer');
    await page.goto('/?open=profile');

    await expect(page.locator('#profile-view')).toBeVisible();
    await expect(page.locator('[data-profile-name]').first()).toHaveText('Анна Петрова');
    await expect(page.locator('#profile-saved-list')).toContainText('Баркас');
    await page.locator('#profile-view [data-logout]').click();

    await expect(page.locator('#profile-view')).not.toBeVisible();
    await expect(page.locator('.login-trigger')).toHaveText('Войти');
    await expect(page.locator('.toast')).toContainText('вышли из аккаунта');
  });

  test('guides a guest from favorite intent to registration', async ({ page }) => {
    await page.goto('/');
    const favorite = page.locator('#popular [data-venue="marea"] .fav');
    await favorite.click();
    await expect(page.locator('.toast')).toContainText('Авторизируйтесь или зарегистрируйтесь');
    await favorite.click();
    await expect(page.locator('#register-dialog')).toBeVisible();
  });

  test('persists an authenticated favorite through the fixture API', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');
    await page.goto('/');
    await expect(page.locator('.login-trigger')).toHaveText('АП');

    const favorite = page.locator('#popular [data-venue="marea"] .fav');
    await favorite.click();
    await expect(favorite).toHaveClass(/is-saved/);
    await expect(page.locator('.toast')).toContainText('Добавлено в избранное');
    await expect(page.locator('.favorites-count')).toHaveText('1');
    expect((await fixtureApi.read()).favorites).toBe(1);
  });

  test('loads the next deterministic catalog page', async ({ page, fixtureApi }) => {
    test.skip(true, 'The catalog is React-owned since Phase 5; pagination is covered by phase5-public.spec.js.');
    await fixtureApi.set({ catalogPageSize: 1 });
    await page.goto('/');
    await openCatalogFromCategory(page);

    await expect(page.locator('#catalog-grid .catalog-venue-card')).toHaveCount(1);
    await expect(page.locator('#catalog-load-more')).toBeVisible();
    const nextPage = page.waitForResponse((response) => response.url().includes('/api/venues') && response.url().includes('skip=1'));
    await page.locator('#catalog-load-more').click();
    await nextPage;
    await expect(page.locator('#catalog-grid .catalog-venue-card')).toHaveCount(2);
    await expect(page.locator('#catalog-load-more')).toBeHidden();
  });
  test('completes the OAuth return seam without contacting an external provider', async ({ page, fixtureApi }) => {
    const oauthSession = page.waitForResponse((response) => response.url().includes('/api/auth/oauth-session') && response.request().method() === 'POST');
    await page.goto('/#access_token=fixture-oauth-token');
    await oauthSession;

    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.locator('.login-trigger')).toHaveText('АП');
    await expect(page.locator('.toast')).toContainText('Вход через Google выполнен');
    expect((await fixtureApi.read()).oauthSessions).toBe(1);
  });

  test('cleans an OAuth error return and keeps the visitor signed out', async ({ page, fixtureApi }) => {
    await page.goto('/#error_description=fixture-cancelled');

    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expect(page.locator('.login-trigger')).toHaveText('Войти');
    await expect(page.locator('.toast')).toContainText('Вход через Google отменён или не был завершён');
    expect((await fixtureApi.read()).oauthSessions).toBe(0);
  });

  test('submits an authenticated review for moderation', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');
    await page.goto('/');
    await page.locator('#popular [data-venue="marea"]').click();
    await page.locator('#venue-dialog [data-open-review]').click();

    const form = page.locator('#review-form');
    await expect(page.locator('#review-dialog')).toBeVisible();
    await expect(form.locator('[name="authorName"]')).toHaveValue('Анна Петрова');
    await form.locator('[name="rating"]').selectOption('4');
    await form.locator('[name="review"]').fill('Прекрасная атмосфера, внимательный сервис и хорошее меню.');
    await form.locator('[name="consent"]').check();
    const submitted = page.waitForResponse((response) => response.url().includes('/api/reviews') && response.request().method() === 'POST');
    await form.getByRole('button', { name: /Отправить отзыв/ }).click();
    expect((await submitted).status()).toBe(201);

    await expect(page.locator('#review-dialog')).not.toBeVisible();
    await expect(page.locator('.toast')).toContainText('Отзыв отправлен на модерацию');
    expect((await fixtureApi.read()).reviews).toBe(2);
  });

  test('uploads a photo and submits a venue for moderation', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');
    await page.goto('/?open=submission');
    const form = page.locator('#submission-form');
    await expect(page.locator('#submission-dialog')).toBeVisible();
    await form.locator('[name="title"]').fill('Терраса у моря');
    await form.locator('[name="city"]').selectOption('Ялта');
    await form.locator('[name="category"]').selectOption('Рестораны');
    await form.locator('[name="description"]').fill('Небольшая терраса с видом на воду и сезонным меню.');
    await form.locator('[name="photos"]').setInputFiles({
      name: 'terrace.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    });
    await form.locator('[name="consent"]').check();
    const uploaded = page.waitForResponse((response) => response.url().includes('/api/uploads') && response.request().method() === 'POST');
    const submitted = page.waitForResponse((response) => response.url().includes('/api/submissions') && response.request().method() === 'POST');
    await form.getByRole('button', { name: /Отправить на модерацию/ }).click();
    expect((await uploaded).status()).toBe(201);
    expect((await submitted).status()).toBe(201);

    await expect(page.locator('#submission-dialog')).not.toBeVisible();
    await expect(page.locator('.toast')).toContainText('Заявка отправлена на модерацию');
    const state = await fixtureApi.read();
    expect(state.uploads).toBe(1);
    expect(state.submissions).toBe(2);
  });

  test('rejects an oversized venue photo in the UI before upload', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');
    await page.goto('/?open=submission');
    const form = page.locator('#submission-form');
    await expect(page.locator('#submission-dialog')).toBeVisible();
    await form.locator('[name="title"]').fill('Большая фотография');
    await form.locator('[name="city"]').selectOption('Ялта');
    await form.locator('[name="category"]').selectOption('Рестораны');
    await form.locator('[name="description"]').fill('Проверка ограничения размера фотографии до отправки на сервер.');
    await form.locator('[name="photos"]').setInputFiles({
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(6 * 1024 * 1024 + 1)
    });
    await form.locator('[name="consent"]').check();
    let uploadRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/uploads') uploadRequests += 1;
    });
    await form.getByRole('button', { name: /Отправить на модерацию/ }).click();

    await expect(page.locator('.toast')).toContainText('файл больше 6 МБ');
    await expect(page.locator('#submission-dialog')).toBeVisible();
    expect(uploadRequests).toBe(0);
    const state = await fixtureApi.read();
    expect(state.uploads).toBe(0);
    expect(state.submissions).toBe(1);
  });
});

test.describe('legacy public registration pattern characterization', () => {
  const invalidPatternMessage = 'Pattern attribute value [A-Za-z0-9._-]{3,48} is not a valid regular expression';
  test.use({ expectedConsolePatterns: [invalidPatternMessage] });

  test('blocks weak passwords before submitting registration', async ({ page, fixtureApi }) => {
    await page.goto('/');
    await openRegisterDialog(page);
    const form = page.locator('#register-form');
    const login = form.locator('[name="username"]');
    const patternFailure = await login.evaluate((input) => {
      try {
        new RegExp(input.pattern, 'v');
        return '';
      } catch (error) {
        return error.message;
      }
    });
    expect(patternFailure).toContain('Invalid character in character class');

    await form.getByLabel('Имя').fill('Елена Смирнова');
    await login.fill('elena.s');
    await form.getByLabel('Почта').fill('elena@example.test');
    const password = form.getByLabel('Пароль');
    await expect(password).toHaveAttribute('pattern', PASSWORD_PATTERN);
    await expect(password).toHaveAttribute('title', PASSWORD_ERROR_MESSAGE);
    await password.fill('abcdefghij');
    await form.getByRole('button', { name: /^Создать аккаунт/ }).click();
    await expect(page.locator('#register-dialog')).toBeVisible();
    expect(await password.evaluate((input) => input.validity.patternMismatch)).toBe(true);
    expect((await fixtureApi.read()).authRequestCounters.register).toBe(0);

    await password.fill('StrongPass123');
    const registered = page.waitForResponse((response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST');
    await form.getByRole('button', { name: /^Создать аккаунт/ }).click();
    expect((await registered).status()).toBe(201);

    await expect(page.locator('#register-dialog')).not.toBeVisible();
    await expect(page.locator('.login-trigger')).toHaveText('ЕС');
    await expect(page.locator('.toast')).toContainText('Профиль создан');
    const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'e2e-session');
    expect(sessionCookie?.value).toBe('customer');
  });
});

test.describe('legacy favorite rollback characterization', () => {
  test.use({ expectedHttpErrors: [{ path: '/api/favorites', status: 503 }] });

  test('rolls optimistic favorite state back when persistence fails', async ({ page, fixtureApi }) => {
    await fixtureApi.set({ favoritesFailNext: true });
    await authenticateFixture(page, 'customer');
    await page.goto('/');

    const favorite = page.locator('#popular [data-venue="marea"] .fav');
    await favorite.click();
    await expect(page.locator('.toast')).toContainText('Избранное временно недоступно');
    await expect(favorite).not.toHaveClass(/is-saved/);
    await expect(page.locator('.favorites-count')).toBeHidden();
    expect((await fixtureApi.read()).favorites).toBe(0);
  });
});

test.describe('legacy catalog error characterization', () => {
  test.use({ expectedHttpErrors: [{ path: '/api/venues', status: 503 }] });

  test('falls back to editorial cards when the catalog API is unavailable', async ({ page, fixtureApi }) => {
    test.skip(true, 'The catalog is React-owned since Phase 5; its error fallback is covered by phase5-public.spec.js.');
    await fixtureApi.set({ catalogError: true });
    await page.goto('/');
    await page.locator('.category-card[data-filter-category="Рестораны"]').click();

    await expect(page.locator('#catalog-view')).toBeVisible();
    await expect(page.locator('#catalog-venues-status')).toHaveText('Показана подборка редакции');
    await expect(page.locator('#catalog-grid [data-venue="marea"]')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('Каталог временно недоступен');
  });
});
