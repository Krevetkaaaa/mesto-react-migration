const { json, methodNotAllowed } = require('../../lib/http');
const { handleApiError, requireAdmin } = require('../../lib/admin');
const { createStore } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const store = createStore();
    const dashboard = await store.dashboard();
    return json(res, 200, { ...dashboard, databaseConfigured: store.configured });
  } catch (error) {
    return handleApiError(res, error);
  }
};

