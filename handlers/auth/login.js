const { json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { publicUser, sessionCookie, signIn } = require('../../lib/identity');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { requireSameOrigin } = require('../../lib/same-origin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  try {
    const body = await readJson(req, 50_000);
    const login = text(body.login, 200).toLowerCase();
    const password = String(body.password || '');
    if (!login || !password) return json(res, 400, { message: 'Введите логин и пароль.' });
    if (!await enforceRateLimit(req, res, {
      policy: 'auth-login',
      scope: 'user-login',
      identifier: login,
      message: 'Слишком много попыток входа. Повторите позже.'
    })) return;
    const profile = await signIn(login, password);
    res.setHeader('Set-Cookie', sessionCookie(profile));
    return json(res, 200, { authenticated: true, user: publicUser(profile) });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось выполнить вход.', code: error.code || 'LOGIN_FAILED' });
  }
};
