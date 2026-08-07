const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ADMIN_SESSION_AUDIENCE,
  ADMIN_SESSION_MAX_AGE,
  ADMIN_SESSION_TYPE,
  ADMIN_SESSION_VERSION,
  createSessionCookie,
  hashPassword,
  parseCookies,
  signSession,
  validateAdminSessionSecret,
  verifyPassword,
  verifySession
} = require('../lib/security');

const STRONG_ADMIN_SECRET = 'admin-session-test-secret-that-is-at-least-32-characters';

test('password hashes verify only the original password', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong password', hash), false);
});

test('admin session rejects tampering and expired tokens', () => {
  const secret = 'a-secret-long-enough-for-the-test';
  const now = Math.floor(Date.now() / 1000);
  const valid = signSession({ sub: 'admin', role: 'admin', exp: now + 60 }, secret);
  assert.equal(verifySession(valid, secret)?.sub, 'admin');
  assert.equal(verifySession(`${valid}tampered`, secret), null);

  const expired = signSession({ sub: 'admin', role: 'admin', exp: now - 1 }, secret);
  assert.equal(verifySession(expired, secret), null);
});

test('admin session rejects non-admin roles', () => {
  const secret = 'another-test-secret';
  const token = signSession({ sub: 'visitor', role: 'user', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal(verifySession(token, secret), null);
});

test('new admin cookies carry isolated, bounded and non-deterministic claims', () => {
  const first = createSessionCookie('admin', STRONG_ADMIN_SECRET, 60);
  const second = createSessionCookie('admin', STRONG_ADMIN_SECRET, 60);
  const firstToken = parseCookies({ headers: { cookie: first } }).mesto_admin;
  const secondToken = parseCookies({ headers: { cookie: second } }).mesto_admin;
  const firstPayload = verifySession(firstToken, STRONG_ADMIN_SECRET);
  const secondPayload = verifySession(secondToken, STRONG_ADMIN_SECRET);

  assert.equal(firstPayload.typ, ADMIN_SESSION_TYPE);
  assert.equal(firstPayload.aud, ADMIN_SESSION_AUDIENCE);
  assert.equal(firstPayload.version, ADMIN_SESSION_VERSION);
  assert.equal(firstPayload.role, 'admin');
  assert.match(firstPayload.jti, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(firstPayload.jti, secondPayload.jti);
  assert.equal(firstPayload.exp - firstPayload.iat, 60);
  assert.match(first, /; HttpOnly; Secure; SameSite=Lax; Max-Age=60$/);
});

test('admin session rejects cross-context and malformed current claims', () => {
  const now = Math.floor(Date.now() / 1000);
  const current = {
    typ: ADMIN_SESSION_TYPE,
    aud: ADMIN_SESSION_AUDIENCE,
    version: ADMIN_SESSION_VERSION,
    sub: 'admin',
    role: 'admin',
    jti: 'abcdefghijklmnopqrstuv',
    iat: now,
    exp: now + 60
  };
  for (const payload of [
    { ...current, typ: 'mesto.user-session' },
    { ...current, aud: 'mesto.public' },
    { ...current, version: 2 },
    { ...current, sub: '' },
    { ...current, role: 'customer' },
    { ...current, jti: 'predictable' },
    { ...current, iat: now + 61 },
    { ...current, exp: current.iat + ADMIN_SESSION_MAX_AGE + 1 },
    { ...current, exp: now }
  ]) {
    assert.equal(verifySession(signSession(payload, STRONG_ADMIN_SECRET), STRONG_ADMIN_SECRET), null);
  }

  const valid = signSession(current, STRONG_ADMIN_SECRET);
  assert.equal(verifySession(`${valid}.extra`, STRONG_ADMIN_SECRET), null);
});

test('legacy admin tokens remain accepted only inside the bounded transition window', () => {
  const now = Math.floor(Date.now() / 1000);
  const validLegacy = { sub: 'legacy-admin', role: 'admin', exp: now + 60 };
  assert.equal(
    verifySession(signSession(validLegacy, STRONG_ADMIN_SECRET), STRONG_ADMIN_SECRET)?.sub,
    'legacy-admin'
  );
  const unboundedLegacy = { ...validLegacy, exp: now + ADMIN_SESSION_MAX_AGE + 1 };
  assert.equal(verifySession(signSession(unboundedLegacy, STRONG_ADMIN_SECRET), STRONG_ADMIN_SECRET), null);
  const confusedLegacy = { ...validLegacy, typ: 'mesto.user-session' };
  assert.equal(verifySession(signSession(confusedLegacy, STRONG_ADMIN_SECRET), STRONG_ADMIN_SECRET), null);
});

test('admin secrets must be strong and separate from customer session secrets', () => {
  assert.equal(validateAdminSessionSecret(STRONG_ADMIN_SECRET, 'different-user-secret-that-is-long-enough'), STRONG_ADMIN_SECRET);
  assert.throws(
    () => validateAdminSessionSecret('short', 'different-user-secret-that-is-long-enough'),
    (error) => error.code === 'ADMIN_SESSION_SECRET_INVALID' && error.statusCode === 503
  );
  assert.throws(
    () => validateAdminSessionSecret(STRONG_ADMIN_SECRET, STRONG_ADMIN_SECRET),
    (error) => error.code === 'ADMIN_SESSION_SECRET_REUSED' && error.statusCode === 503
  );
  assert.throws(() => createSessionCookie('', STRONG_ADMIN_SECRET, 60), /subject/);
  assert.throws(() => createSessionCookie('admin', STRONG_ADMIN_SECRET, ADMIN_SESSION_MAX_AGE + 1), /maxAge/);
});

test('cookie parsing ignores malformed encoding and prototype-like names', () => {
  const cookies = parseCookies({ headers: { cookie: 'broken=%E0%A4%A; safe=value; __proto__=ignored' } });
  assert.equal(cookies.broken, undefined);
  assert.equal(cookies.safe, 'value');
  assert.equal(cookies.__proto__, 'ignored');
  assert.equal(Object.getPrototypeOf(cookies), null);
});
