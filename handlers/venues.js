const { json, methodNotAllowed, queryValue, text } = require('../lib/http');
const { createStore } = require('../lib/supabase');

const requestBuckets = new Map();

function clientAddress(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'anonymous';
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientAddress(req);
  const current = requestBuckets.get(key);
  if (!current || now - current.startedAt > 60_000) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

function persistentItem(venue) {
  return {
    id: `mesto-${venue.id}`,
    databaseId: venue.id,
    name: venue.title,
    city: venue.city || '',
    address: venue.address || '',
    description: venue.description || '',
    categories: [venue.category, venue.cuisine].filter(Boolean),
    category: venue.category || '',
    cuisine: venue.cuisine || '',
    hours: venue.hours || '',
    averageCheck: venue.average_check || '',
    phones: venue.phone ? [venue.phone] : [],
    website: venue.website || '',
    features: Array.isArray(venue.features) ? venue.features : [],
    coordinates: venue.longitude != null && venue.latitude != null ? [venue.longitude, venue.latitude] : [],
    photos: Array.isArray(venue.photos) ? venue.photos : [],
    mapsUrl: venue.longitude != null && venue.latitude != null
      ? `https://yandex.ru/maps/?pt=${encodeURIComponent(`${venue.longitude},${venue.latitude}`)}&z=16&l=map`
      : '',
    source: venue.source || 'mesto'
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${text(item.name, 120).toLowerCase()}|${text(item.address, 180).toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (isRateLimited(req)) return json(res, 429, { message: 'Слишком много запросов. Попробуйте через минуту.' });

  const city = text(queryValue(req.query.city), 80, 'all');
  const category = text(queryValue(req.query.category), 80);
  const query = text(queryValue(req.query.query), 120);
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const search = ['где поесть', 'все места', 'заведения'].includes(normalizedQuery) ? '' : query;
  const results = Math.min(Math.max(Number.parseInt(queryValue(req.query.results), 10) || 50, 1), 100);
  const skip = Math.min(Math.max(Number.parseInt(queryValue(req.query.skip), 10) || 0, 0), 100_000);
  const store = createStore();

  if (!store.configured) {
    return json(res, 200, {
      source: 'Место',
      city,
      query,
      count: 0,
      found: 0,
      skip,
      results,
      nextSkip: null,
      persistentCount: 0,
      databaseConfigured: false,
      items: []
    });
  }

  try {
    const page = await store.listPublishedPage({ city, category, search, limit: results, offset: skip });
    const items = dedupe(page.items.map(persistentItem));
    const found = Number.isFinite(page.total) ? page.total : skip + items.length;
    const nextSkip = skip + items.length < found ? skip + results : null;
    return json(res, 200, {
      source: 'Место',
      city,
      query,
      count: items.length,
      found,
      skip,
      results,
      nextSkip,
      persistentCount: items.length,
      databaseConfigured: true,
      items
    });
  } catch (error) {
    return json(res, error.statusCode || 502, { message: error.message || 'Не удалось загрузить каталог «Места».' });
  }
};
