const test = require('node:test');
const assert = require('node:assert/strict');

const favoritesHandler = require('../handlers/favorites');
const loginHandler = require('../handlers/auth/login');
const logoutHandler = require('../handlers/auth/logout');
const oauthSessionHandler = require('../handlers/auth/oauth-session');
const passwordHandler = require('../handlers/auth/password');
const registerHandler = require('../handlers/auth/register');
const sessionHandler = require('../handlers/auth/session');
const { isSameOriginRequest } = require('../lib/same-origin');
const { signSession } = require('../lib/security');
const { NEW_PASSWORD_ERROR_MESSAGE, PASSWORD_ERROR_MESSAGE } = require('../password-policy.mjs');

const USER_ID = '9aa8f050-486d-4d77-95d9-2dba1d633d07';
const USER_SECRET = 'customer-auth-test-secret-that-is-long-enough';
const PUBLIC_ORIGIN = 'https://mesto.example';
const originalFetch = global.fetch;
const originalEnvironment = {
  MESTO_ADMIN_SESSION_SECRET: process.env.MESTO_ADMIN_SESSION_SECRET,
  MESTO_PUBLIC_ORIGIN: process.env.MESTO_PUBLIC_ORIGIN,
  MESTO_USER_SESSION_SECRET: process.env.MESTO_USER_SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

test.beforeEach(() => {
  delete process.env.MESTO_ADMIN_SESSION_SECRET;
  process.env.MESTO_PUBLIC_ORIGIN = PUBLIC_ORIGIN;
  process.env.MESTO_USER_SESSION_SECRET = USER_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

function currentToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signSession({
    typ: 'mesto.user-session',
    aud: 'mesto.public',
    version: 1,
    sub: USER_ID,
    role: 'customer',
    sv: 0,
    iat: now,
    exp: now + 60,
    ...overrides
  }, USER_SECRET);
}

function request(method, { body, cookie, headers = {} } = {}) {
  return {
    method,
    body,
    headers: {
      ...(cookie ? { cookie: `mesto_session=${encodeURIComponent(cookie)}` } : {}),
      ...headers
    },
    socket: { remoteAddress: 'customer-auth-hardening-test' }
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() { return body; }
  };
}

test('same-origin module fails closed for unsafe requests and rejects conflicting browser signals', () => {
  assert.equal(isSameOriginRequest(request('GET')), true);
  assert.equal(isSameOriginRequest(request('POST', { headers: { origin: PUBLIC_ORIGIN } })), true);
  assert.equal(isSameOriginRequest(request('POST', { headers: { 'sec-fetch-site': 'same-origin' } })), true);
  assert.equal(isSameOriginRequest(request('POST')), false);
  assert.equal(isSameOriginRequest(request('POST', { headers: { origin: 'https://evil.example' } })), false);
  assert.equal(isSameOriginRequest(request('POST', {
    headers: { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'cross-site' }
  })), false);

  process.env.MESTO_PUBLIC_ORIGIN = 'not-an-origin';
  assert.equal(isSameOriginRequest(request('POST', {
    headers: { host: 'mesto.example', origin: PUBLIC_ORIGIN }
  })), false);
});

test('GET auth/session returns 401 for absent or invalid customer sessions', async () => {
  for (const cookie of [undefined, currentToken({ aud: 'wrong-audience' })]) {
    const res = responseRecorder();
    await sessionHandler(request('GET', { cookie }), res);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { authenticated: false });
  }
});

test('GET auth/session returns controlled 503 when profile storage is unavailable', async () => {
  const res = responseRecorder();
  await sessionHandler(request('GET', { cookie: currentToken() }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    authenticated: false,
    message: 'Сервис профиля и избранного временно недоступен.',
    code: 'SESSION_SERVICE_UNAVAILABLE'
  });
});

test('GET auth/session returns controlled 503 when favorites storage fails after profile restore', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/profiles') {
      return jsonResponse([{ id: USER_ID, role: 'customer', status: 'active', session_version: 0 }]);
    }
    if (url.pathname === '/rest/v1/favorites') {
      return jsonResponse({ message: 'upstream details must not leak' }, 503);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const res = responseRecorder();
  await sessionHandler(request('GET', { cookie: currentToken() }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SESSION_SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('upstream details'), false);
});

test('favorites returns controlled 503 without leaking store errors', async () => {
  const res = responseRecorder();
  await favoritesHandler(request('GET', { cookie: currentToken() }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: 'Сервис профиля временно недоступен.',
    code: 'AUTH_SERVICE_UNAVAILABLE'
  });
});

test('favorites returns controlled 503 when its store fails after profile restore', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/profiles') {
      return jsonResponse([{ id: USER_ID, role: 'customer', status: 'active', session_version: 0 }]);
    }
    if (url.pathname === '/rest/v1/favorites') {
      return jsonResponse({ message: 'private upstream failure' }, 500);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const res = responseRecorder();
  await favoritesHandler(request('GET', { cookie: currentToken() }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: 'Избранное временно недоступно.',
    code: 'FAVORITES_UNAVAILABLE'
  });
});

