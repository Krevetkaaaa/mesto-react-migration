const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../handlers/favorites');
const { signSession } = require('../lib/security');

const userId = '9aa8f050-486d-4d77-95d9-2dba1d633d07';
const originalFetch = global.fetch;
const originalEnvironment = {
  MESTO_ADMIN_SESSION_SECRET: process.env.MESTO_ADMIN_SESSION_SECRET,
  MESTO_PUBLIC_ORIGIN: process.env.MESTO_PUBLIC_ORIGIN,
  MESTO_USER_SESSION_SECRET: process.env.MESTO_USER_SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

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

function request(body) {
  const token = signSession({
    sub: userId,
    role: 'customer',
    sv: 0,
    exp: Math.floor(Date.now() / 1000) + 60
  }, process.env.MESTO_USER_SESSION_SECRET);
  return {
    method: 'POST',
    body,
    headers: {
      cookie: `mesto_session=${encodeURIComponent(token)}`,
      origin: 'https://mesto.example',
      'sec-fetch-site': 'same-origin'
    },
    socket: { remoteAddress: 'favorites-contract-test' }
  };
}

function configuredStore(savedPayloads) {
  delete process.env.MESTO_ADMIN_SESSION_SECRET;
  process.env.MESTO_PUBLIC_ORIGIN = 'https://mesto.example';
  process.env.MESTO_USER_SESSION_SECRET = 'favorites-test-secret-that-is-long-enough';
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/profiles') {
      return response([{ id: userId, role: 'customer', status: 'active', session_version: 0 }]);
    }
    if (url.pathname === '/rest/v1/favorites' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savedPayloads.push(payload);
      return response([{ ...payload, created_at: '2026-08-06T00:00:00.000Z' }]);
    }
    if (url.pathname === `/auth/v1/admin/users/${userId}` && options.method === 'GET') {
      return response({ user: { id: userId, user_metadata: {}, app_metadata: {} } });
    }
    throw new Error(`Unexpected request: ${options.method || 'GET'} ${url.pathname}`);
  };
}

function response(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    async json() { return body; }
  };
}

function snapshot(overrides = {}) {
  return {
    title: 'Quiet Garden',
    type: 'Restaurant',
    rating: '5',
    image: '/assets/quiet-garden.jpg',
    text: 'A saved venue',
    ...overrides
  };
}

test('POST /api/favorites whitelists a canonical optional slug and both local image forms', async () => {
  const savedPayloads = [];
  configuredStore(savedPayloads);

  const canonical = responseRecorder();
  await handler(request({
    venueKey: 'quiet-garden',
    snapshot: snapshot({ slug: ' QUIET-GARDEN ', ignored: 'not persisted' })
  }), canonical);
  const legacy = responseRecorder();
  await handler(request({
    venueKey: 'legacy-place',
    snapshot: snapshot({ image: 'assets/legacy-place.jpg' })
  }), legacy);

  assert.equal(canonical.statusCode, 201);
  assert.deepEqual(savedPayloads[0].snapshot, {
    slug: 'quiet-garden',
    title: 'Quiet Garden',
    type: 'Restaurant',
    rating: '5',
    image: '/assets/quiet-garden.jpg',
    text: 'A saved venue'
  });
  assert.equal(legacy.statusCode, 201);
  assert.equal(Object.hasOwn(savedPayloads[1].snapshot, 'slug'), false);
  assert.equal(savedPayloads[1].snapshot.image, 'assets/legacy-place.jpg');
});

test('POST /api/favorites rejects an unsafe snapshot slug before saving', async () => {
  const savedPayloads = [];
  configuredStore(savedPayloads);
  const res = responseRecorder();

  await handler(request({
    venueKey: 'unsafe-place',
    snapshot: snapshot({ slug: 'bad--slug' })
  }), res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(savedPayloads, []);
});
