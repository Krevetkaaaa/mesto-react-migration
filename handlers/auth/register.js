const { email, json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { createManagedUser, isStrongPassword, normalizeUsername, publicUser, sessionCookie } = require('../../lib/identity');
const { rateLimit } = require('../../lib/rate-limit');
const { requireSameOrigin } = require('../../lib/same-origin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  try {
    const body = await readJson(req, 50_000);
    const name = text(body.name, 120);
    const username = normalizeUsername(body.username);
    const address = email(body.email);
    const password = String(body.password || '');
    if (!name || !address || !/^[a-z0-9._-]{3,48}$/.test(username)) return json(res, 400, { message: 'Укажите имя, корректную почту и логин из 3–48 латинских букв или цифр.' });
    const retryAfter = rateLimit(req, { scope: 'user-register', identifier: address, limit: 5, windowMs: 60 * 60_000 });
    if (retryAfter) return json(res, 429, { message: 'Слишком много попыток регистрации. Повторите позже.' }, { 'Retry-After': String(retryAfter) });
    if (!isStrongPassword(password)) {
      return json(res, 400, { message: 'Пароль должен содержать минимум 10 символов, букву и цифру.' });
    }
    const profile = await createManagedUser({ email: address, password, displayName: name, username, role: 'customer' });
    res.setHeader('Set-Cookie', sessionCookie(profile));
    return json(res, 201, { authenticated: true, user: publicUser(profile) });
  } catch (error) {
    const duplicate = error.statusCode === 422 || /already|duplicate|unique/i.test(error.message || '');
    return json(res, duplicate ? 409 : (error.statusCode || 500), { message: duplicate ? (error.message || 'Аккаунт с такой почтой или логином уже существует.') : (error.message || 'Не удалось создать аккаунт.') });
  }
};
