const test = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../lib/supabase');
const {
  attemptPostCommit,
  classifyMerchantError,
  merchantHandlerError,
  setMerchantResponseHeaders
} = require('../lib/merchant-operations');

function response(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    getHeader(name) { return this.headers[name] ?? this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

async function withStoreFetch(fetchImpl, operation) {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  global.fetch = fetchImpl;
  process.env.SUPABASE_URL = 'https://merchant-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  try {
    return await operation(createStore());
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
}

test('merchant errors are classified without exposing dependency details', () => {
  assert.equal(classifyMerchantError(Object.assign(new Error('INVALID_JSON'), { statusCode: 400 })), 'invalid-json');
  assert.equal(classifyMerchantError({ statusCode: 409, message: 'duplicate internal row' }), 'conflict');
  assert.equal(classifyMerchantError({ statusCode: 400, details: { code: '23514', hint: 'private schema detail' } }), 'validation');
  assert.equal(classifyMerchantError({ statusCode: 401, message: 'service role rejected' }), 'unavailable');

  const res = responseRecorder();
  merchantHandlerError(res, { statusCode: 503, message: 'SUPABASE_SERVICE_ROLE_KEY=secret' }, 'Fallback');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    message: 'Сервис кабинета временно недоступен.',
    code: 'MERCHANT_SERVICE_UNAVAILABLE'
  });
  assert.equal(JSON.stringify(res.body).includes('secret'), false);
  assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');
});

test('merchant responses remain private across shared JSON helpers', () => {
  const res = responseRecorder();
  setMerchantResponseHeaders(res);
  merchantHandlerError(res, new Error('unexpected'), 'Не удалось выполнить действие.');

  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie');
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Robots-Tag'], 'noindex');
});

test('post-commit side effects cannot replace a confirmed mutation result', async () => {
  let completed = false;
  assert.equal(await attemptPostCommit(async () => { completed = true; }), true);
  assert.equal(completed, true);
  assert.equal(await attemptPostCommit(async () => { throw new Error('audit unavailable'); }), false);
});

test('menu database commit survives failed legacy metadata cleanup', async () => {
  const itemId = '50000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000001';
  const payload = { venue_id: '30000000-0000-4000-8000-000000000001', title: 'Soup' };
  const urls = [];

  const item = await withStoreFetch(async (url) => {
    urls.push(String(url));
    if (String(url).includes('/rest/v1/menu_items')) return response(200, [{ id: itemId, ...payload }]);
    return response(503, { message: 'auth cleanup unavailable', token: 'must-not-leak' });
  }, (store) => store.saveMenuItem(payload, itemId, userId));

  assert.equal(item.id, itemId);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/rest\/v1\/menu_items/);
  assert.match(urls[1], /\/auth\/v1\/admin\/users\//);
});

test('pre-commit database errors are not swallowed', async () => {
  let calls = 0;
  await assert.rejects(
    withStoreFetch(async () => {
      calls += 1;
      return response(503, { message: 'database unavailable' });
    }, (store) => store.savePromotion({ venue_id: '30000000-0000-4000-8000-000000000001', title: 'Sale' }, '', '20000000-0000-4000-8000-000000000001')),
    (error) => error.statusCode === 503
  );
  assert.equal(calls, 1);
});

test('legacy metadata fallback failure remains an authoritative failure', async () => {
  let calls = 0;
  await assert.rejects(
    withStoreFetch(async (url) => {
      calls += 1;
      if (String(url).includes('/rest/v1/promotions')) {
        return response(404, { message: 'relation does not exist', code: 'PGRST205' });
      }
      return response(503, { message: 'auth metadata unavailable' });
    }, (store) => store.savePromotion({ venue_id: '30000000-0000-4000-8000-000000000001', title: 'Sale' }, '', '20000000-0000-4000-8000-000000000001')),
    (error) => error.statusCode === 503
  );
  assert.equal(calls, 2);
});

test('database delete survives failed legacy metadata cleanup', async () => {
  const promotionId = '60000000-0000-4000-8000-000000000001';
  const removed = await withStoreFetch(async (url) => {
    if (String(url).includes('/rest/v1/promotions')) return response(200, [{ id: promotionId }]);
    return response(503, { message: 'auth cleanup unavailable' });
  }, (store) => store.deletePromotion(promotionId, '20000000-0000-4000-8000-000000000001'));

  assert.deepEqual(removed, [{ id: promotionId }]);
});
