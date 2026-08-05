const test = require('node:test');
const assert = require('node:assert/strict');
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
