const { json, methodNotAllowed, text, uuid } = require('../../lib/http');
const { handleApiError, readAdminBody, requireAdmin, setAdminResponseHeaders } = require('../../lib/admin');
const { createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const body = await readAdminBody(req, 100_000);
    const id = uuid(body.id);
    if (!id || !['approved', 'rejected'].includes(body.decision)) {
      return json(res, 400, { message: 'Некорректное решение модерации.' });
    }
    const result = await createStore().moderateReview({
      id,
      decision: body.decision,
      note: text(body.note, 600),
      moderator: session.sub
    });
    return json(res, 200, { result });
  } catch (error) {
    return handleApiError(res, error);
  }
};
