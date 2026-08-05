const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  signSession,
  verifyPassword,
  verifySession
} = require('../lib/security');

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
