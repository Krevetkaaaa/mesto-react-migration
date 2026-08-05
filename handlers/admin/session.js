const { json, methodNotAllowed } = require('../../lib/http');
const { adminSession } = require('../../lib/security');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = adminSession(req);
  return json(res, session ? 200 : 401, session ? { authenticated: true, user: { login: session.sub, role: session.role } } : { authenticated: false });
};

