const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { canonicalOAuthStartUrl, redirectToCanonicalOAuthStart } = require('../lib/oauth-flow');
const {
  OAUTH_MAX_AGE_SECONDS,
  clearOAuthCookie,
  createOAuthTransaction,
  pkceChallenge,
  readOAuthTransaction,
  strictReturnTarget
} = require('../lib/oauth-state');

function requestWithCookie(cookie) {
  return { headers: { cookie: cookie.split(';')[0] } };
}

function exampleEnvironmentValue(name) {
  const contents = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
  const prefix = `${name}=`;
  const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

test.beforeEach(() => {
  process.env.MESTO_USER_SESSION_SECRET = 'oauth-test-secret-that-is-definitely-long-enough';
  process.env.MESTO_PUBLIC_ORIGIN = 'https://mesto.example';
});

test('OAuth transaction uses S256, a strong state, and a signed transient cookie', () => {
  const issued = 1_800_000_000_000;
  const transaction = createOAuthTransaction('vk', '/profile?from=oauth', issued);
  assert.match(transaction.state, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(transaction.verifier.length >= 43);
  assert.equal(transaction.challenge, pkceChallenge(transaction.verifier));
  assert.equal(transaction.callbackUrl, 'https://mesto.example/api/auth/oauth-vk-callback');
  assert.match(transaction.cookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);

  const restored = readOAuthTransaction(
    requestWithCookie(transaction.cookie),
    'vk',
    transaction.state,
    issued + 1_000
  );
  assert.equal(restored.verifier, transaction.verifier);
  assert.equal(restored.returnTo, '/profile?from=oauth');
});

test('OAuth transaction rejects state tampering and expiration', () => {
  const issued = 1_800_000_000_000;
  const transaction = createOAuthTransaction('yandex', '/', issued);
  const request = requestWithCookie(transaction.cookie);
  assert.throws(() => readOAuthTransaction(request, 'yandex', `${transaction.state}x`, issued + 1_000), /OAUTH_STATE_INVALID/);
  assert.throws(
    () => readOAuthTransaction(request, 'yandex', transaction.state, issued + (OAUTH_MAX_AGE_SECONDS + 1) * 1_000),
    /OAUTH_STATE_INVALID/
  );
});

test('OAuth return targets stay on the Mesto origin', () => {
  assert.equal(strictReturnTarget('/catalog?city=Ялта#places'), '/catalog?city=%D0%AF%D0%BB%D1%82%D0%B0#places');
  assert.equal(strictReturnTarget('https://evil.example/'), '/');
  assert.equal(strictReturnTarget('//evil.example/'), '/');
  assert.equal(strictReturnTarget('/\\evil.example'), '/');
  assert.equal(strictReturnTarget('/%2f%2fevil.example'), '/');
  assert.equal(strictReturnTarget('/%5c%5cevil.example'), '/');
  assert.match(clearOAuthCookie('vk'), /Max-Age=0/);
});

test('OAuth starts on the configured branch origin before any host-only state cookie is issued', () => {
  process.env.MESTO_PUBLIC_ORIGIN = 'https://branch-preview.vercel.app';
  assert.equal(canonicalOAuthStartUrl({
    headers: { host: 'branch-preview.vercel.app' },
    query: { returnTo: '/favorites' },
  }, 'yandex'), '');
  assert.equal(canonicalOAuthStartUrl({
    headers: { host: 'immutable-preview.vercel.app' },
    query: { returnTo: '/favorites' },
  }, 'yandex'), 'https://branch-preview.vercel.app/api/auth/oauth?provider=yandex&returnTo=%2Ffavorites');
  assert.equal(canonicalOAuthStartUrl({
    headers: { host: 'immutable-preview.vercel.app' },
    query: { returnTo: 'https://evil.example' },
  }, 'vk'), 'https://branch-preview.vercel.app/api/auth/oauth?provider=vk');

  const response = {
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end() { this.ended = true; return this; },
  };
  assert.equal(redirectToCanonicalOAuthStart({
    headers: { host: 'immutable-preview.vercel.app' },
    query: { returnTo: '/favorites' },
  }, response, 'yandex'), true);
  assert.equal(response.statusCode, 307);
  assert.equal(response.headers.location, 'https://branch-preview.vercel.app/api/auth/oauth?provider=yandex&returnTo=%2Ffavorites');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.ended, true);
});

test('.env.example keeps local OAuth canonicalization off Production without network access', () => {
  const configuredOrigin = exampleEnvironmentValue('MESTO_PUBLIC_ORIGIN');
  assert.equal(configuredOrigin, 'http://127.0.0.1:4173');
  assert.doesNotMatch(configuredOrigin, /mesto-city-guide\.vercel\.app/i);

  const previousOrigin = process.env.MESTO_PUBLIC_ORIGIN;
  const previousFetch = global.fetch;
  let networkRequests = 0;
  try {
    process.env.MESTO_PUBLIC_ORIGIN = configuredOrigin;
    global.fetch = async () => {
      networkRequests += 1;
      throw new Error('OAuth canonicalization must be zero-network');
    };
    assert.equal(canonicalOAuthStartUrl({
      headers: { host: '127.0.0.1:4173' },
      query: { returnTo: '/favorites' },
    }, 'vk'), '');
    const canonical = canonicalOAuthStartUrl({
      headers: { host: 'localhost:4173' },
      query: { returnTo: '/favorites' },
    }, 'vk');
    assert.equal(canonical, 'http://127.0.0.1:4173/api/auth/oauth?provider=vk&returnTo=%2Ffavorites');
    assert.doesNotMatch(canonical, /mesto-city-guide\.vercel\.app/i);
    assert.equal(networkRequests, 0);
  } finally {
    if (previousOrigin === undefined) delete process.env.MESTO_PUBLIC_ORIGIN;
    else process.env.MESTO_PUBLIC_ORIGIN = previousOrigin;
    global.fetch = previousFetch;
  }
});
