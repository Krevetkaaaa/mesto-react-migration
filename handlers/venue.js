const { json, methodNotAllowed, queryValue } = require('../lib/http');
const { rateLimit } = require('../lib/rate-limit');
const { createStore } = require('../lib/supabase');

const SLUG_PART = '[a-z\\u0430-\\u044f\\u04510-9]+';
const SLUG_PATTERN = new RegExp(`^${SLUG_PART}(?:-${SLUG_PART})*$`, 'u');

function normalizeSlug(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(queryValue(value) || ''));
  } catch {
    return '';
  }
  const normalized = decoded.normalize('NFKC').trim().toLowerCase();
  return normalized.length <= 160 && SLUG_PATTERN.test(normalized) ? normalized : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const slug = normalizeSlug(req.query?.slug);
  if (!slug) {
    return json(res, 400, {
      code: 'INVALID_VENUE_SLUG',
      message: 'Некорректный адрес заведения.'
    });
  }

  const retryAfter = rateLimit(req, {
    scope: 'venue-by-slug',
    identifier: slug,
    limit: 60,
    windowMs: 60_000
  });
  if (retryAfter) {
    return json(res, 429, {
      code: 'RATE_LIMITED',
      message: 'Слишком много запросов. Повторите позже.'
    }, { 'Retry-After': String(retryAfter) });
  }

  const store = createStore();
  if (!store.configured) {
    return json(res, 503, {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Каталог временно недоступен.'
    });
  }

  try {
    const venue = await store.publishedVenueBySlug(slug);
    if (!venue || venue.status !== 'published' || venue.slug !== slug) {
      return json(res, 404, {
        code: 'VENUE_NOT_FOUND',
        message: 'Заведение не найдено.'
      });
    }
    return json(res, 200, { venue });
  } catch {
    return json(res, 500, {
      code: 'VENUE_LOOKUP_FAILED',
      message: 'Не удалось загрузить заведение.'
    });
  }
};

module.exports.normalizeSlug = normalizeSlug;
