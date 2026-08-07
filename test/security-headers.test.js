const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const router = require('../api/router');
const configuredHeaders = require('../config/security-headers.json');
const { SECURITY_HEADERS } = require('../lib/security-headers');

const root = path.resolve(__dirname, '..');

function responseRecorder() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

test('Vercel applies the source-controlled security policy before API, static and SSR routing', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const globalRoute = vercel.routes[0];

  assert.deepEqual(globalRoute, {
    src: '^/(.*)$',
    headers: configuredHeaders,
    continue: true
  });
  assert.deepEqual(SECURITY_HEADERS, configuredHeaders);
  assert.ok(vercel.routes.findIndex((route) => route.handle === 'filesystem') > 0);
  assert.ok(vercel.routes.findIndex((route) => route.dest === '/api/router?route=$1') > 0);
  assert.ok(vercel.routes.findIndex((route) => route.dest === 'city/:citySlug') > 0);
});

test('CSP keeps required runtime sources narrow and documents compatibility exceptions', () => {
  const policy = SECURITY_HEADERS['Content-Security-Policy'];

  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /base-uri 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /form-action 'self'/);
  assert.match(policy, /connect-src 'self' https:\/\/fonts\.googleapis\.com https:\/\/fonts\.gstatic\.com/);
  assert.match(policy, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(policy, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  assert.match(policy, /img-src 'self' data: blob: https:/);
  assert.match(policy, /script-src 'self' 'unsafe-inline'/);
  assert.match(policy, /worker-src 'none'/);
  assert.match(policy, /frame-src 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*\*/);
  assert.doesNotMatch(policy, /connect-src[^;]*\*/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(SECURITY_HEADERS['Permissions-Policy'], 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
});

test('API router emits the same defense-in-depth headers outside the Vercel edge', async () => {
  const res = responseRecorder();

  await router({ method: 'GET', query: { route: 'missing' }, headers: {} }, res);

  assert.equal(res.statusCode, 404);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(res.headers[name.toLowerCase()], value, name);
  }
});
