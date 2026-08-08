const { authenticateFixture, expect, test } = require('./support/test-fixtures');
const { PASSWORD_ERROR_MESSAGE } = require('../password-policy-core.js');

async function startFixtureOAuth(request, provider, returnTo = '/profile') {
  return request.get(`/api/auth/oauth?${new URLSearchParams({ provider, returnTo }).toString()}`, {
    maxRedirects: 0
  });
}

function redirectTarget(response) {
  expect(response.status()).toBe(302);
  return new URL(response.headers().location, 'http://fixture.test');
}

test.describe('Phase 6 auth and favorites fixture contracts', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'fixture contracts run once');
  });

  test('providers and logout match the typed Session adapter contracts', async ({ request, fixtureApi }) => {
    const providers = await request.get('/api/auth/providers');
    expect(providers.status()).toBe(200);
    await expect(providers.json()).resolves.toEqual({
      email: true,
      google: false,
      yandex: false,
      vk: false
    });

    const login = await request.post('/api/auth/login', {
      data: { login: 'anna@example.test', password: 'fixture-password' }
    });
    expect(login.status()).toBe(200);
    const logout = await request.post('/api/auth/logout', { data: {} });
    expect(logout.status()).toBe(200);
    await expect(logout.json()).resolves.toEqual({ ok: true });
    expect(logout.headers()['set-cookie']).toContain('Max-Age=0');

    expect((await fixtureApi.read()).authRequestCounters).toEqual({
      login: 1,
      logout: 1,
      oauthSession: 0,
      password: 0,
      providers: 1,
      register: 0,
      session: 0
    });
  });

  test('known customer and merchant credentials succeed while bad credentials are rejected', async ({ request, fixtureApi }) => {
    for (const login of ['anna@example.test', 'anna', 'merchant@example.test', 'merchant.owner']) {
      const response = await request.post('/api/auth/login', {
        data: { login, password: 'fixture-password' }
      });
      expect(response.status(), login).toBe(200);
    }

    for (const credentials of [
      { login: 'anna@example.test', password: 'wrong-password' },
      { login: 'unknown@example.test', password: 'fixture-password' }
    ]) {
      const response = await request.post('/api/auth/login', { data: credentials });
      expect(response.status()).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    expect((await fixtureApi.read()).authRequestCounters.login).toBe(6);
  });

  test('registration rejects weak passwords without issuing or mutating a session', async ({ request, fixtureApi }) => {
    for (const [index, password] of ['short', 'abcdefghij', '1234567890'].entries()) {
      const registration = await request.post('/api/auth/register', {
        data: {
          name: 'Fixture New Customer',
          username: `fixture.weak.${index}`,
          email: `fixture.weak.${index}@example.test`,
          password
        }
      });
      expect(registration.status()).toBe(400);
      expect(registration.headers()['set-cookie']).toBeUndefined();
      await expect(registration.json()).resolves.toEqual({ message: PASSWORD_ERROR_MESSAGE });
    }

    const session = await request.get('/api/auth/session');
    expect(session.status()).toBe(401);
    expect((await fixtureApi.read()).authRequestCounters).toMatchObject({ register: 3, session: 1 });
  });

  test('registration persists the new customer identity for the issued session cookie', async ({ request, fixtureApi }) => {
    const registration = await request.post('/api/auth/register', {
      data: {
        name: 'Fixture New Customer',
        username: 'fixture.new.customer',
        email: 'fixture.new.customer@example.test',
        password: 'FixturePass123'
      }
    });
    expect(registration.status()).toBe(201);
    expect(registration.headers()['set-cookie']).toContain('e2e-session=customer');
    const registered = await registration.json();
    expect(registered.user).toMatchObject({
      name: 'Fixture New Customer',
      username: 'fixture.new.customer',
      email: 'fixture.new.customer@example.test'
    });

    const session = await request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    const restored = await session.json();
    expect(restored.user).toEqual(registered.user);

    const state = await fixtureApi.read();
    expect(state.authRequestCounters.register).toBe(1);
    expect(state.authRequestCounters.session).toBe(1);
  });

  test('OAuth providers are controllable and all enabled success flows stay inside the fixture origin', async ({ request, fixtureApi, baseURL }) => {
    const disabled = await startFixtureOAuth(request, 'google');
    expect(disabled.status()).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({ code: 'OAUTH_PROVIDER_NOT_CONFIGURED' });

    await fixtureApi.set({ oauthProviders: { google: true, yandex: true, vk: true }, oauthMode: 'success' });
    const providers = await request.get('/api/auth/providers');
    await expect(providers.json()).resolves.toEqual({ email: true, google: true, yandex: true, vk: true });

    const google = await startFixtureOAuth(request, 'google', '/favorites?source=oauth#saved');
    const googleTarget = redirectTarget(google);
    expect(`${googleTarget.pathname}${googleTarget.search}`).toBe('/login?returnTo=%2Ffavorites%3Fsource%3Doauth%23saved');
    expect(googleTarget.hash).toBe('#access_token=fixture-oauth-token');
    expect(google.headers()['set-cookie']).toBeUndefined();

    const googleCompletion = await request.post('/api/auth/oauth-session', {
      data: { accessToken: googleTarget.hash.slice('#access_token='.length) }
    });
    expect(googleCompletion.status()).toBe(200);
    expect(googleCompletion.headers()['set-cookie']).toContain('e2e-session=customer');

    for (const provider of ['yandex', 'vk']) {
      const returnTo = provider === 'yandex'
        ? new URL('/favorites?source=oauth#saved', baseURL).toString()
        : '/favorites?source=oauth#saved';
      const response = await startFixtureOAuth(request, provider, returnTo);
      const target = redirectTarget(response);
      const expectedReturnTo = provider === 'yandex' ? '/profile' : '/favorites?source=oauth#saved';
      expect(`${target.pathname}${target.search}${target.hash}`, provider).toBe(expectedReturnTo);
      expect(response.headers()['set-cookie'], provider).toContain('e2e-session=customer');
    }
  });

  test('OAuth denied and expired modes return stable same-origin errors for every provider', async ({ request, fixtureApi }) => {
    await fixtureApi.set({ oauthProviders: { google: true, yandex: true, vk: true } });

    for (const [oauthMode, errorCode] of [['denied', 'OAUTH_DENIED'], ['expired', 'OAUTH_EXPIRED']]) {
      await fixtureApi.set({ oauthMode });
      for (const provider of ['google', 'yandex', 'vk']) {
        const response = await startFixtureOAuth(request, provider, 'https://evil.example/steal');
        const target = redirectTarget(response);
        expect(target.origin).toBe('http://fixture.test');
        expect(target.pathname).toBe('/login');
        expect(target.searchParams.get('oauthError')).toBe(errorCode);
        expect(target.searchParams.get('provider')).toBe(provider);
        expect(response.headers()['set-cookie']).toBeUndefined();
      }
    }
  });

  test('OAuth success normalizes unsafe return targets for every provider', async ({ request, fixtureApi }) => {
    await fixtureApi.set({
      oauthProviders: { google: true, yandex: true, vk: true },
      oauthMode: 'success'
    });
    const unsafeTargets = ['https://evil.example/steal', '//evil.example/steal', '/%2f%2fevil.example/steal'];

    for (const [index, provider] of ['google', 'yandex', 'vk'].entries()) {
      const response = await startFixtureOAuth(request, provider, unsafeTargets[index]);
      const target = redirectTarget(response);
      if (provider === 'google') {
        expect(target.pathname).toBe('/login');
        expect(target.searchParams.get('returnTo')).toBe('/profile');
        expect(target.hash).toBe('#access_token=fixture-oauth-token');
      } else {
        expect(`${target.pathname}${target.search}${target.hash}`).toBe('/profile');
      }
      expect(target.host).toBe('fixture.test');
    }
  });

  test('session and favorites accept only a recognized active user session', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');

    const favoriteRequests = async () => [
      await page.request.get('/api/favorites'),
      await page.request.post('/api/favorites', {
        data: { venueKey: 'fixture-venue', snapshot: { title: 'Fixture venue' } }
      }),
      await page.request.delete('/api/favorites', { data: { venueKey: 'fixture-venue' } })
    ];

    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
    const activeFavorites = await favoriteRequests();
    expect(activeFavorites.map((response) => response.status())).toEqual([200, 201, 200]);

    await fixtureApi.set({ customerSessionMode: 'expired' });
    const expiredResponses = [
      await page.request.get('/api/auth/session'),
      ...await favoriteRequests()
    ];
    for (const response of expiredResponses) {
      expect(response.status()).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: 'SESSION_EXPIRED' });
    }

    await fixtureApi.set({ customerSessionMode: 'revoked' });
    const revokedResponses = [
      await page.request.get('/api/auth/session'),
      ...await favoriteRequests()
    ];
    for (const response of revokedResponses) {
      expect(response.status()).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: 'SESSION_REVOKED' });
    }

    await page.context().addCookies([{
      name: 'e2e-session',
      value: 'unknown-session',
      domain: '127.0.0.1',
      path: '/'
    }]);
    const unknownResponses = [
      await page.request.get('/api/auth/session'),
      ...await favoriteRequests()
    ];
    for (const response of unknownResponses) {
      expect(response.status()).toBe(401);
    }

    const state = await fixtureApi.read();
    expect(state.authRequestCounters.session).toBe(4);
    expect(state.favoritesRequestCounters).toEqual({ list: 4, remove: 4, save: 4 });
    expect(state.favorites).toBe(0);
  });

  test('auth and favorites expose independent delays, failures and counters', async ({ page, fixtureApi }) => {
    await authenticateFixture(page, 'customer');
    await fixtureApi.set({ authDelayMs: 25, favoritesDelayMs: 25 });

    let startedAt = Date.now();
    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);

    startedAt = Date.now();
    expect((await page.request.get('/api/favorites')).status()).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);

    await fixtureApi.set({ authDelayMs: 0, authError: true, favoritesDelayMs: 0, favoritesError: true });
    expect((await page.request.get('/api/auth/session')).status()).toBe(503);
    const failedSave = await page.request.post('/api/favorites', {
      data: { venueKey: 'tihiy-sad', snapshot: { title: 'Тихий сад' } }
    });
    expect(failedSave.status()).toBe(503);

    const state = await fixtureApi.read();
    expect(state.authRequestCounters.session).toBe(2);
    expect(state.favoritesRequestCounters).toEqual({ list: 1, remove: 0, save: 1 });
    expect(state.favorites).toBe(0);
  });
});
