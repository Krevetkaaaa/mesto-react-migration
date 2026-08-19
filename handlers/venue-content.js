const { json, methodNotAllowed, publicJson, queryValue, uuid } = require('../lib/http');
const { publicVenueCacheHeaders } = require('../lib/public-cache');
const { enforceRateLimit } = require('../lib/rate-limit');
const { createStore } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const venueId = uuid(queryValue(req.query.venueId));
  if (!venueId) return json(res, 400, { message: 'Некорректный идентификатор заведения.' });
  if (!await enforceRateLimit(req, res, {
    policy: 'public-detail',
    scope: 'venue-content',
    identifier: venueId,
    message: 'Слишком много запросов. Повторите позже.'
  })) return;
  try {
    const content = await createStore().publicVenueContent(venueId);
    return publicJson(req, res, content, publicVenueCacheHeaders({ id: venueId }));
  } catch (error) {
    return json(res, error.statusCode || 500, { message: 'Не удалось загрузить меню и акции.' });
  }
};
