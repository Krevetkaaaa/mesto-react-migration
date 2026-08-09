const test = require('node:test');
const assert = require('node:assert/strict');

const loginHandler = require('../handlers/admin/login');
const logoutHandler = require('../handlers/admin/logout');
const sessionHandler = require('../handlers/admin/session');
const {
  AdminSessionRevocationError,
  activeAdminSession,
  configuration,
  createMemoryAdminSessionRevocationAdapter,
  createUpstashRedisAdminSessionRevocationAdapter,
  resetAdminSessionRevocationForTests,
  revokeAdminSession
} = require('../lib/admin-session-revocation');
const { createSessionCookie, hashPassword } = require('../lib/security');

const ADMIN_SECRET = 'admin-revocation-test-secret-that-is-at-least-32-characters';
const PUBLIC_ORIGIN = 'https://mesto.example';
const originalFetch = global.fetch;
const originalEnvironment = {
  MESTO_ADMIN_SESSION_REVOCATION_PROVIDER: process.env.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER,
  MESTO_ADMIN_SESSION_REDIS_TOKEN: process.env.MESTO_ADMIN_SESSION_REDIS_TOKEN,
  MESTO_ADMIN_SESSION_REDIS_URL: process.env.MESTO_ADMIN_SESSION_REDIS_URL,
  MESTO_ADMIN_SESSION_SECRET: process.env.MESTO_ADMIN_SESSION_SECRET,
  MESTO_ADMIN_LOGIN: process.env.MESTO_ADMIN_LOGIN,
  MESTO_ADMIN_PASSWORD_HASH: process.env.MESTO_ADMIN_PASSWORD_HASH,
  MESTO_PUBLIC_ORIGIN: process.env.MESTO_PUBLIC_ORIGIN,
  MESTO_RATE_LIMIT_PROVIDER: process.env.MESTO_RATE_LIMIT_PROVIDER,
  MESTO_RATE_LIMIT_REDIS_TOKEN: process.env.MESTO_RATE_LIMIT_REDIS_TOKEN,
  MESTO_RATE_LIMIT_REDIS_URL: process.env.MESTO_RATE_LIMIT_REDIS_URL,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV
};

test.beforeEach(() => {
  process.env.MESTO_ADMIN_SESSION_SECRET = ADMIN_SECRET;
  process.env.MESTO_PUBLIC_ORIGIN = PUBLIC_ORIGIN;
  delete process.env.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER;
  delete process.env.MESTO_ADMIN_SESSION_REDIS_TOKEN;
  delete process.env.MESTO_ADMIN_SESSION_REDIS_URL;
  delete process.env.MESTO_RATE_LIMIT_PROVIDER;
  delete process.env.MESTO_RATE_LIMIT_REDIS_TOKEN;
  delete process.env.MESTO_RATE_LIMIT_REDIS_URL;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL_ENV;
  resetAdminSessionRevocationForTests();
});

