const { authenticateFixture, expect, test } = require('./support/test-fixtures');
const { NEW_PASSWORD_ERROR_MESSAGE } = require('../password-policy-core.js');

const venueId = '30000000-0000-4000-8000-000000000001';

async function useMerchantSession(page) {
  await page.context().clearCookies();
  await authenticateFixture(page, 'merchant');
}

test.describe('Phase 7 merchant fixture contracts', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'fixture contracts run once');
  });

  test('dashboard requires an active merchant session and reports every attempt', async ({ page, fixtureApi }) => {
    expect((await page.request.get('/api/merchant/dashboard')).status()).toBe(401);

    await authenticateFixture(page, 'customer');
    expect((await page.request.get('/api/merchant/dashboard')).status()).toBe(403);

    await useMerchantSession(page);
    await fixtureApi.set({ merchantSessionMode: 'wrong-role' });
    expect((await page.request.get('/api/merchant/dashboard')).status()).toBe(403);

    await fixtureApi.set({ merchantSessionMode: 'expired' });
    const expired = await page.request.get('/api/merchant/dashboard');
    expect(expired.status()).toBe(401);
    await expect(expired.json()).resolves.toMatchObject({ code: 'SESSION_EXPIRED' });

    await fixtureApi.set({ merchantSessionMode: 'active' });
    const active = await page.request.get('/api/merchant/dashboard');
    expect(active.status()).toBe(200);
    await expect(active.json()).resolves.toMatchObject({
      user: { role: 'merchant', status: 'active' },
      stats: { venues: 1, menuItems: 1, activePromotions: 1, reviews: 1 }
    });

    expect((await fixtureApi.read()).merchantRequestCounters.dashboard).toBe(5);
  });

  test('dashboard exposes only the slices allowed by each membership role', async ({ page, fixtureApi }) => {
    await useMerchantSession(page);

    await fixtureApi.set({ merchantRole: 'analyst' });
    const analyst = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(analyst.memberships).toEqual([expect.objectContaining({ membership_role: 'analyst' })]);
    expect(analyst.venues).toHaveLength(1);
    expect(analyst.menu).toEqual([]);
    expect(analyst.promotions).toEqual([]);
    expect(analyst.reviews).toHaveLength(1);
    expect(analyst.stats).toEqual({ venues: 1, menuItems: 0, activePromotions: 0, reviews: 1 });

    await fixtureApi.set({ merchantRole: 'content_editor' });
    const editor = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(editor.menu).toHaveLength(1);
    expect(editor.promotions).toHaveLength(1);
    expect(editor.reviews).toEqual([]);
    expect(editor.stats).toEqual({ venues: 1, menuItems: 1, activePromotions: 1, reviews: 0 });

    await fixtureApi.set({ merchantRole: 'manager' });
    const manager = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(manager.menu).toHaveLength(1);
    expect(manager.promotions).toHaveLength(1);
    expect(manager.reviews).toHaveLength(1);
  });

  test('direct writes require both an active merchant and the venue permission', async ({ page, fixtureApi }) => {
    const venuePatch = { id: venueId, title: 'Обновлённый сад' };
    expect((await page.request.patch('/api/merchant/venue', { data: venuePatch })).status()).toBe(401);

    await useMerchantSession(page);
    await fixtureApi.set({ merchantSessionMode: 'wrong-role' });
    expect((await page.request.patch('/api/merchant/venue', { data: venuePatch })).status()).toBe(403);

    await fixtureApi.set({ merchantSessionMode: 'active', merchantRole: 'analyst' });
    expect((await page.request.patch('/api/merchant/venue', { data: venuePatch })).status()).toBe(403);
    expect((await page.request.post('/api/merchant/menu', {
      data: { venueId, title: 'Запрещённое блюдо' }
    })).status()).toBe(403);
    expect((await page.request.post('/api/merchant/promotions', {
      data: { venueId, title: 'Запрещённая акция' }
    })).status()).toBe(403);

    await fixtureApi.set({ merchantRole: 'content_editor' });
    expect((await page.request.patch('/api/merchant/venue', { data: venuePatch })).status()).toBe(200);
    expect((await page.request.post('/api/merchant/menu', {
      data: { venueId, title: 'Разрешённое блюдо', price: 480 }
    })).status()).toBe(201);
    const promotion = await page.request.post('/api/merchant/promotions', {
      data: { venueId, title: 'Разрешённая акция', status: 'active' }
    });
    expect(promotion.status()).toBe(201);
    await expect(promotion.json()).resolves.toEqual({
      promotion: expect.objectContaining({ venue_id: venueId, title: 'Разрешённая акция' })
    });

    expect((await page.request.post('/api/merchant/menu', {
      data: { venueId: '30000000-0000-4000-8000-000000000999', title: 'Чужое блюдо' }
    })).status()).toBe(403);

    expect((await fixtureApi.read()).merchantRequestCounters).toMatchObject({
      venueUpdate: 4,
      menuCreate: 3,
      promotionCreate: 2
    });
  });

  test('dashboard and mutation fail-next controls are delayed, one-shot and counted', async ({ page, fixtureApi }) => {
    await useMerchantSession(page);
    await fixtureApi.set({ merchantDelayMs: 25, merchantDashboardFailNext: true });

    let startedAt = Date.now();
    expect((await page.request.get('/api/merchant/dashboard')).status()).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    expect((await page.request.get('/api/merchant/dashboard')).status()).toBe(200);

    await fixtureApi.set({ merchantMutationDelayMs: 25, merchantMutationFailNext: true });
    startedAt = Date.now();
    const failed = await page.request.post('/api/merchant/menu', {
      data: { venueId, title: 'Не должно сохраниться' }
    });
    expect(failed.status()).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    let state = await fixtureApi.read();
    expect(state.menu).toBe(1);
    expect(state.scenario.merchantMutationFailNext).toBe(false);

    const saved = await page.request.post('/api/merchant/menu', {
      data: { venueId, title: 'Сохранённое блюдо' }
    });
    expect(saved.status()).toBe(201);
    state = await fixtureApi.read();
    expect(state.menu).toBe(2);
    expect(state.merchantRequestCounters).toMatchObject({ dashboard: 2, menuCreate: 2 });
  });

  test('persistent mutation failures leave saved state unchanged for explicit rollback tests', async ({ page, fixtureApi }) => {
    await useMerchantSession(page);
    await fixtureApi.set({ merchantMutationError: true });

    const failedVenue = await page.request.patch('/api/merchant/venue', {
      data: { id: venueId, title: 'Несохранённое название' }
    });
    expect(failedVenue.status()).toBe(503);

    const failedDelete = await page.request.delete('/api/merchant/menu', {
      data: { id: '50000000-0000-4000-8000-000000000001' }
    });
    expect(failedDelete.status()).toBe(503);

    await fixtureApi.set({ merchantMutationError: false });
    const dashboard = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(dashboard.venues[0].title).not.toBe('Несохранённое название');
    expect(dashboard.menu).toHaveLength(1);
  });

  test('successful merchant password change clears the forced-password state', async ({ page, fixtureApi }) => {
    await useMerchantSession(page);
    await fixtureApi.set({ merchantMustChangePassword: true });
    const before = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(before.user.mustChangePassword).toBe(true);

    const rejected = await page.request.post('/api/auth/password', {
      data: { password: 'abcdefghij' }
    });
    expect(rejected.status()).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ message: NEW_PASSWORD_ERROR_MESSAGE });
    expect((await fixtureApi.read()).scenario.merchantMustChangePassword).toBe(true);

    const changed = await page.request.post('/api/auth/password', {
      data: { password: 'NewFixture123' }
    });
    expect(changed.status()).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({ user: { mustChangePassword: false } });

    const after = await (await page.request.get('/api/merchant/dashboard')).json();
    expect(after.user.mustChangePassword).toBe(false);
    expect((await fixtureApi.read()).scenario.merchantMustChangePassword).toBe(false);
  });
});
