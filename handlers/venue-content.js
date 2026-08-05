const { json, methodNotAllowed, queryValue, uuid } = require('../lib/http');
const { rateLimit } = require('../lib/rate-limit');
const { createStore } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const venueId = uuid(queryValue(req.query.venueId));
  if (!venueId) return json(res, 400, { message: 'Некорректный идентификатор заведения.' });
  const retryAfter = rateLimit(req, { scope: 'venue-content', identifier: venueId, limit: 60, windowMs: 60_000 });
  if (retryAfter) return json(res, 429, { message: 'Слишком много запросов. Повторите позже.' }, { 'Retry-After': String(retryAfter) });
  try {
    const content = await createStore().publicVenueContent(venueId);
    return json(res, 200, content, { 'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120' });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: 'Не удалось загрузить меню и акции.' });
  }
};
