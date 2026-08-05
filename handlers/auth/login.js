const { json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { publicUser, sessionCookie, signIn } = require('../../lib/identity');
const { rateLimit } = require('../../lib/rate-limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = await readJson(req, 50_000);
    const login = text(body.login, 200).toLowerCase();
    const password = String(body.password || '');
    if (!login || !password) return json(res, 400, { message: 'Введите логин и пароль.' });
    const retryAfter = rateLimit(req, { scope: 'user-login', identifier: login, limit: 10, windowMs: 15 * 60_000 });
    if (retryAfter) return json(res, 429, { message: 'Слишком много попыток входа. Повторите позже.' }, { 'Retry-After': String(retryAfter) });
    const profile = await signIn(login, password);
    res.setHeader('Set-Cookie', sessionCookie(profile));
    return json(res, 200, { authenticated: true, user: publicUser(profile) });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось выполнить вход.', code: error.code || 'LOGIN_FAILED' });
  }
};
