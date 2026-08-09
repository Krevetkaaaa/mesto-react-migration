const { json, methodNotAllowed, text, uuid } = require('../../lib/http');
const { attemptPostCommit, handleApiError, readAdminBody, requireAdmin, setAdminResponseHeaders } = require('../../lib/admin');
const { invalidatePublicVenueCache } = require('../../lib/public-cache');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'admin-submissions', identifier: session.sub
  })) return;
  try {
    const body = await readAdminBody(req, 100_000);
    const id = uuid(body.id);
    if (!id || !['approved', 'rejected'].includes(body.decision)) {
      return json(res, 400, { message: 'Некорректное решение модерации.' });
    }
    const result = await createStore().moderateSubmission({
      id,
      decision: body.decision,
      note: text(body.note, 600),
      moderator: session.sub
    });
    if (body.decision === 'approved') {
      await attemptPostCommit(() => invalidatePublicVenueCache({ reason: 'submission.approved' }));
    }
    return json(res, 200, { result });
  } catch (error) {
    return handleApiError(res, error);
  }
};
