const { json, methodNotAllowed, readJson } = require('../../lib/http');
const { changePassword, isStrongPassword, publicUser, requireUser, sessionCookie, signIn } = require('../../lib/identity');
const { enforceRateLimit } = require('../../lib/rate-limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'password-change', identifier: profile.id
  })) return;
  try {
    const body = await readJson(req, 50_000);
    const password = String(body.password || '');
    if (!isStrongPassword(password)) {
      return json(res, 400, { message: 'Новый пароль должен содержать минимум 10 символов, букву и цифру.' });
    }
    if (!profile.must_change_password) {
      const currentPassword = String(body.currentPassword || '');
      if (!currentPassword) return json(res, 400, { message: 'Введите текущий пароль.' });
      await signIn(profile.email, currentPassword);
    }
    const updated = await changePassword(profile, password);
    res.setHeader('Set-Cookie', sessionCookie(updated));
    return json(res, 200, { user: publicUser(updated) });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось изменить пароль.' });
  }
};
