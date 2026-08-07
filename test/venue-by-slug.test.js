const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../api/router');
const handler = require('../handlers/venue');

const originalFetch = global.fetch;
const originalEnvironment = {
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
    },
    end() {
      this.ended = true;
      return this;
    }
  };
}

function request(query, remoteAddress) {
  return {
    method: 'GET',
    query,
    headers: {},
    socket: { remoteAddress }
  };
}

function configuredDatabase() {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
}

function publishedVenue(overrides = {}) {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    slug: 'тихий-сад',
    title: 'Тихий сад',
    city: 'Симферополь',
    category: 'Ресторан',
    cuisine: 'Европейская',
    description: 'Описание',
    address: 'Улица, 1',
    phone: '',
    website: '',
    hours: '10:00–22:00',
    average_check: '1 200 ₽',
    features: ['Wi-Fi'],
    photos: [],
    source: 'editorial',
    status: 'published',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    ...overrides
  };
}

test('GET /api/venues/:slug reports an unconfigured database without fetching', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetches = 0;
  global.fetch = async () => {
    fetches += 1;
    throw new Error('must not fetch');
  };
  const res = responseRecorder();

  await handler(request({ slug: 'quiet-garden' }, 'venue-slug-unconfigured'), res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    code: 'DATABASE_UNAVAILABLE',
    message: 'Каталог временно недоступен.'
  });
  assert.equal(fetches, 0);
});

test('GET /api/venues/:slug normalizes a Unicode slug and selects a published row only', async () => {
  configuredDatabase();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return [publishedVenue()];
      }
    };
  };
  const res = responseRecorder();

  await router(request({ route: 'venues/%D0%A2%D0%98%D0%A5%D0%98%D0%99-%D0%A1%D0%90%D0%94' }, 'venue-slug-published'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.venue.title, 'Тихий сад');
  assert.equal(res.body.venue.status, 'published');
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]{32}"$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/rest/v1/venues');
  assert.equal(calls[0].url.searchParams.get('status'), 'eq.published');
  assert.equal(calls[0].url.searchParams.get('slug'), 'eq.тихий-сад');
  assert.equal(calls[0].url.searchParams.get('limit'), '1');
  assert.doesNotMatch(calls[0].url.searchParams.get('select'), /created_by|owner|membership/);
});

test('GET /api/venues/:slug returns 304 for the current entity tag', async () => {
  configuredDatabase();
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    async json() { return [publishedVenue({ slug: 'quiet-garden' })]; }
  });
  const initial = responseRecorder();
  await handler(request({ slug: 'quiet-garden' }, 'venue-slug-etag-initial'), initial);

  const conditionalRequest = request({ slug: 'quiet-garden' }, 'venue-slug-etag-conditional');
  conditionalRequest.headers['if-none-match'] = initial.headers.etag;
  const conditional = responseRecorder();
  await handler(conditionalRequest, conditional);

  assert.equal(conditional.statusCode, 304);
  assert.equal(conditional.body, null);
  assert.equal(conditional.headers.etag, initial.headers.etag);
  assert.equal(conditional.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
});

test('GET /api/venues/:slug returns 404 for absent and unpublished rows', async (t) => {
  for (const [name, rows] of [
    ['absent', []],
    ['unpublished', [publishedVenue({ status: 'draft' })]],
    ['wrong published slug', [publishedVenue({ slug: 'another-place' })]]
  ]) {
    await t.test(name, async () => {
      configuredDatabase();
      global.fetch = async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() { return rows; }
      });
      const res = responseRecorder();

      await handler(request({ slug: 'тихий-сад' }, `venue-slug-${name}`), res);

      assert.equal(res.statusCode, 404);
      assert.deepEqual(res.body, {
        code: 'VENUE_NOT_FOUND',
        message: 'Заведение не найдено.'
      });
    });
  }
});

test('GET /api/venues/:slug rejects malformed slugs before database access', async () => {
  configuredDatabase();
  let fetches = 0;
  global.fetch = async () => {
    fetches += 1;
    throw new Error('must not fetch');
  };

  for (const slug of ['', 'bad--slug', 'bad/slug', 'bad%2Fslug', 'bad_slug', '<script>', 'δοκιμή']) {
    const res = responseRecorder();
    await handler(request({ slug }, `venue-slug-malformed-${slug}`), res);
    assert.equal(res.statusCode, 400, slug);
    assert.equal(res.body.code, 'INVALID_VENUE_SLUG');
  }
  assert.equal(fetches, 0);
});

test('GET /api/venues/:slug returns a stable 500 contract without leaking upstream errors', async () => {
  configuredDatabase();
  global.fetch = async () => {
    throw new Error('service role key leaked here');
  };
  const res = responseRecorder();

  await handler(request({ slug: 'quiet-garden' }, 'venue-slug-upstream-error'), res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    code: 'VENUE_LOOKUP_FAILED',
    message: 'Не удалось загрузить заведение.'
  });
  assert.doesNotMatch(JSON.stringify(res.body), /service role/i);
});
