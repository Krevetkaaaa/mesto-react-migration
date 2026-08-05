const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const router = require('../api/router');
const { json, methodNotAllowed, readJson } = require('../lib/http');

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

test('API router returns a JSON 404 for an unknown route', async () => {
  const res = responseRecorder();

  await router({ method: 'GET', query: { route: 'missing' }, headers: {} }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(typeof res.body.message, 'string');
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

test('json currently overwrites an explicit public Cache-Control policy', () => {
  const res = responseRecorder();

  json(res, 200, { ok: true }, {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
  });

  // Characterization of the known phase 9 defect. The assertion must change
  // together with the helper fix and public/private cache contract tests.
  assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
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

test('readJson currently trusts a pre-parsed body without applying maxBytes', async () => {
  const oversized = { body: { value: 'x'.repeat(100) } };

  // Characterization of a known boundary gap. Phase 9 must replace this
  // behavior with a runtime-level and application-level size guarantee.
  assert.deepEqual(await readJson(oversized, 8), oversized.body);
});
