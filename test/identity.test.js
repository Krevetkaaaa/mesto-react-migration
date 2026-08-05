const test = require('node:test');
const assert = require('node:assert/strict');
const {
  contactEmail,
  decodeSession,
  isInternalEmail,
  isStrongPassword,
  normalizeUsername,
  publicUser
} = require('../lib/identity');
const { signSession } = require('../lib/security');
const { uuid } = require('../lib/http');

test('user session accepts a signed current token and rejects tampering', () => {
  const secret = 'test-user-session-secret';
  const payload = { sub: '9aa8f050-486d-4d77-95d9-2dba1d633d07', role: 'customer', sv: 2, exp: Math.floor(Date.now() / 1000) + 60 };
  const token = signSession(payload, secret);
  assert.deepEqual(decodeSession(token, secret), payload);
  assert.equal(decodeSession(`${token}x`, secret), null);
  assert.equal(decodeSession(signSession({ ...payload, exp: 1 }, secret), secret), null);
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
