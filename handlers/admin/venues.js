const { json, methodNotAllowed, queryValue, readJson, text } = require('../../lib/http');
const { handleApiError, requireAdmin } = require('../../lib/admin');
const { createStore } = require('../../lib/supabase');

function venuePayload(body) {
  const slug = text(body.slug, 160) || text(body.title, 160).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
  return {
    slug,
    title: text(body.title, 160),
    city: text(body.city, 80),
    category: text(body.category, 100),
    cuisine: text(body.cuisine, 100),
    description: text(body.description, 2500),
    address: text(body.address, 300),
    phone: text(body.phone, 60),
    website: /^https?:\/\//i.test(String(body.website || '')) ? text(body.website, 300) : '',
    hours: text(body.hours, 200),
    average_check: text(body.averageCheck ?? body.average_check, 100),
    features: Array.isArray(body.features) ? body.features.map((item) => text(item, 100)).filter(Boolean).slice(0, 20) : String(body.features || '').split(',').map((item) => text(item, 100)).filter(Boolean).slice(0, 20),
    photos: Array.isArray(body.photos) ? body.photos.filter((url) => /^https?:\/\//i.test(url)).slice(0, 12) : String(body.photos || '').split(/[\n,]/).map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)).slice(0, 12),
    source: ['editorial', 'community', 'merchant'].includes(body.source) ? body.source : 'editorial',
    status: ['draft', 'published', 'archived'].includes(body.status) ? body.status : 'published'
  };
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  const session = requireAdmin(req, res);
  if (!session) return;
  const store = createStore();
  try {
    if (req.method === 'GET') {
      const venues = await store.listPublished({ city: text(queryValue(req.query.city), 80), category: text(queryValue(req.query.category), 100), limit: 500 });
      return json(res, 200, { venues });
    }
    const body = await readJson(req, 1_000_000);
    if (req.method === 'DELETE') {
      if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return json(res, 400, { message: 'Некорректный идентификатор.' });
      await store.deleteVenue(body.id);
      return json(res, 200, { ok: true });
    }
    const payload = venuePayload(body);
    if (!payload.title || !payload.city || !payload.category || !payload.description) return json(res, 400, { message: 'Заполните название, город, категорию и описание.' });
    const id = req.method === 'PATCH' && /^[0-9a-f-]{36}$/i.test(String(body.id || '')) ? body.id : null;
    const venue = await store.saveVenue(payload, id);
    return json(res, id ? 200 : 201, { venue });
  } catch (error) {
    return handleApiError(res, error);
  }
};

