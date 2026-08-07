const { json, methodNotAllowed } = require('../../lib/http');
const { setAdminResponseHeaders } = require('../../lib/admin');
const { adminSession } = require('../../lib/security');

module.exports = function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = adminSession(req);
  return json(res, session ? 200 : 401, session ? { authenticated: true, user: { login: session.sub, role: session.role } } : { authenticated: false });
};

