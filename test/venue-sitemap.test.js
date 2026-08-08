const test = require('node:test');
const assert = require('node:assert/strict');

const handler = require('../handlers/venue-sitemap');
const router = require('../api/router');
const { resetRateLimiterForTests } = require('../lib/rate-limit');

const originalFetch = global.fetch;
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

test.afterEach(() => {
  global.fetch = originalFetch;
  resetRateLimiterForTests();
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
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

function supabaseResponse(body, contentRange) {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-range' ? contentRange : null;
      }
    },
    async json() {
      return body;
    }
  };
}

test('GET /api/venue-sitemap returns an explicit unconfigured result without a database read', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = async () => {
    throw new Error('Unconfigured sitemap must not call Supabase');
  };
  const res = responseRecorder();

  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    databaseConfigured: false,
    complete: true,
    slugs: []
  });
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(res.headers.etag, undefined);
});

test('GET /api/venue-sitemap reads a small published catalog in one exact-count page', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const calls = [];
  global.fetch = async (input, options) => {
    calls.push({ url: new URL(String(input)), options });
    return supabaseResponse([
      { slug: 'alpha-place' },
      { slug: 'бета-место' }
    ], '0-1/2');
  };
  const res = responseRecorder();

  await handler({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    databaseConfigured: true,
    complete: true,
    slugs: ['alpha-place', 'бета-место']
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/rest/v1/venues');
  assert.equal(calls[0].url.searchParams.get('select'), 'slug');
  assert.equal(calls[0].url.searchParams.get('status'), 'eq.published');
  assert.equal(calls[0].url.searchParams.get('order'), 'slug.asc');
  assert.equal(calls[0].url.searchParams.get('limit'), '1000');
  assert.equal(calls[0].url.searchParams.get('offset'), '0');
  assert.equal(calls[0].options.headers.Prefer, 'count=exact');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]{32}"$/);
  assert.match(res.headers['cache-control'], /s-maxage=60/);
});

test('GET /api/venue-sitemap paginates beyond the provider row cap without losing slugs', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const allRows = Array.from({ length: 1001 }, (_, index) => ({ slug: `place-${String(index).padStart(4, '0')}` }));
  const offsets = [];
  global.fetch = async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    const page = allRows.slice(offset, offset + 1000);
    return supabaseResponse(page, `${offset}-${offset + page.length - 1}/${allRows.length}`);
  };
  const res = responseRecorder();

  await handler({ method: 'GET', query: { route: 'venue-sitemap' }, headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(offsets, [0, 1000]);
  assert.equal(res.body.slugs.length, 1001);
  assert.equal(res.body.slugs[0], 'place-0000');
  assert.equal(res.body.slugs.at(-1), 'place-1000');
});

test('GET /api/venue-sitemap fails closed when the exact-count batch is partial or lacks a count', async (t) => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  for (const [name, contentRange] of [
    ['partial', '0-1/3'],
    ['missing count', null],
    ['over the standard sitemap limit', '0-1/50001']
  ]) {
    await t.test(name, async () => {
      process.env.SUPABASE_URL = 'https://database.example';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      global.fetch = async () => supabaseResponse([
        { slug: 'alpha-place' },
        { slug: 'beta-place' }
      ], contentRange);
      const res = responseRecorder();

      await handler({ method: 'GET', headers: {} }, res);

      assert.equal(res.statusCode, 503);
      assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
      assert.equal(res.headers.etag, undefined);
      assert.equal(res.body.slugs, undefined);
    });
  }
});

test('GET /api/venue-sitemap rejects invalid and duplicate slugs instead of publishing partial XML inputs', async (t) => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  for (const [name, rows] of [
    ['non-canonical', [{ slug: 'Alpha-Place' }]],
    ['unsafe', [{ slug: '../admin' }]],
    ['duplicate', [{ slug: 'alpha-place' }, { slug: 'alpha-place' }]]
  ]) {
    await t.test(name, async () => {
      process.env.SUPABASE_URL = 'https://database.example';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      global.fetch = async () => supabaseResponse(rows, `0-${rows.length - 1}/${rows.length}`);
      const res = responseRecorder();

      await handler({ method: 'GET', headers: {} }, res);

      assert.equal(res.statusCode, 503);
      assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
      assert.equal(res.body.slugs, undefined);
    });
  }
});

test('POST /api/venue-sitemap is rejected without reading the database', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async () => {
    throw new Error('Method rejection must happen before Supabase');
  };
  const res = responseRecorder();

  await handler({ method: 'POST', headers: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('GET /api/venue-sitemap rejects cache-busting query parameters before database access', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async () => {
    throw new Error('Invalid query must not call Supabase');
  };
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: { route: 'venue-sitemap', nonce: 'cache-bypass' },
    headers: {}
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'INVALID_QUERY');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('GET /api/venue-sitemap applies the shared public-read rate limit before Supabase', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  let databaseReads = 0;
  global.fetch = async () => {
    databaseReads += 1;
    return supabaseResponse([{ slug: 'alpha-place' }], '0-0/1');
  };

  for (let index = 0; index < 30; index += 1) {
    const res = responseRecorder();
    await handler({ method: 'GET', query: { route: 'venue-sitemap' }, headers: {} }, res);
    assert.equal(res.statusCode, 200);
  }

  const blocked = responseRecorder();
  await handler({ method: 'GET', query: { route: 'venue-sitemap' }, headers: {} }, blocked);

  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.equal(blocked.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(databaseReads, 30);
});

test('the API router dispatches the dedicated venue-sitemap route', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = responseRecorder();

  await router({
    method: 'GET',
    query: { route: 'venue-sitemap' },
    headers: {}
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.complete, true);
  assert.equal(res.body.databaseConfigured, false);
  assert.match(res.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});
