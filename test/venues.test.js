const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const handler = require('../handlers/venues');

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
      this.headers[name.toLowerCase()] = value;
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

function fetchJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async json() {
      return body;
    }
  };
}

test('GET /api/venues returns an empty Mesto catalog when the database is not configured', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  let externalFetches = 0;
  global.fetch = async () => {
    externalFetches += 1;
    throw new Error('The catalog must not call an external organization search');
  };

  const req = {
    method: 'GET',
    query: {},
    headers: {},
    socket: { remoteAddress: 'venues-contract-test' }
  };
  const res = responseRecorder();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.source, 'Место');
  assert.equal(res.body.count, 0);
  assert.equal(res.body.found, 0);
  assert.equal(res.body.persistentCount, 0);
  assert.equal(res.body.nextSkip, null);
  assert.equal(res.body.databaseConfigured, false);
  assert.equal(externalFetches, 0);
});

test('GET /api/venues?summary=1 exposes an explicit unconfigured summary without external reads', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = async () => {
    throw new Error('Unconfigured summary must not call Supabase');
  };
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: { summary: '1' },
    headers: {},
    socket: { remoteAddress: 'venues-summary-unconfigured-test' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    total: 0,
    byCategory: {},
    byCity: {},
    source: 'database',
    databaseConfigured: false
  });
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('GET /api/venues?summary=1 uses the aggregate RPC as its primary production path', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const calls = [];
  global.fetch = async (input, options) => {
    calls.push({ url: new URL(String(input)), options });
    return fetchJsonResponse(200, {
      total: 3,
      byCategory: { 'Рестораны': 2, 'Кофейни': 1 },
      byCity: { 'Симферополь': 2, 'Ялта': 1 }
    });
  };
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: { summary: '1' },
    headers: {},
    socket: { remoteAddress: 'venues-summary-rpc-test' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    total: 3,
    byCategory: { 'Рестораны': 2, 'Кофейни': 1 },
    byCity: { 'Симферополь': 2, 'Ялта': 1 },
    source: 'database',
    databaseConfigured: true
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/rest/v1/rpc/public_catalog_summary');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, '{}');
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  assert.equal(res.headers['vercel-cdn-cache-control'], 'public, max-age=60, stale-while-revalidate=120');
  assert.equal(res.headers['vercel-cache-tag'], 'mesto-venues');
});

test('catalog summary compatibility fallback paginates minimal published columns until empty', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const calls = [];
  const pages = [
    fetchJsonResponse(404, {
      code: 'PGRST202',
      message: 'Could not find the function public.public_catalog_summary in the schema cache'
    }),
    fetchJsonResponse(200, [
      { city: 'Симферополь', category: 'Рестораны' },
      { city: 'Ялта', category: 'Рестораны' }
    ]),
    fetchJsonResponse(200, [
      { city: 'Симферополь', category: 'Кофейни' },
      { city: '__proto__', category: 'constructor' },
      { city: 'toString', category: 'constructor' }
    ]),
    fetchJsonResponse(200, [])
  ];
  global.fetch = async (input, options) => {
    calls.push({ url: new URL(String(input)), options });
    return pages.shift();
  };
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: { summary: '1' },
    headers: {},
    socket: { remoteAddress: 'venues-summary-compatibility-test' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    total: 5,
    byCategory: Object.fromEntries([
      ['Рестораны', 2],
      ['Кофейни', 1],
      ['constructor', 2]
    ]),
    byCity: Object.fromEntries([
      ['Симферополь', 2],
      ['Ялта', 1],
      ['__proto__', 1],
      ['toString', 1]
    ]),
    source: 'database',
    databaseConfigured: true
  });
  assert.equal(calls[0].url.pathname, '/rest/v1/rpc/public_catalog_summary');
  assert.deepEqual(calls.slice(1).map(({ url }) => ({
    select: url.searchParams.get('select'),
    status: url.searchParams.get('status'),
    order: url.searchParams.get('order'),
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset')
  })), [
    { select: 'city,category', status: 'eq.published', order: 'id.asc', limit: '1000', offset: '0' },
    { select: 'city,category', status: 'eq.published', order: 'id.asc', limit: '1000', offset: '2' },
    { select: 'city,category', status: 'eq.published', order: 'id.asc', limit: '1000', offset: '5' }
  ]);
});

