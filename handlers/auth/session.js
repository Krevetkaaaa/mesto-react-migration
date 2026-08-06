const { json, methodNotAllowed } = require('../../lib/http');
const { currentUser, publicUser } = require('../../lib/identity');
const { createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const profile = await currentUser(req);
    if (!profile) return json(res, 401, { authenticated: false });
    const favorites = await createStore().listFavorites(profile.id);
    return json(res, 200, { authenticated: true, user: publicUser(profile), favorites });
  } catch {
    return json(res, 503, {
      authenticated: false,
      message: 'Сервис профиля и избранного временно недоступен.',
      code: 'SESSION_SERVICE_UNAVAILABLE'
    });
  }
};
