const { json, methodNotAllowed, text } = require('../../lib/http');
const { readAdminBody, setAdminResponseHeaders } = require('../../lib/admin');
const { requireSameOrigin } = require('../../lib/same-origin');
const { createSessionCookie, verifyPassword } = require('../../lib/security');

const attempts = new Map();

function limited(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt > 15 * 60_000) {
    attempts.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 10;
}

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  if (limited(req)) return json(res, 429, { message: 'Слишком много попыток. Повторите позже.' });
  const expectedLogin = process.env.MESTO_ADMIN_LOGIN;
  const expectedHash = process.env.MESTO_ADMIN_PASSWORD_HASH;
  const secret = process.env.MESTO_ADMIN_SESSION_SECRET;
  if (!expectedLogin || !expectedHash || !secret) return json(res, 503, { message: 'Доступ администратора ещё не настроен.' });
  try {
    const body = await readAdminBody(req, 50_000);
    const login = text(body.login, 120);
    const valid = typeof body.password === 'string' && login === expectedLogin && verifyPassword(body.password, expectedHash);
    if (!valid) return json(res, 401, { message: 'Неверный логин или пароль.' });
    res.setHeader('Set-Cookie', createSessionCookie(login, secret));
    return json(res, 200, { user: { login, role: 'admin' } });
  } catch (error) {
    return json(res, error.statusCode || 400, { message: 'Не удалось выполнить вход.' });
  }
};