test('unsafe cookie-auth handlers reject cross-site requests before auth or mutation', async () => {
  const headers = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };
  const favorites = responseRecorder();
  await favoritesHandler(request('POST', { body: {}, cookie: currentToken(), headers }), favorites);
  assert.equal(favorites.statusCode, 403);
  assert.equal(favorites.body.code, 'CSRF_CHECK_FAILED');

  const password = responseRecorder();
  await passwordHandler(request('POST', { body: {}, cookie: currentToken(), headers }), password);
  assert.equal(password.statusCode, 403);
  assert.equal(password.body.code, 'CSRF_CHECK_FAILED');

  const logout = responseRecorder();
  logoutHandler(request('POST', { body: {}, cookie: currentToken(), headers }), logout);
  assert.equal(logout.statusCode, 403);
  assert.equal(logout.body.code, 'CSRF_CHECK_FAILED');
  assert.equal(logout.headers['set-cookie'], undefined);
});

test('same-origin login, registration and Google exchange reach their existing validation contracts', async () => {
  const headers = { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' };
  for (const handler of [loginHandler, registerHandler, oauthSessionHandler]) {
    const res = responseRecorder();
    await handler(request('POST', { body: {}, headers }), res);
    assert.equal(res.statusCode, 400);
    assert.notEqual(res.body.code, 'CSRF_CHECK_FAILED');
  }
});

test('registration rejects every weak-password shape before identity persistence', async () => {
  const headers = { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' };
  let upstreamCalls = 0;
  global.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('Weak registration must not reach identity persistence');
  };

  for (const [index, password] of ['short', 'abcdefghij', '1234567890'].entries()) {
    const res = responseRecorder();
    await registerHandler(request('POST', {
      body: {
        name: 'Test User',
        username: `test-user-${index}`,
        email: `test-user-${index}@example.test`,
        password
      },
      headers
    }), res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { message: PASSWORD_ERROR_MESSAGE });
    assert.equal(res.headers['set-cookie'], undefined);
  }

  assert.equal(upstreamCalls, 0);
});

test('password change rejects a weak password before identity mutation', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const calls = [];
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method || 'GET'} ${url.pathname}`);
    if (url.pathname === '/rest/v1/profiles' && (init?.method || 'GET') === 'GET') {
      return jsonResponse([{
        id: USER_ID,
        email: 'user@example.test',
        username: 'user',
        display_name: 'User',
        role: 'customer',
        status: 'active',
        session_version: 0,
        must_change_password: true
      }]);
    }
    throw new Error(`Weak password must not reach identity mutation: ${url.pathname}`);
  };

  const res = responseRecorder();
  await passwordHandler(request('POST', {
    body: { password: 'abcdefghij' },
    cookie: currentToken(),
    headers: { origin: PUBLIC_ORIGIN, 'sec-fetch-site': 'same-origin' }
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: NEW_PASSWORD_ERROR_MESSAGE });
  assert.equal(res.headers['set-cookie'], undefined);
  assert.deepEqual(calls, ['GET /rest/v1/profiles']);
});
