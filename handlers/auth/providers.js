const { json, methodNotAllowed } = require('../../lib/http');
const { providerAvailable } = require('../../lib/oauth-providers');
const { authRequest } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  let email = false;
  let google = false;
  try {
    const settings = await authRequest('settings');
    email = true;
    google = Boolean(settings?.external?.google);
  } catch {}
  return json(res, 200, {
    email,
    google,
    yandex: providerAvailable('yandex'),
    vk: providerAvailable('vk')
  });
};
