const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { Readable } = require('node:stream');

const router = require('../api/router');
const { PUBLIC_CACHE_CONTROL, json, methodNotAllowed, publicJson, readJson } = require('../lib/http');

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

test('API router returns a JSON 404 for an unknown route', async () => {
  const res = responseRecorder();

  await router({ method: 'GET', query: { route: 'missing' }, headers: {} }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
  assert.match(res.headers['x-request-id'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(typeof res.body.message, 'string');
});

test('API router preserves a valid incoming request id', async () => {
  const requestId = '10000000-0000-4000-8000-000000000009';
  const req = { method: 'GET', query: { route: 'missing' }, headers: { 'x-request-id': requestId } };
  const res = responseRecorder();

  await router(req, res);

  assert.equal(req.requestId, requestId);
  assert.equal(res.headers['x-request-id'], requestId);
});

test('API router replaces an invalid incoming request id', async () => {
  const req = { method: 'GET', query: { route: 'missing' }, headers: { 'x-request-id': 'not-a-uuid' } };
  const res = responseRecorder();

  await router(req, res);

  assert.notEqual(req.requestId, 'not-a-uuid');
  assert.match(req.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(res.headers['x-request-id'], req.requestId);
});

test('API router accepts the Vercel array form of a nested route', async () => {
  const res = responseRecorder();

  await router({
    method: 'GET',
    query: { route: ['admin', 'session'] },
    headers: {},
    socket: { remoteAddress: 'router-contract-test' }
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
  assert.deepEqual(res.body, { authenticated: false });
});

test('methodNotAllowed preserves the Allow contract', () => {
  const res = responseRecorder();

  methodNotAllowed(res, ['GET', 'POST']);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET, POST');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
});

test('json preserves an explicit Cache-Control policy', () => {
  const res = responseRecorder();

  json(res, 200, { ok: true }, {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
  });

  assert.equal(res.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=120');
});

test('publicJson emits a stable weak ETag and honors If-None-Match', () => {
  const payload = { items: [{ id: 'venue-1', title: 'Mesto' }] };
  const initial = responseRecorder();

  publicJson({ headers: {} }, initial, payload);

  assert.equal(initial.statusCode, 200);
  assert.equal(initial.headers['cache-control'], PUBLIC_CACHE_CONTROL);
  assert.match(initial.headers.etag, /^W\/"[A-Za-z0-9_-]{32}"$/);
  assert.deepEqual(initial.body, payload);

  const conditional = responseRecorder();
  publicJson({ headers: { 'if-none-match': `"another", ${initial.headers.etag}` } }, conditional, payload);

  assert.equal(conditional.statusCode, 304);
  assert.equal(conditional.headers['cache-control'], PUBLIC_CACHE_CONTROL);
  assert.equal(conditional.headers.etag, initial.headers.etag);
  assert.equal(conditional.body, null);
  assert.equal(conditional.ended, true);
});

test('readJson parses a streamed JSON request and rejects invalid JSON', async () => {
  const valid = Readable.from(['{"name":"Mesto"}']);
  valid.body = undefined;
  assert.deepEqual(await readJson(valid, 100), { name: 'Mesto' });

  const invalid = Readable.from(['{"name":']);
  invalid.body = undefined;
  await assert.rejects(readJson(invalid, 100), (error) => error.statusCode === 400);
});

test('readJson enforces the byte limit for a streamed request', async () => {
  const request = Readable.from(['{"value":"1234567890"}']);
  request.body = undefined;

  await assert.rejects(readJson(request, 8), (error) => error.statusCode === 413);
});

test('readJson lets an HTTP handler return 413 without resetting the client socket', async (t) => {
  const server = createServer(async (request, response) => {
    try {
      await readJson(request, 32);
      response.writeHead(204).end();
    } catch (error) {
      response.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ code: error.message }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(256_000) })
  });

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { code: 'PAYLOAD_TOO_LARGE' });
});

test('readJson consumes a Vercel lazy-body stream without invoking its getter', async () => {
  const payload = '{"name":"Mesto","city":"Симферополь"}';
  const request = Readable.from([payload]);
  request.headers = { 'content-length': String(Buffer.byteLength(payload)) };
  let getterCalls = 0;
  Object.defineProperty(request, 'body', {
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error('lazy body getter must not be invoked');
    }
  });

  assert.deepEqual(await readJson(request, 200), { name: 'Mesto', city: 'Симферополь' });
  assert.equal(getterCalls, 0);
  for (const event of ['data', 'end', 'error', 'aborted']) {
    assert.equal(request.listenerCount(event), 0, `${event} listener must be cleaned up`);
  }
});

test('readJson measures authoritative rawBody bytes before JSON normalization', async () => {
  const raw = '  { "role": "user", "role": "\\u0061dmin" }  ';
  const parsed = { role: 'admin' };
  const normalizedBytes = Buffer.byteLength(JSON.stringify(parsed));
  assert.ok(Buffer.byteLength(raw) > normalizedBytes);

  await assert.rejects(readJson({
    rawBody: raw,
    body: parsed,
    headers: { 'content-length': String(Buffer.byteLength(raw)) }
  }, normalizedBytes), (error) => error.statusCode === 413);
});

test('readJson rejects invalid and mismatched Content-Length with authoritative bytes', async () => {
  const raw = Buffer.from('{"ok":true}');

  await assert.rejects(readJson({
    rawBody: raw,
    headers: { 'content-length': 'not-a-number' }
  }, 100), (error) => error.statusCode === 400 && error.message === 'INVALID_CONTENT_LENGTH');

  await assert.rejects(readJson({
    rawBody: new Uint8Array(raw),
    headers: { 'content-length': String(raw.length - 1) }
  }, 100), (error) => error.statusCode === 400 && error.message === 'CONTENT_LENGTH_MISMATCH');

  const streamed = Readable.from([raw]);
  streamed.body = undefined;
  streamed.headers = { 'content-length': String(raw.length + 1) };
  await assert.rejects(readJson(streamed, 100), (error) => (
    error.statusCode === 400 && error.message === 'CONTENT_LENGTH_MISMATCH'
  ));
});

test('readJson gives actual oversized bytes precedence over a forged small Content-Length', async () => {
  const raw = Buffer.from('{"value":"1234567890"}');

  await assert.rejects(readJson({
    rawBody: raw,
    headers: { 'content-length': '2' }
  }, 8), (error) => error.statusCode === 413);
});

test('readJson enforces the byte limit for a pre-parsed runtime body', async () => {
  const oversized = { body: { value: 'x'.repeat(100) } };

  await assert.rejects(readJson(oversized, 8), (error) => error.statusCode === 413);
  assert.deepEqual(await readJson(oversized, 200), oversized.body);
});

test('readJson keeps serialized size as a conservative fallback for pre-parsed bodies', async () => {
  const request = {
    body: { value: 'x'.repeat(100) },
    headers: { 'content-length': '2' }
  };

  await assert.rejects(readJson(request, 8), (error) => error.statusCode === 413);
  await assert.rejects(readJson({
    body: { ok: true },
    headers: { 'content-length': 'invalid' }
  }, 100), (error) => error.statusCode === 400);
});