test.afterEach(() => {
  global.fetch = originalFetch;
  resetAdminSessionRevocationForTests();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function request(cookie) {
  return {
    method: 'GET',
    headers: {
      cookie,
      origin: PUBLIC_ORIGIN,
      'sec-fetch-site': 'same-origin'
    }
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

function createRedisFixture() {
  const entries = new Map();
  const calls = [];
  return {
    calls,
    async fetch(_input, init) {
      const command = JSON.parse(init.body);
      calls.push(command);
      if (command[0] === 'EXISTS') {
        return Response.json({ result: entries.has(command[1]) ? 1 : 0 });
      }
      if (command[0] === 'SET') {
        entries.set(command[1], { value: command[2], ttl: Number(command[4]) });
        return Response.json({ result: 'OK' });
      }
      return Response.json({ error: 'unexpected command' }, { status: 400 });
    }
  };
}

test('a revoked admin cookie is rejected while another session remains active', async () => {
  const adapter = createMemoryAdminSessionRevocationAdapter();
  const firstCookie = createSessionCookie('editor', ADMIN_SECRET, 300);
  const secondCookie = createSessionCookie('editor', ADMIN_SECRET, 300);

  assert.equal((await activeAdminSession(request(firstCookie), adapter))?.sub, 'editor');
  assert.equal((await activeAdminSession(request(secondCookie), adapter))?.sub, 'editor');

  await revokeAdminSession(request(firstCookie), adapter);

  assert.equal(await activeAdminSession(request(firstCookie), adapter), null);
  assert.equal((await activeAdminSession(request(secondCookie), adapter))?.sub, 'editor');
});

test('independent Redis adapters observe the same revocation without exposing the token in the key', async () => {
  const redis = createRedisFixture();
  const options = {
    url: 'https://shared-redis.example',
    token: 'shared-provider-token',
    fetchImpl: redis.fetch
  };
  const instanceA = createUpstashRedisAdminSessionRevocationAdapter(options);
  const instanceB = createUpstashRedisAdminSessionRevocationAdapter(options);
  const cookie = createSessionCookie('editor', ADMIN_SECRET, 300);

  assert.equal((await activeAdminSession(request(cookie), instanceB))?.sub, 'editor');
  await revokeAdminSession(request(cookie), instanceA);
  assert.equal(await activeAdminSession(request(cookie), instanceB), null);

  const token = decodeURIComponent(cookie.match(/^mesto_admin=([^;]+)/)[1]);
  const setCommand = redis.calls.find(([name]) => name === 'SET');
  assert.match(setCommand[1], /^mesto:admin-session-revocation:[A-Za-z0-9_-]{43}$/);
  assert.equal(setCommand[1].includes(token), false);
  assert.equal(Number(setCommand[4]) > 0 && Number(setCommand[4]) <= 300, true);
});

test('production refuses process-local revocation and can reuse the shared limiter Redis', () => {
  assert.throws(
    () => configuration({ NODE_ENV: 'production', MESTO_ADMIN_SESSION_REVOCATION_PROVIDER: 'memory' }),
    (error) => error instanceof AdminSessionRevocationError
      && error.code === 'ADMIN_SESSION_CONFIGURATION_ERROR'
  );
  assert.throws(
    () => configuration({ VERCEL_ENV: 'production' }),
    (error) => error instanceof AdminSessionRevocationError
      && error.code === 'ADMIN_SESSION_CONFIGURATION_ERROR'
  );

  const config = configuration({
    NODE_ENV: 'production',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    MESTO_RATE_LIMIT_REDIS_URL: 'https://shared-redis.example',
    MESTO_RATE_LIMIT_REDIS_TOKEN: 'shared-provider-token'
  });
  assert.equal(config.provider, 'upstash-redis');
  assert.equal(config.endpoint, 'https://shared-redis.example');
});

test('admin logout persists revocation before clearing the cookie', async () => {
  const cookie = createSessionCookie('editor', ADMIN_SECRET, 300);
  const before = responseRecorder();
  await sessionHandler(request(cookie), before);
  assert.equal(before.statusCode, 200);

  const logout = responseRecorder();
  await logoutHandler({ ...request(cookie), method: 'POST' }, logout);
  assert.equal(logout.statusCode, 200);
  assert.match(logout.headers['set-cookie'], /^mesto_admin=;/);

  const replay = responseRecorder();
  await sessionHandler(request(cookie), replay);
  assert.equal(replay.statusCode, 401);
  assert.deepEqual(replay.body, { authenticated: false });
});

test('provider failure is fail-closed and does not discard the only retryable logout cookie', async () => {
  process.env.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER = 'upstash-redis';
  process.env.MESTO_ADMIN_SESSION_REDIS_URL = 'https://shared-redis.example';
  process.env.MESTO_ADMIN_SESSION_REDIS_TOKEN = 'shared-provider-token';
  global.fetch = async () => { throw new Error('provider unavailable'); };
  const cookie = createSessionCookie('editor', ADMIN_SECRET, 300);

  const session = responseRecorder();
  await sessionHandler(request(cookie), session);
  assert.equal(session.statusCode, 503);
  assert.deepEqual(session.body, { authenticated: false, code: 'ADMIN_SESSION_UNAVAILABLE' });

  const logout = responseRecorder();
  await logoutHandler({ ...request(cookie), method: 'POST' }, logout);
  assert.equal(logout.statusCode, 503);
  assert.equal(logout.body.code, 'ADMIN_SESSION_UNAVAILABLE');
  assert.equal(logout.headers['set-cookie'], undefined);
});

test('login does not issue a session while shared revocation is unavailable', async () => {
  process.env.MESTO_ADMIN_LOGIN = 'editor';
  process.env.MESTO_ADMIN_PASSWORD_HASH = hashPassword('Strong-Admin-Password-7');
  process.env.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER = 'upstash-redis';
  process.env.MESTO_ADMIN_SESSION_REDIS_URL = 'https://shared-redis.example';
  process.env.MESTO_ADMIN_SESSION_REDIS_TOKEN = 'shared-provider-token';
  global.fetch = async () => { throw new Error('provider unavailable'); };

  const response = responseRecorder();
  await loginHandler({
    ...request(''),
    method: 'POST',
    body: { login: 'editor', password: 'Strong-Admin-Password-7' },
    socket: { remoteAddress: 'admin-login-test' }
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'ADMIN_SESSION_UNAVAILABLE');
  assert.equal(response.headers['set-cookie'], undefined);
});
