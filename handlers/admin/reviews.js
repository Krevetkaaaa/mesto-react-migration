const { json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { handleApiError, requireAdmin } = require('../../lib/admin');
const { createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const body = await readJson(req, 100_000);
    if (!/^[0-9a-f-]{36}$/i.test(String(body.id || '')) || !['approved', 'rejected'].includes(body.decision)) return json(res, 400, { message: 'Некорректное решение модерации.' });
    const result = await createStore().moderateReview({ id: body.id, decision: body.decision, note: text(body.note, 600), moderator: session.sub });
    return json(res, 200, { result });
  } catch (error) {
    return handleApiError(res, error);
  }
};