test('GET /api/venues reads published places only from the configured database', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: new URL(String(url)), options });
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-range' ? '0-0/4' : null },
      async json() {
        return [{
          id: 'venue-1',
          slug: 'stable-cafe-key',
          title: 'Cafe One',
          city: 'Simferopol',
          category: 'Cafe',
          cuisine: 'Italian',
          address: 'Main street, 1',
          description: 'A database venue',
          hours: '09:00-22:00',
          average_check: '1500',
          phone: '+70000000000',
          website: 'https://cafe.example',
          features: ['wifi'],
          longitude: 34.1,
          latitude: 44.9,
          photos: ['https://images.example/cafe.jpg'],
          source: 'editorial'
        }];
      }
    };
  };

  const req = {
    method: 'GET',
    query: { city: 'Simferopol', category: 'Cafe', query: 'Ital_ian', results: '2', skip: '0' },
    headers: {},
    socket: { remoteAddress: 'venues-database-contract-test' }
  };
  const res = responseRecorder();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'Место');
  assert.equal(res.body.databaseConfigured, true);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.found, 4);
  assert.equal(res.body.nextSkip, 2);
  assert.equal(res.body.items[0].name, 'Cafe One');
  assert.equal(res.body.items[0].slug, 'stable-cafe-key');
  assert.notEqual(res.body.items[0].slug, 'cafe-one');
  assert.equal(res.body.items[0].averageCheck, '1500');
  assert.match(res.body.items[0].mapsUrl, /^https:\/\/yandex\.ru\/maps\//);
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  assert.equal(res.headers['vercel-cache-tag'], 'mesto-venues');
  assert.match(res.headers.etag, /^W\/"[A-Za-z0-9_-]{32}"$/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://database.example');
  assert.equal(calls[0].url.pathname, '/rest/v1/venues');
  assert.equal(calls[0].url.searchParams.get('status'), 'eq.published');
  assert.notEqual(calls[0].url.searchParams.get('select'), '*');
  assert.match(calls[0].url.searchParams.get('select'), /id,slug,title/);
  assert.equal(calls[0].url.searchParams.get('city'), 'eq.Simferopol');
  assert.equal(calls[0].url.searchParams.get('category'), 'eq.Cafe');
  assert.equal(calls[0].url.searchParams.get('limit'), '2');
  assert.equal(calls[0].url.searchParams.get('offset'), '0');
  assert.equal(calls[0].url.searchParams.get('order'), 'created_at.desc,id.desc');
  assert.equal(calls[0].options.headers.Prefer, 'count=exact');
  assert.doesNotMatch(calls[0].url.searchParams.get('or'), /_/);
});

test('GET /api/venues keeps unconfigured and failed catalog responses out of shared caches', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: {},
    headers: {},
    socket: { remoteAddress: 'venues-no-cache-contract-test' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(res.headers.etag, undefined);
});

test('GET /api/venues never derives a missing stable slug from the title', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => '0-0/1' },
    async json() {
      return [{
        id: 'venue-without-slug',
        title: 'Do Not Generate This Slug',
        city: 'Simferopol',
        status: 'published'
      }];
    }
  });
  const res = responseRecorder();

  await handler({
    method: 'GET',
    query: {},
    headers: {},
    socket: { remoteAddress: 'venues-missing-slug-contract-test' }
  }, res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.items, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /do-not-generate-this-slug/i);
});

test('organization search is absent while Yandex OAuth and map links remain available', () => {
  const root = path.resolve(__dirname, '..');
  const venuesHandler = fs.readFileSync(path.join(root, 'handlers', 'venues.js'), 'utf8');
  const environmentExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const oauthProviders = fs.readFileSync(path.join(root, 'lib', 'oauth-providers.js'), 'utf8');
  const clientApp = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.doesNotMatch(venuesHandler, /searchOrganizations|lib\/yandex|YANDEX_ORG_SEARCH/i);
  assert.doesNotMatch(environmentExample, /YANDEX_ORG_SEARCH/i);
  assert.match(oauthProviders, /oauth\.yandex\.ru/);
  assert.match(clientApp, /https:\/\/yandex\.ru\/maps/);
});
