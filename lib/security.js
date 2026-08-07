const crypto = require('node:crypto');

const SESSION_COOKIE = 'mesto_admin';
const ADMIN_SESSION_TYPE = 'mesto.admin-session';
const ADMIN_SESSION_AUDIENCE = 'mesto.admin';
const ADMIN_SESSION_VERSION = 1;
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;
const SESSION_SECRET_MIN_LENGTH = 32;

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
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const hasCurrentClaims = payload.typ === ADMIN_SESSION_TYPE
      && payload.aud === ADMIN_SESSION_AUDIENCE
      && payload.version === ADMIN_SESSION_VERSION;
    const hasLegacyClaims = payload.typ === undefined
      && payload.aud === undefined
      && payload.version === undefined
      && payload.jti === undefined;
    const issuedAtIsSafe = payload.iat === undefined
      ? hasLegacyClaims && payload.exp - now <= ADMIN_SESSION_MAX_AGE
      : Number.isInteger(payload.iat)
        && payload.iat <= now + 60
        && payload.iat <= payload.exp
        && payload.exp - payload.iat <= ADMIN_SESSION_MAX_AGE;
    const currentIdentifierIsSafe = hasLegacyClaims
      || (typeof payload.jti === 'string' && /^[A-Za-z0-9_-]{22}$/.test(payload.jti));
    if (
      (!hasCurrentClaims && !hasLegacyClaims)
      || typeof payload.sub !== 'string'
      || !payload.sub
      || payload.sub.length > 120
      || payload.role !== 'admin'
      || !Number.isInteger(payload.exp)
      || payload.exp <= now
      || !issuedAtIsSafe
      || !currentIdentifierIsSafe
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  return String(req.headers?.cookie || '').split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    const name = part.slice(0, separator).trim();
    if (!name) return result;
    try {
      result[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // A malformed cookie is ignored instead of taking down authentication.
    }
    return result;
  }, Object.create(null));
}

function validateAdminSessionSecret(secret, userSecret = process.env.MESTO_USER_SESSION_SECRET) {
  const normalized = String(secret || '');
  if (normalized.length < SESSION_SECRET_MIN_LENGTH || !normalized.trim()) {
    throw Object.assign(new Error('Секрет административной сессии не настроен.'), {
      statusCode: 503,
      code: 'ADMIN_SESSION_SECRET_INVALID'
    });
  }
  if (String(userSecret || '') && normalized === String(userSecret)) {
    throw Object.assign(new Error('Секреты административной и пользовательской сессий должны различаться.'), {
      statusCode: 503,
      code: 'ADMIN_SESSION_SECRET_REUSED'
    });
  }
  return normalized;
}

function createSessionCookie(login, secret, maxAge = ADMIN_SESSION_MAX_AGE) {
  const validatedSecret = validateAdminSessionSecret(secret);
  const subject = String(login || '').trim();
  if (!subject || subject.length > 120) throw new TypeError('Admin session subject is invalid');
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0 || maxAge > ADMIN_SESSION_MAX_AGE) {
    throw new TypeError('Admin session maxAge is invalid');
  }
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    typ: ADMIN_SESSION_TYPE,
    aud: ADMIN_SESSION_AUDIENCE,
    version: ADMIN_SESSION_VERSION,
    sub: subject,
    role: 'admin',
    jti: crypto.randomBytes(16).toString('base64url'),
    iat: now,
    exp: now + maxAge
  }, validatedSecret);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function adminSession(req) {
  try {
    const secret = validateAdminSessionSecret(process.env.MESTO_ADMIN_SESSION_SECRET);
    return verifySession(parseCookies(req)[SESSION_COOKIE], secret);
  } catch {
    return null;
  }
}

module.exports = {
  ADMIN_SESSION_AUDIENCE,
  ADMIN_SESSION_MAX_AGE,
  ADMIN_SESSION_TYPE,
  ADMIN_SESSION_VERSION,
  SESSION_COOKIE,
  adminSession,
  clearSessionCookie,
  createSessionCookie,
  hashPassword,
  parseCookies,
  signSession,
  validateAdminSessionSecret,
  verifyPassword,
  verifySession
};
