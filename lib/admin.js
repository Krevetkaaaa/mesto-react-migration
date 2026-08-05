const { adminSession } = require('./security');
const { json } = require('./http');

function requireAdmin(req, res) {
  const session = adminSession(req);
  if (!session) {
    json(res, 401, { message: 'Требуется вход администратора.' });
    return null;
  }
  return session;
}

function handleApiError(res, error) {
  const status = Number(error?.statusCode) || 500;
  const message = error?.code === 'SUPABASE_NOT_CONFIGURED'
    ? 'Supabase ещё не подключён. Добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в Vercel.'
    : error?.message || 'Внутренняя ошибка.';
  return json(res, status, { message, code: error?.code || 'API_ERROR' });
}

module.exports = { handleApiError, requireAdmin };

