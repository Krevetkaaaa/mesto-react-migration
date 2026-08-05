const test = require('node:test');
const assert = require('node:assert/strict');
const {
  authorizationUrl,
  completeProviderIdentity
} = require('../lib/oauth-providers');
const {
  internalOAuthAlias,
  providerEmail
} = require('../lib/oauth-identity');

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.VK_ID_APP_ID;
  delete process.env.VK_ID_SERVICE_TOKEN;
  delete process.env.YANDEX_OAUTH_CLIENT_ID;
  delete process.env.YANDEX_OAUTH_CLIENT_SECRET;
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

test('Yandex authorization and code exchange use state, S256 PKCE, scopes, and Basic client auth', async () => {
  process.env.YANDEX_OAUTH_CLIENT_ID = 'ya-client';
  process.env.YANDEX_OAUTH_CLIENT_SECRET = 'ya-secret';
  const transaction = {
    state: 's'.repeat(43),
    challenge: 'challenge-value',
    verifier: 'v'.repeat(64),
    callbackUrl: 'https://mesto.example/api/auth/yandex/callback'
  };
  const authorize = new URL(authorizationUrl('yandex', transaction));
  assert.equal(authorize.origin, 'https://oauth.yandex.ru');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('state'), transaction.state);
  assert.match(authorize.searchParams.get('scope'), /login:email/);

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) return jsonResponse({ access_token: 'ya-provider-token' });
    return jsonResponse({
      id: '12345',
      login: 'mesto-user',
      display_name: 'Mesto User',
      default_email: 'USER@EXAMPLE.COM'
    });
  };
  const identity = await completeProviderIdentity('yandex', transaction, { code: 'authorization-code' });
  assert.deepEqual(identity, {
    provider: 'yandex',
    subject: '12345',
    email: 'user@example.com',
    displayName: 'Mesto User',
    preferredUsername: 'mesto-user',
    avatarUrl: ''
  });
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('ya-client:ya-secret').toString('base64')}`);
  assert.equal(calls[0].options.body.get('code_verifier'), transaction.verifier);
  assert.equal(calls[1].options.headers.Authorization, 'OAuth ya-provider-token');
  assert.equal('accessToken' in identity, false);
});

test('VK ID exchange sends device_id, verifies returned state, and never returns provider tokens', async () => {
  process.env.VK_ID_APP_ID = 'vk-app-id';
  process.env.VK_ID_SERVICE_TOKEN = 'vk-service-token';
  const transaction = {
    state: 'state-value-that-is-at-least-thirty-two-characters',
    challenge: 'challenge-value',
    verifier: 'v'.repeat(64),
    callbackUrl: 'https://mesto.example/api/auth/oauth-vk-callback'
  };
  const authorize = new URL(authorizationUrl('vk', transaction));
  assert.equal(authorize.origin, 'https://id.vk.ru');
  assert.equal(authorize.searchParams.get('scope'), 'vkid.personal_info');

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return jsonResponse({ access_token: 'vk-provider-token', state: transaction.state, user_id: 77 });
    }
    return jsonResponse({
      user: {
        user_id: 77,
        first_name: 'Анна',
        last_name: 'Место',
        email: 'anna@example.com',
        avatar: 'https://example.com/avatar.jpg'
      }
    });
  };
  const identity = await completeProviderIdentity('vk', transaction, {
    code: 'authorization-code',
    deviceId: 'device-from-callback'
  });
  assert.equal(calls[0].options.body.get('device_id'), 'device-from-callback');
  assert.equal(calls[0].options.body.get('service_token'), 'vk-service-token');
  assert.equal(calls[0].options.body.get('state'), transaction.state);
  assert.equal(calls[1].options.body.get('access_token'), 'vk-provider-token');
  assert.deepEqual(identity, {
    provider: 'vk',
    subject: '77',
    email: 'anna@example.com',
    displayName: 'Анна Место',
    preferredUsername: 'vk-77',
    avatarUrl: 'https://example.com/avatar.jpg'
  });
  assert.equal('accessToken' in identity, false);
});

test('VK ID rejects a token response with a mismatched state', async () => {
  process.env.VK_ID_APP_ID = 'vk-app-id';
  global.fetch = async () => jsonResponse({ access_token: 'vk-provider-token', state: 'wrong-state' });
  await assert.rejects(
    completeProviderIdentity('vk', {
      state: 'expected-state-that-is-at-least-thirty-two-characters',
      verifier: 'v'.repeat(64),
      callbackUrl: 'https://mesto.example/api/auth/oauth-vk-callback'
    }, {
      code: 'authorization-code',
      deviceId: 'device-from-callback'
    }),
    /OAUTH_PROVIDER_STATE_MISMATCH/
  );
});

test('VK without email receives a deterministic non-deliverable alias while Yandex still requires email', () => {
  const first = providerEmail({ email: '' }, 'vk', '77');
  const second = providerEmail({}, 'vk', '77');
  assert.deepEqual(first, { address: 'vk-77@oauth.mesto.invalid', isInternal: true });
  assert.deepEqual(second, first);
  assert.equal(internalOAuthAlias('vk', 'subject/with unsafe chars'), internalOAuthAlias('vk', 'subject/with unsafe chars'));
  assert.match(internalOAuthAlias('vk', 'subject/with unsafe chars'), /^vk-[a-f0-9]{32}@oauth\.mesto\.invalid$/);
  assert.throws(() => providerEmail({}, 'yandex', '88'), /OAUTH_EMAIL_REQUIRED/);
  assert.deepEqual(providerEmail({ email: 'User@Example.com' }, 'yandex', '88'), {
    address: 'user@example.com',
    isInternal: false
  });
});
