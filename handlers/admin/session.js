const { json, methodNotAllowed } = require('../../lib/http');
const { setAdminResponseHeaders } = require('../../lib/admin');
const { AdminSessionRevocationError, activeAdminSession } = require('../../lib/admin-session-revocation');

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  let session;
  try {
    session = await activeAdminSession(req);
  } catch (error) {
    if (!(error instanceof AdminSessionRevocationError)) throw error;
    return json(res, 503, { authenticated: false, code: 'ADMIN_SESSION_UNAVAILABLE' });
  }
  return json(res, session ? 200 : 401, session ? { authenticated: true, user: { login: session.sub, role: session.role } } : { authenticated: false });
};

