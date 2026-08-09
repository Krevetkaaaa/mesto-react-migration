const test = require('node:test');
const assert = require('node:assert/strict');

const {
  configurePublicCacheInvalidation,
  invalidatePublicVenueCache
} = require('../lib/public-cache');
const venueContentHandler = require('../handlers/venue-content');

const originalFetch = global.fetch;
const originalEnvironment = {
  MESTO_TELEMETRY_LOGS: process.env.MESTO_TELEMETRY_LOGS,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VERCEL: process.env.VERCEL
};

test.beforeEach(() => {
  configurePublicCacheInvalidation(null);
});

test.afterEach(() => {
  configurePublicCacheInvalidation(null);
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
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; },
    end() { this.ended = true; return this; }
  };
}

test('public venue cache invalidation has an explicit safe no-provider state', async () => {
  assert.deepEqual(await invalidatePublicVenueCache({ id: 'venue-1' }), {
    configured: false,
    requested: false
  });
});

test('public venue cache invalidation normalizes details for a configured adapter', async () => {
  const calls = [];
  configurePublicCacheInvalidation({
    async invalidateVenue(details) {
      calls.push(details);
    }
  });

  assert.deepEqual(await invalidatePublicVenueCache({ id: 17, slug: 'quiet-garden', reason: 'venue.updated' }), {
    configured: true,
    requested: true
  });
  assert.deepEqual(calls, [{ id: '17', slug: 'quiet-garden', reason: 'venue.updated' }]);
});

test('public cache purge failures emit only bounded operational telemetry', async (t) => {
  process.env.MESTO_TELEMETRY_LOGS = '1';
  const lines = [];
  t.mock.method(console, 'error', (line) => lines.push(JSON.parse(line)));
  configurePublicCacheInvalidation({
    async invalidateVenue() {
      throw Object.assign(new Error('private provider response'), { code: 'CACHE_PURGE_PROVIDER_UNAVAILABLE' });
    }
  });

  await assert.rejects(invalidatePublicVenueCache({
    id: '30000000-0000-4000-8000-000000000001',
    slug: 'must-not-be-logged',
  }), { code: 'CACHE_PURGE_PROVIDER_UNAVAILABLE' });
  assert.deepEqual(lines, [{
    level: 'error',
    event: 'cache.purge.failed',
    code: 'CACHE_PURGE_PROVIDER_UNAVAILABLE',
    scope: 'venue'
  }]);
  assert.doesNotMatch(JSON.stringify(lines), /private provider response|must-not-be-logged/);
});

test('public venue cache invalidation rejects an invalid adapter', () => {
  assert.throws(
    () => configurePublicCacheInvalidation({ invalidate() {} }),
    /invalidateVenue/
  );
});

test('public venue content uses the same CDN policy and entity validation', async () => {
  process.env.SUPABASE_URL = 'https://cache-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/rest/v1/menu_items') {
      return new Response(JSON.stringify([{ id: 'menu-1', venue_id: '30000000-0000-4000-8000-000000000001', section: 'Main', title: 'Soup', is_available: true, sort_order: 1 }]), { status: 200 });
    }
    if (url.pathname === '/rest/v1/promotions') return new Response('[]', { status: 200 });
    if (url.pathname === '/auth/v1/admin/users') return new Response(JSON.stringify({ users: [] }), { status: 200 });
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const request = {
    method: 'GET',
    query: { venueId: '30000000-0000-4000-8000-000000000001' },
    headers: {},
    socket: { remoteAddress: 'public-content-cache-test' }
  };
  const initial = responseRecorder();

  await venueContentHandler(request, initial);

  assert.equal(initial.statusCode, 200);
  assert.equal(initial.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  assert.equal(initial.headers['vercel-cdn-cache-control'], 'public, max-age=60, stale-while-revalidate=120');
  assert.equal(initial.headers['vercel-cache-tag'], 'mesto-venue-30000000-0000-4000-8000-000000000001');
  assert.match(initial.headers.etag, /^W\/"[A-Za-z0-9_-]{32}"$/);
  assert.equal(initial.body.menu[0].title, 'Soup');

  const conditional = responseRecorder();
  await venueContentHandler({ ...request, headers: { 'if-none-match': initial.headers.etag } }, conditional);
  assert.equal(conditional.statusCode, 304);
  assert.equal(conditional.body, null);
  assert.equal(conditional.headers.etag, initial.headers.etag);
  assert.equal(conditional.headers['vercel-cache-tag'], initial.headers['vercel-cache-tag']);
});
