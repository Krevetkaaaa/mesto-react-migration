const { json, methodNotAllowed } = require('../../lib/http');
const { setAdminResponseHeaders } = require('../../lib/admin');
const { AdminSessionRevocationError, revokeAdminSession } = require('../../lib/admin-session-revocation');
const { requireSameOrigin } = require('../../lib/same-origin');
const { clearSessionCookie } = require('../../lib/security');

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  if (!requireSameOrigin(req, res)) return;
  try {
    await revokeAdminSession(req);
  } catch (error) {
    if (!(error instanceof AdminSessionRevocationError)) throw error;
    return json(res, 503, {
      message: 'Не удалось отозвать административную сессию. Повторите выход.',
      code: 'ADMIN_SESSION_UNAVAILABLE'
    });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return json(res, 200, { ok: true });
};

