const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardHandler = require('../handlers/admin/dashboard');
const loginHandler = require('../handlers/admin/login');
const logoutHandler = require('../handlers/admin/logout');
const merchantsHandler = require('../handlers/admin/merchants');
const reviewsHandler = require('../handlers/admin/reviews');
const venuesHandler = require('../handlers/admin/venues');
const { configurePublicCacheInvalidation } = require('../lib/public-cache');
const { ADMIN_SESSION_TYPE, hashPassword, signSession, verifySession } = require('../lib/security');
const { TEMPORARY_PASSWORD_ERROR_MESSAGE } = require('../password-policy-core.js');

const ADMIN_SECRET = 'phase-8-admin-secret-that-is-at-least-32-characters';
const PUBLIC_ORIGIN = 'https://mesto.example';
const ADMIN_ID = '10000000-0000-4000-8000-000000000001';
const MERCHANT_ID = '20000000-0000-4000-8000-000000000001';
const VENUE_ID = '30000000-0000-4000-8000-000000000001';
const originalFetch = global.fetch;
const originalEnvironment = {
  MESTO_ADMIN_LOGIN: process.env.MESTO_ADMIN_LOGIN,
  MESTO_ADMIN_PASSWORD_HASH: process.env.MESTO_ADMIN_PASSWORD_HASH,
  MESTO_ADMIN_SESSION_SECRET: process.env.MESTO_ADMIN_SESSION_SECRET,
  MESTO_PUBLIC_ORIGIN: process.env.MESTO_PUBLIC_ORIGIN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

test.beforeEach(() => {
  process.env.MESTO_ADMIN_SESSION_SECRET = ADMIN_SECRET;
  process.env.MESTO_PUBLIC_ORIGIN = PUBLIC_ORIGIN;
  process.env.SUPABASE_URL = 'https://admin-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
});

test.afterEach(() => {
  global.fetch = originalFetch;
  configurePublicCacheInvalidation(null);
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
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

function adminToken() {
  return signSession({
    sub: 'phase8-admin',
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + 60
  }, ADMIN_SECRET);
}

function request(method, body, headers = {}) {
  return {
    method,
    body,
    headers: {
      cookie: `mesto_admin=${encodeURIComponent(adminToken())}`,
      origin: PUBLIC_ORIGIN,
      'sec-fetch-site': 'same-origin',
      ...headers
    },
    query: {},
    socket: { remoteAddress: 'phase8-admin-test' }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function assertPrivate(res) {
  assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.vary, 'Cookie');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-robots-tag'], 'noindex');
}

test('admin endpoints are private and unsafe requests fail closed before mutation', async () => {
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return jsonResponse({}); };
  const crossSite = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' };

  for (const [handler, req] of [
    [loginHandler, request('POST', {}, crossSite)],
    [logoutHandler, request('POST', {}, crossSite)],
    [reviewsHandler, request('PATCH', { id: ADMIN_ID, decision: 'approved' }, crossSite)],
    [venuesHandler, request('DELETE', { id: VENUE_ID }, crossSite)],
    [merchantsHandler, request('PATCH', { userId: MERCHANT_ID, status: 'suspended' }, crossSite)]
  ]) {
    const res = responseRecorder();
    await handler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'CSRF_CHECK_FAILED');
    assertPrivate(res);
  }
  assert.equal(fetchCalls, 0);
});

test('admin login preserves its response contract while issuing a scoped current session', async () => {
  process.env.MESTO_ADMIN_LOGIN = 'phase8-admin';
  process.env.MESTO_ADMIN_PASSWORD_HASH = hashPassword('Strong-Admin-Password-7');
  const res = responseRecorder();

  await loginHandler(request('POST', {
    login: 'phase8-admin',
    password: 'Strong-Admin-Password-7'
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { user: { login: 'phase8-admin', role: 'admin' } });
  const token = decodeURIComponent(res.headers['set-cookie'].match(/^mesto_admin=([^;]+)/)[1]);
  const session = verifySession(token, ADMIN_SECRET);
  assert.equal(session.typ, ADMIN_SESSION_TYPE);
  assert.equal(session.sub, 'phase8-admin');
  assertPrivate(res);
});

test('admin body and identifiers are rejected strictly before storage access', async () => {
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; return jsonResponse({}); };

  const invalidBody = responseRecorder();
  await reviewsHandler(request('PATCH', []), invalidBody);
  assert.equal(invalidBody.statusCode, 400);
  assert.equal(invalidBody.body.code, 'INVALID_BODY');

  const invalidModerationId = responseRecorder();
  await reviewsHandler(request('PATCH', { id: '------------------------------------', decision: 'approved' }), invalidModerationId);
  assert.equal(invalidModerationId.statusCode, 400);

  const invalidVenueId = responseRecorder();
  await venuesHandler(request('PATCH', {
    id: 'not-a-uuid',
    title: 'Venue',
    city: 'City',
    category: 'Cafe',
    description: 'Description'
  }), invalidVenueId);
  assert.equal(invalidVenueId.statusCode, 400);

  const invalidAssignments = responseRecorder();
  await merchantsHandler(request('POST', {
    displayName: 'Merchant',
    username: 'merchant',
    venueIds: [VENUE_ID, 'not-a-uuid'],
    membershipRole: 'owner',
    password: 'Temporary-Password-7'
  }), invalidAssignments);
  assert.equal(invalidAssignments.statusCode, 400);

  const oversizedBody = responseRecorder();
  await merchantsHandler(request('POST', { displayName: 'x'.repeat(260_000) }), oversizedBody);
  assert.equal(oversizedBody.statusCode, 413);
  assert.equal(oversizedBody.body.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(fetchCalls, 0);
});

test('merchant creation rejects an explicit weak password before storage access', async () => {
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Weak password must not reach merchant persistence');
  };

  const res = responseRecorder();
  await merchantsHandler(request('POST', {
    displayName: 'Merchant',
    username: 'merchant',
    venueIds: [VENUE_ID],
    membershipRole: 'owner',
    password: 'abcdefghij'
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: TEMPORARY_PASSWORD_ERROR_MESSAGE });
  assert.equal(fetchCalls, 0);
  assertPrivate(res);
});

test('merchant password reset rejects an explicit weak password before auth mutation', async () => {
  const calls = [];
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method || 'GET'} ${url.pathname}`);
    if (url.pathname === '/rest/v1/profiles' && (init?.method || 'GET') === 'GET') {
      return jsonResponse([{
        id: MERCHANT_ID,
        role: 'merchant',
        status: 'active',
        session_version: 0
      }]);
    }
    throw new Error(`Weak password must not reach auth mutation: ${url.pathname}`);
  };

  const res = responseRecorder();
  await merchantsHandler(request('PATCH', {
    userId: MERCHANT_ID,
    action: 'reset-password',
    password: '1234567890'
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { message: TEMPORARY_PASSWORD_ERROR_MESSAGE });
  assert.deepEqual(calls, ['GET /rest/v1/profiles']);
  assertPrivate(res);
});

test('admin dependency failures never expose Supabase details', async () => {
  global.fetch = async () => jsonResponse({
    message: 'SUPABASE_SERVICE_ROLE_KEY=must-not-leak',
    hint: 'private schema detail'
  }, 500);

  const res = responseRecorder();
  await dashboardHandler(request('GET'), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'ADMIN_SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('must-not-leak'), false);
  assert.equal(JSON.stringify(res.body).includes('private schema'), false);
  assertPrivate(res);
});

test('a failed audit cannot replace a successful venue deletion result', async () => {
  const calls = [];
  const invalidations = [];
  configurePublicCacheInvalidation({
    async invalidateVenue(details) {
      invalidations.push(details);
    }
  });
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method || 'GET'} ${url.pathname}`);
    if (url.pathname === '/rest/v1/venues' && init?.method === 'DELETE') {
      return jsonResponse([{ id: VENUE_ID }]);
    }
    if (url.pathname === '/rest/v1/audit_log') {
      return jsonResponse({ message: 'audit service unavailable' }, 503);
    }
    throw new Error(`Unexpected request: ${init?.method || 'GET'} ${url.pathname}`);
  };

  const res = responseRecorder();
  await venuesHandler(request('DELETE', { id: VENUE_ID }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(calls, ['DELETE /rest/v1/venues', 'POST /rest/v1/audit_log']);
  assert.deepEqual(invalidations, [{ id: VENUE_ID, slug: '', reason: 'venue.deleted' }]);
});

test('password reset reports post-commit metadata failure without hiding new credentials', async () => {
  let profileReads = 0;
  global.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/profiles' && (init?.method || 'GET') === 'GET') {
      profileReads += 1;
      return jsonResponse([{
        id: MERCHANT_ID,
        role: 'merchant',
        status: 'active',
        session_version: 2
      }]);
    }
    if (url.pathname === `/auth/v1/admin/users/${MERCHANT_ID}` && init?.method === 'PUT') {
      return jsonResponse({ user: { id: MERCHANT_ID } });
    }
    if (url.pathname === '/rest/v1/profiles' && init?.method === 'PATCH') {
      return jsonResponse({ message: 'metadata database failed' }, 503);
    }
    if (url.pathname === '/rest/v1/audit_log') return jsonResponse([]);
    throw new Error(`Unexpected request: ${init?.method || 'GET'} ${url.pathname}`);
  };

  const res = responseRecorder();
  await merchantsHandler(request('PATCH', {
    userId: MERCHANT_ID,
    action: 'reset-password',
    password: 'Temporary-Password-7'
  }), res);

  assert.equal(profileReads, 2);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.credentials.password, 'Temporary-Password-7');
  assert.equal(res.body.warning, 'PASSWORD_RESET_METADATA_PENDING');
});
