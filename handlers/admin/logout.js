const { json, methodNotAllowed } = require('../../lib/http');
const { clearSessionCookie } = require('../../lib/security');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  res.setHeader('Set-Cookie', clearSessionCookie());
  return json(res, 200, { ok: true });
};

