const crypto = require('node:crypto');
const { json } = require('./http');
const { authRequest, createStore } = require('./supabase');
const { parseCookies, signSession } = require('./security');
const { requireSameOrigin } = require('./same-origin');
const { isStrongPassword } = require('../password-policy.mjs');

const USER_COOKIE = 'mesto_session';
const SESSION_AGE = 60 * 60 * 24 * 7;
const USER_SESSION_TYPE = 'mesto.user-session';
const USER_SESSION_AUDIENCE = 'mesto.public';
const USER_SESSION_VERSION = 1;
const USER_SESSION_SECRET_MIN_LENGTH = 32;

function sessionSecret() {
  const secret = String(process.env.MESTO_USER_SESSION_SECRET || '');
  if (secret.length < USER_SESSION_SECRET_MIN_LENGTH || !secret.trim()) {
    throw Object.assign(new Error('Секрет пользовательской сессии не настроен.'), {
      statusCode: 503,
      code: 'USER_SESSION_SECRET_INVALID'
    });
  }
  const adminSecret = String(process.env.MESTO_ADMIN_SESSION_SECRET || '');
  if (adminSecret && secret === adminSecret) {
    throw Object.assign(new Error('Секреты пользовательской и административной сессий должны различаться.'), {
      statusCode: 503,
      code: 'USER_SESSION_SECRET_REUSED'
    });
  }
  return secret;
}

