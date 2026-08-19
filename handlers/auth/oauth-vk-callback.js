const { methodNotAllowed } = require('../../lib/http');
const { finishExternalOAuth } = require('../../lib/oauth-flow');
const { enforceRateLimit } = require('../../lib/rate-limit');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!await enforceRateLimit(req, res, {
    policy: 'oauth',
    scope: 'oauth-callback',
    identifier: 'vk',
    message: 'Слишком много попыток завершить вход через внешний сервис.'
  })) return;
  return finishExternalOAuth(req, res, 'vk');
};
