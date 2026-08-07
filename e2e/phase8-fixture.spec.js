const { authenticateFixture, expect, test } = require('./support/test-fixtures');

const venueId = '30000000-0000-4000-8000-000000000001';
const merchantId = '20000000-0000-4000-8000-000000000001';

function functionalOnly(testInfo) {
  test.skip(testInfo.project.name !== 'chromium', 'fixture contracts run once');
}

function sameOrigin(page) {
  return new URL(page.url() || 'http://127.0.0.1:4174').origin;
}

function mutate(page, path, method, data, origin = sameOrigin(page)) {
  return page.request.fetch(path, {
    method,
    data,
    headers: origin ? { Origin: origin } : {}
  });
}

test.describe('Phase 8 admin fixture contracts', () => {
  test('requires exact credentials and exposes private session responses', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');

    const anonymous = await page.request.get('/api/admin/session');
    expect(anonymous.status()).toBe(401);
    expect(anonymous.headers()['cache-control']).toBe('private, no-store, max-age=0');
    expect(anonymous.headers().vary).toBe('Cookie');

    const wrong = await mutate(page, '/api/admin/login', 'POST', {
      login: 'editor',
      password: 'wrong-password'
    });
    expect(wrong.status()).toBe(401);

    const crossOrigin = await mutate(page, '/api/admin/login', 'POST', {
      login: 'editor',
      password: 'fixture-password'
    }, 'https://attacker.example');
    expect(crossOrigin.status()).toBe(403);

    const login = await mutate(page, '/api/admin/login', 'POST', {
      login: 'editor',
      password: 'fixture-password'
    });
    expect(login.status()).toBe(200);
    await expect(login.json()).resolves.toMatchObject({
      authenticated: true,
      user: { login: 'editor', role: 'admin' }
    });
    expect((await page.request.get('/api/admin/session')).status()).toBe(200);
    expect((await fixtureApi.read()).adminRequestCounters).toMatchObject({
      login: 3,
      session: 3
    });
  });

  test('requires both an active session and same-origin evidence for every write', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');

    expect((await mutate(page, '/api/admin/submissions', 'PATCH', {
      id: '80000000-0000-4000-8000-000000000001',
      decision: 'approved',
      note: ''
    })).status()).toBe(401);

    await authenticateFixture(page, 'admin');
    expect((await mutate(page, '/api/admin/venues', 'DELETE', { id: venueId }, '')).status()).toBe(403);
    expect((await mutate(page, '/api/admin/merchants', 'PATCH', {
      userId: merchantId,
      status: 'suspended'
    }, 'https://attacker.example')).status()).toBe(403);

    const before = await fixtureApi.read();
    expect(before.adminVenues).toBe(1);
    expect(before.adminMerchantItems[0].status).toBe('active');
    expect(before.adminDashboard.submissions[0].status).toBe('pending');
  });

  test('keeps a merchant-list outage partial and one-shot', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await authenticateFixture(page, 'admin');
    await fixtureApi.set({ adminMerchantsDelayMs: 25, adminMerchantsFailNext: true });

    expect((await page.request.get('/api/admin/dashboard')).status()).toBe(200);
    const startedAt = Date.now();
    expect((await page.request.get('/api/admin/merchants')).status()).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    const recovered = await page.request.get('/api/admin/merchants');
    expect(recovered.status()).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ merchants: [expect.any(Object)] });
    expect((await fixtureApi.read()).adminRequestCounters).toMatchObject({
      dashboard: 1,
      merchantList: 2
    });
  });

  test('returns adapter-compatible moderation and venue mutation payloads', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');
    await authenticateFixture(page, 'admin');

    const moderated = await mutate(page, '/api/admin/submissions', 'PATCH', {
      id: '80000000-0000-4000-8000-000000000001',
      decision: 'approved',
      note: 'Проверено'
    });
    expect(moderated.status()).toBe(200);
    await expect(moderated.json()).resolves.toMatchObject({
      result: { status: 'approved', moderation_note: 'Проверено' }
    });

    const created = await mutate(page, '/api/admin/venues', 'POST', {
      slug: 'sosnoviy-bereg',
      title: 'Сосновый берег',
      city: 'Ялта',
      category: 'Ресторан',
      description: 'Ресторан с видом на море.',
      status: 'published'
    });
    expect(created.status()).toBe(201);
    const venue = (await created.json()).venue;
    expect(venue).toMatchObject({ slug: 'sosnoviy-bereg', title: 'Сосновый берег' });

    expect((await mutate(page, '/api/admin/venues', 'PATCH', {
      ...venue,
      title: 'Сосновый берег · обновлено'
    })).status()).toBe(200);
    expect((await mutate(page, '/api/admin/venues', 'DELETE', { id: venue.id })).status()).toBe(200);

    const state = await fixtureApi.read();
    expect(state.adminRequestCounters).toMatchObject({
      submissionModeration: 1,
      venueCreate: 1,
      venueUpdate: 1,
      venueDelete: 1
    });
    expect(state.adminDashboard.submissions[0]).toMatchObject({
      status: 'approved',
      moderation_note: 'Проверено'
    });
  });

  test('creates and updates merchants while keeping credentials response-only', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');
    await authenticateFixture(page, 'admin');

    const created = await mutate(page, '/api/admin/merchants', 'POST', {
      displayName: 'Иван Орлов',
      username: 'ivan.owner',
      email: 'ivan@example.test',
      password: 'FixturePass123',
      venueIds: [venueId],
      membershipRole: 'manager'
    });
    expect(created.status()).toBe(201);
    const payload = await created.json();
    expect(payload.credentials).toEqual({ login: 'ivan.owner', password: 'FixturePass123' });
    expect(payload.merchant.id).toBe(payload.merchant.user_id);

    expect((await mutate(page, '/api/admin/merchants', 'PATCH', {
      userId: payload.merchant.id,
      displayName: 'Иван Орлов · владелец',
      venueIds: [venueId],
      membershipRole: 'owner'
    })).status()).toBe(200);
    expect((await mutate(page, '/api/admin/merchants', 'PATCH', {
      userId: payload.merchant.id,
      status: 'suspended'
    })).status()).toBe(200);
    const reset = await mutate(page, '/api/admin/merchants', 'PATCH', {
      userId: payload.merchant.id,
      action: 'reset-password'
    });
    await expect(reset.json()).resolves.toEqual({
      credentials: { password: 'ResetPass123' },
      message: 'Временный пароль создан.'
    });

    const state = await fixtureApi.read();
    expect(state.adminMerchantItems.find((item) => item.id === payload.merchant.id)).toMatchObject({
      display_name: 'Иван Орлов · владелец',
      status: 'suspended'
    });
    expect(state.adminRequestCounters).toMatchObject({
      merchantCreate: 1,
      merchantUpdate: 1,
      merchantStatus: 1,
      merchantPasswordReset: 1
    });
  });

  test('admin mutation fail-next is delayed, counted and leaves persisted state unchanged', async ({ page, fixtureApi }, testInfo) => {
    functionalOnly(testInfo);
    await page.goto('/admin/overview');
    await authenticateFixture(page, 'admin');
    await fixtureApi.set({ adminMutationDelayMs: 25, adminMutationFailNext: true });

    const startedAt = Date.now();
    const failed = await mutate(page, '/api/admin/venues', 'DELETE', { id: venueId });
    expect(failed.status()).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    expect((await fixtureApi.read()).adminVenues).toBe(1);

    expect((await mutate(page, '/api/admin/venues', 'DELETE', { id: venueId })).status()).toBe(200);
    const state = await fixtureApi.read();
    expect(state.adminVenues).toBe(0);
    expect(state.adminRequestCounters.venueDelete).toBe(2);
    expect(state.scenario.adminMutationFailNext).toBe(false);
  });
});
