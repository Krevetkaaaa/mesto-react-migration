const test = require('node:test');
const assert = require('node:assert/strict');
const {
  USER_SESSION_AUDIENCE,
  USER_SESSION_TYPE,
  USER_SESSION_VERSION,
  contactEmail,
  decodeSession,
  isInternalEmail,
  isStrongPassword,
  normalizeUsername,
  publicUser,
  sessionCookie
} = require('../lib/identity');
const { signSession } = require('../lib/security');
const { uuid } = require('../lib/http');

test('user session accepts a signed current token and rejects tampering', () => {
  const secret = 'test-user-session-secret-that-is-long-enough';
  const payload = { sub: '9aa8f050-486d-4d77-95d9-2dba1d633d07', role: 'customer', sv: 2, exp: Math.floor(Date.now() / 1000) + 60 };
  const token = signSession(payload, secret);
  assert.deepEqual(decodeSession(token, secret), payload);
  assert.equal(decodeSession(`${token}x`, secret), null);
  assert.equal(decodeSession(signSession({ ...payload, exp: 1 }, secret), secret), null);
});

test('user session cookie requires a dedicated strong secret and emits typed claims', () => {
  const previous = {
    admin: process.env.MESTO_ADMIN_SESSION_SECRET,
    user: process.env.MESTO_USER_SESSION_SECRET
  };
  const profile = {
    id: '9aa8f050-486d-4d77-95d9-2dba1d633d07',
    role: 'customer',
    email: 'user@example.com',
    session_version: 3
  };
  try {
    process.env.MESTO_ADMIN_SESSION_SECRET = 'admin-session-secret-that-is-long-enough';
    delete process.env.MESTO_USER_SESSION_SECRET;
    assert.throws(() => sessionCookie(profile), (error) => error.code === 'USER_SESSION_SECRET_INVALID' && error.statusCode === 503);

    process.env.MESTO_USER_SESSION_SECRET = process.env.MESTO_ADMIN_SESSION_SECRET;
    assert.throws(() => sessionCookie(profile), (error) => error.code === 'USER_SESSION_SECRET_REUSED' && error.statusCode === 503);

    process.env.MESTO_USER_SESSION_SECRET = 'dedicated-user-session-secret-that-is-long-enough';
    const cookie = sessionCookie(profile, 60);
    const token = decodeURIComponent(cookie.match(/^mesto_session=([^;]+)/)[1]);
    const payload = decodeSession(token, process.env.MESTO_USER_SESSION_SECRET);
    assert.equal(payload.typ, USER_SESSION_TYPE);
    assert.equal(payload.aud, USER_SESSION_AUDIENCE);
    assert.equal(payload.version, USER_SESSION_VERSION);
    assert.equal(payload.sub, profile.id);
    assert.equal(payload.sv, 3);
  } finally {
    if (previous.admin === undefined) delete process.env.MESTO_ADMIN_SESSION_SECRET;
    else process.env.MESTO_ADMIN_SESSION_SECRET = previous.admin;
    if (previous.user === undefined) delete process.env.MESTO_USER_SESSION_SECRET;
    else process.env.MESTO_USER_SESSION_SECRET = previous.user;
  }
});

test('user session accepts only strictly shaped legacy tokens and rejects claim confusion', () => {
  const secret = 'legacy-user-session-secret-that-is-long-enough';
  const now = Math.floor(Date.now() / 1000);
  const legacy = { sub: 'legacy-user', role: 'customer', sv: 0, iat: now, exp: now + 60 };
  assert.deepEqual(decodeSession(signSession(legacy, secret), secret), legacy);
  assert.equal(decodeSession(signSession({ ...legacy, typ: 'oauth-state' }, secret), secret), null);
  assert.equal(decodeSession(signSession({ ...legacy, aud: 'admin' }, secret), secret), null);
  assert.equal(decodeSession(signSession({ ...legacy, sv: '0' }, secret), secret), null);
});

test('uuid parser accepts canonical UUIDs only', () => {
  assert.equal(uuid('9AA8F050-486D-4D77-95D9-2DBA1D633D07'), '9aa8f050-486d-4d77-95d9-2dba1d633d07');
  assert.equal(uuid('12345678------------------------------------'), '');
  assert.equal(uuid('not-a-uuid'), '');
});

test('registration credentials use a stable username and strong password policy', () => {
  assert.equal(normalizeUsername('  Alex.User  '), 'alex.user');
  assert.equal(isStrongPassword('Test-test-2026!'), true);
  assert.equal(isStrongPassword('onlyletters'), false);
  assert.equal(isStrongPassword('1234567890'), false);
});

test('internal OAuth aliases are never exposed as contact email', () => {
  const profile = {
    id: '9aa8f050-486d-4d77-95d9-2dba1d633d07',
    username: 'vk-77',
    display_name: 'Анна Место',
    email: 'vk-77@oauth.mesto.invalid',
    email_is_internal: true,
    role: 'customer',
    status: 'active'
  };
  assert.equal(isInternalEmail(profile), true);
  assert.equal(contactEmail(profile), '');
  assert.equal(publicUser(profile).email, '');
  assert.equal(publicUser(profile).hasEmail, false);
  assert.equal(contactEmail({ email: 'REAL@EXAMPLE.COM' }), 'real@example.com');
});
