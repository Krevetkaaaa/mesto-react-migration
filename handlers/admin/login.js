const { json, methodNotAllowed, text } = require('../../lib/http');
const { readAdminBody, setAdminResponseHeaders } = require('../../lib/admin');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { requireSameOrigin } = require('../../lib/same-origin');
const { createSessionCookie, verifyPassword } = require('../../lib/security');
const { verifyIssuedSessionCookie } = require('../../lib/admin-session-revocation');

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'auth-login',
    scope: 'admin-login',
    message: 'Слишком много попыток. Повторите позже.',
    code: 'ADMIN_RATE_LIMITED'
  })) return;
  const expectedLogin = process.env.MESTO_ADMIN_LOGIN;
  const expectedHash = process.env.MESTO_ADMIN_PASSWORD_HASH;
  const secret = process.env.MESTO_ADMIN_SESSION_SECRET;
  if (!expectedLogin || !expectedHash || !secret) return json(res, 503, { message: 'Доступ администратора ещё не настроен.' });
  try {
    const body = await readAdminBody(req, 50_000);
    const login = text(body.login, 120);
    const valid = typeof body.password === 'string' && login === expectedLogin && verifyPassword(body.password, expectedHash);
    if (!valid) return json(res, 401, { message: 'Неверный логин или пароль.' });
    const cookie = createSessionCookie(login, secret);
    await verifyIssuedSessionCookie(cookie);
    res.setHeader('Set-Cookie', cookie);
    return json(res, 200, { user: { login, role: 'admin' } });
  } catch (error) {
    return json(res, error.statusCode || 400, {
      message: 'Не удалось выполнить вход.',
      ...(error.statusCode === 503 ? { code: 'ADMIN_SESSION_UNAVAILABLE' } : {})
    });
  }
};

