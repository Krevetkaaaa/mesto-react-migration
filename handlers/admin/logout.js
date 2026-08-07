const { json, methodNotAllowed } = require('../../lib/http');
const { setAdminResponseHeaders } = require('../../lib/admin');
const { requireSameOrigin } = require('../../lib/same-origin');
const { clearSessionCookie } = require('../../lib/security');

module.exports = function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  res.setHeader('Set-Cookie', clearSessionCookie());
  return json(res, 200, { ok: true });
};