function decodeSession(token, secret = sessionSecret()) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    const hasCurrentClaims = payload.typ === USER_SESSION_TYPE
      && payload.aud === USER_SESSION_AUDIENCE
      && payload.version === USER_SESSION_VERSION;
    const hasLegacyClaims = payload.typ === undefined
      && payload.aud === undefined
      && payload.version === undefined;
    const issuedAtIsSafe = payload.iat === undefined
      ? hasLegacyClaims && payload.exp - now <= SESSION_AGE
      : Number.isInteger(payload.iat)
        && payload.iat <= now + 60
        && payload.iat <= payload.exp
        && payload.exp - payload.iat <= SESSION_AGE;
    if (
      (!hasCurrentClaims && !hasLegacyClaims)
      || typeof payload.sub !== 'string'
      || !payload.sub
      || !['customer', 'merchant', 'admin'].includes(payload.role)
      || !Number.isInteger(payload.sv)
      || payload.sv < 0
      || !Number.isInteger(payload.exp)
      || payload.exp <= now
      || !issuedAtIsSafe
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

function sessionCookie(profile, maxAge = SESSION_AGE) {
  const secret = sessionSecret();
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    typ: USER_SESSION_TYPE,
    aud: USER_SESSION_AUDIENCE,
    version: USER_SESSION_VERSION,
    sub: profile.id,
    role: profile.role,
    email: contactEmail(profile),
    sv: Number(profile.session_version || 0),
    iat: now,
    exp: now + maxAge
  }, secret);
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${USER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${USER_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

function isInternalEmail(profile) {
  const address = String(profile?.email || '').trim().toLowerCase();
  return Boolean(profile?.email_is_internal) || /@oauth\.mesto\.invalid$/i.test(address);
}

function contactEmail(profile) {
  return isInternalEmail(profile) ? '' : String(profile?.email || '').trim().toLowerCase();
}

function publicUser(profile) {
  const address = contactEmail(profile);
  return {
    id: profile.id,
    username: profile.username || '',
    name: profile.display_name || address.split('@')[0] || 'Пользователь',
    email: address,
    hasEmail: Boolean(address),
    phone: profile.phone || '',
    role: profile.role,
    status: profile.status,
    mustChangePassword: Boolean(profile.must_change_password)
  };
}

async function currentUser(req) {
  const token = parseCookies(req)[USER_COOKIE];
  if (!token) return null;
  const payload = decodeSession(token, sessionSecret());
  if (!payload) return null;
  const profile = await createStore().profileById(payload.sub);
  if (!profile || profile.status !== 'active' || profile.role !== payload.role || Number(profile.session_version || 0) !== Number(payload.sv || 0)) return null;
  return profile;
}

async function requireUser(req, res, roles = ['customer', 'merchant', 'admin']) {
  if (!requireSameOrigin(req, res)) return null;
  let profile;
  try {
    profile = await currentUser(req);
  } catch {
    json(res, 503, { message: 'Сервис профиля временно недоступен.', code: 'AUTH_SERVICE_UNAVAILABLE' });
    return null;
  }
  if (!profile) {
    json(res, 401, { message: 'Войдите или зарегистрируйтесь, чтобы продолжить.', code: 'AUTH_REQUIRED' });
    return null;
  }
  if (!roles.includes(profile.role)) {
    json(res, 403, { message: 'Для этого действия недостаточно прав.', code: 'FORBIDDEN' });
    return null;
  }
  return profile;
}

function normalizeUsername(value, fallback) {
  return String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function createManagedUser({ email, password, displayName, username, role = 'customer', status = 'active', mustChangePassword = false, emailIsInternal = false }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedUsername = normalizeUsername(username, normalizedEmail.split('@')[0]);
  if (!normalizedUsername) throw Object.assign(new Error('Укажите корректный логин.'), { statusCode: 400 });
  const existingUsername = await createStore().profileByLogin(normalizedUsername);
  if (existingUsername) throw Object.assign(new Error('Этот логин уже занят.'), { statusCode: 409, code: 'USERNAME_TAKEN' });
  const auth = await authRequest('admin/users', {
    method: 'POST',
    body: {
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || '', username: normalizedUsername },
      app_metadata: { mesto_role: role, mesto_status: status, must_change_password: Boolean(mustChangePassword), mesto_session_version: 0, mesto_email_is_internal: Boolean(emailIsInternal) }
    }
  });
  const authUser = auth.user || auth;
  try {
    const profile = await createStore().saveProfile({
      id: authUser.id,
      username: normalizedUsername,
      display_name: String(displayName || '').trim(),
      email: normalizedEmail,
      email_is_internal: Boolean(emailIsInternal),
      role,
      status,
      must_change_password: Boolean(mustChangePassword),
      session_version: 0
    });
    return profile;
  } catch (error) {
    await authRequest(`admin/users/${authUser.id}`, { method: 'DELETE' }).catch(() => null);
    throw error;
  }
}

async function signIn(login, password) {
  const store = createStore();
  const profile = await store.profileByLogin(login);
  if (!profile || profile.status !== 'active') throw Object.assign(new Error('Неверный логин или пароль.'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  let session;
  try {
    session = await authRequest('token?grant_type=password', { method: 'POST', body: { email: profile.email, password } });
  } catch {
    throw Object.assign(new Error('Неверный логин или пароль.'), { statusCode: 401, code: 'INVALID_CREDENTIALS' });
  }
  if (session?.user?.id !== profile.id) throw Object.assign(new Error('Не удалось подтвердить аккаунт.'), { statusCode: 401 });
  await store.updateProfile(profile.id, { last_login_at: new Date().toISOString() }).catch(() => null);
  return profile;
}

async function changePassword(profile, password) {
  await authRequest(`admin/users/${profile.id}`, { method: 'PUT', body: { password } });
  return createStore().updateProfile(profile.id, { must_change_password: false, session_version: Number(profile.session_version || 0) + 1 });
}

async function resetManagedPassword(userId, password) {
  const store = createStore();
  const profile = await store.profileById(userId);
  if (!profile || profile.role !== 'merchant') throw Object.assign(new Error('Аккаунт ресторатора не найден.'), { statusCode: 404 });
  await authRequest(`admin/users/${userId}`, { method: 'PUT', body: { password } });
  try {
    const updatedProfile = await store.updateProfile(userId, {
      must_change_password: true,
      session_version: Number(profile.session_version || 0) + 1
    });
    return { profile: updatedProfile, securityMetadataUpdated: true };
  } catch {
    return { profile, securityMetadataUpdated: false };
  }
}

function temporaryPassword() {
  return `Mesto-${crypto.randomBytes(7).toString('base64url')}!7`;
}

module.exports = {
  USER_SESSION_AUDIENCE,
  USER_SESSION_TYPE,
  USER_SESSION_VERSION,
  USER_COOKIE,
  changePassword,
  clearSessionCookie,
  contactEmail,
  createManagedUser,
  currentUser,
  decodeSession,
  publicUser,
  requireUser,
  resetManagedPassword,
  isStrongPassword,
  isInternalEmail,
  normalizeUsername,
  sessionCookie,
  signIn,
  temporaryPassword
};
