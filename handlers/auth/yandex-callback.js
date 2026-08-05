const { methodNotAllowed } = require('../../lib/http');
const { finishExternalOAuth } = require('../../lib/oauth-flow');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  return finishExternalOAuth(req, res, 'yandex');
};
