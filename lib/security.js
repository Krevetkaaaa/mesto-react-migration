const crypto = require('node:crypto');

const SESSION_COOKIE = 'mesto_admin';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16)) {
  const normalizedSalt = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'base64url');
  const digest = crypto.scryptSync(String(password), normalizedSalt, 64);
  return `scrypt$${normalizedSalt.toString('base64url')}$${digest.toString('base64url')}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expected] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'base64url'), 64);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function signSession(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySession(token, secret) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000) || payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    result[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return result;
  }, {});
}

function createSessionCookie(login, secret, maxAge = 60 * 60 * 12) {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ sub: login, role: 'admin', iat: now, exp: now + maxAge }, secret);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function adminSession(req) {
  const secret = process.env.MESTO_ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return verifySession(parseCookies(req)[SESSION_COOKIE], secret);
}

module.exports = {
  SESSION_COOKIE,
  adminSession,
  clearSessionCookie,
  createSessionCookie,
  hashPassword,
  parseCookies,
  signSession,
  verifyPassword,
  verifySession
};
