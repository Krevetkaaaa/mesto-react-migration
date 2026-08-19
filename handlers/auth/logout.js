const { json, methodNotAllowed } = require('../../lib/http');
const { clearSessionCookie } = require('../../lib/identity');
const { requireSameOrigin } = require('../../lib/same-origin');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  res.setHeader('Set-Cookie', clearSessionCookie());
  return json(res, 200, { ok: true });
};
