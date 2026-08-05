const { json, methodNotAllowed, readJson } = require('../../lib/http');
const { normalizeUsername, publicUser, sessionCookie } = require('../../lib/identity');
const { authRequest, createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const body = await readJson(req, 100_000);
    const accessToken = String(body.accessToken || '');
    if (!accessToken) return json(res, 400, { message: 'Токен входа не получен.' });
    const authUser = await authRequest('user', { accessToken });
    const store = createStore();
    let profile = await store.profileById(authUser.id);
    if (!profile || profile._auth_user) {
      const address = String(authUser.email || '').toLowerCase();
      const baseUsername = normalizeUsername(address.split('@')[0], 'google-user');
      const existing = await store.profileByLogin(baseUsername).catch(() => null);
      const username = existing && existing.id !== authUser.id ? `${baseUsername.slice(0, 38)}-${authUser.id.slice(0, 8)}` : baseUsername;
      profile = await store.saveProfile({
        id: authUser.id,
        username,
        display_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || address.split('@')[0],
        email: address,
        role: 'customer',
        status: 'active'
      });
    }
    if (profile.status !== 'active') return json(res, 403, { message: 'Аккаунт приостановлен.' });
    res.setHeader('Set-Cookie', sessionCookie(profile));
    return json(res, 200, { authenticated: true, user: publicUser(profile) });
  } catch (error) {
    return json(res, 401, { message: 'Не удалось завершить вход через Google.' });
  }
};
