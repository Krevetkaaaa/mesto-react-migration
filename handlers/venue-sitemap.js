const { json, methodNotAllowed, publicJson } = require('../lib/http');
const { enforceRateLimit } = require('../lib/rate-limit');
const { createStore } = require('../lib/supabase');

const SLUG_PART = '[a-z\\u0430-\\u044f\\u04510-9]+';
const SLUG_PATTERN = new RegExp(`^${SLUG_PART}(?:-${SLUG_PART})*$`, 'u');

function canonicalSlugs(values) {
  if (!Array.isArray(values)) throw new Error('Published venue slug batch is invalid');
  const seen = new Set();
  return values.map((value) => {
    if (typeof value !== 'string') throw new Error('Published venue slug batch is invalid');
    const slug = value.normalize('NFKC').trim().toLowerCase();
    if (!slug || slug.length > 160 || slug !== value || !SLUG_PATTERN.test(slug) || seen.has(slug)) {
      throw new Error('Published venue slug batch is invalid');
    }
    seen.add(slug);
    return slug;
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const unexpectedQueryKeys = Object.keys(req.query || {}).filter((key) => key !== 'route');
  if (unexpectedQueryKeys.length > 0) {
    return json(res, 400, {
      code: 'INVALID_QUERY',
      message: 'Sitemap endpoint does not accept query parameters.'
    });
  }

  const store = createStore();
  if (!store.configured) {
    return json(res, 200, {
      databaseConfigured: false,
      complete: true,
      slugs: []
    });
  }

  if (!await enforceRateLimit(req, res, {
    policy: 'public-catalog',
    scope: 'venue-sitemap',
    message: 'Too many sitemap requests. Try again later.'
  })) return;

  try {
    const slugs = canonicalSlugs(await store.publicVenueSlugs());
    return publicJson(req, res, {
      databaseConfigured: true,
      complete: true,
      slugs
    });
  } catch {
    return json(res, 503, {
      message: 'Published venue sitemap is temporarily unavailable.'
    });
  }
};

module.exports.canonicalSlugs = canonicalSlugs;
