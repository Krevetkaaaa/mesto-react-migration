const { json, methodNotAllowed, queryValue, text, uuid } = require('../../lib/http');
const {
  attemptPostCommit,
  handleApiError,
  readAdminBody,
  requireAdmin,
  setAdminResponseHeaders
} = require('../../lib/admin');
const { createStore } = require('../../lib/supabase');
const { invalidatePublicVenueCache } = require('../../lib/public-cache');
const { enforceRateLimit } = require('../../lib/rate-limit');

function has(body, key) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function validStringArray(value, limit, validator = () => true) {
  return Array.isArray(value)
    && value.length <= limit
    && value.every((item) => typeof item === 'string' && validator(item));
}

function safeHttpUrl(value, max = 500) {
  const normalized = text(value, max);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function venuePayload(body) {
  if (has(body, 'features') && !validStringArray(body.features, 20)) return null;
  if (has(body, 'photos') && !validStringArray(body.photos, 12, (item) => Boolean(safeHttpUrl(item)))) return null;
  if (has(body, 'website') && text(body.website, 300) && !safeHttpUrl(body.website, 300)) return null;
  if (has(body, 'source') && !['editorial', 'community', 'merchant'].includes(body.source)) return null;
  if (has(body, 'status') && !['draft', 'published', 'archived'].includes(body.status)) return null;

  const title = text(body.title, 160);
  const slug = text(body.slug, 160) || title.toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '');
  return {
    slug,
    title,
    city: text(body.city, 80),
    category: text(body.category, 100),
    cuisine: text(body.cuisine, 100),
    description: text(body.description, 2500),
    address: text(body.address, 300),
    phone: text(body.phone, 60),
    website: safeHttpUrl(body.website, 300),
    hours: text(body.hours, 200),
    average_check: text(body.averageCheck ?? body.average_check, 100),
    features: (body.features || []).map((item) => text(item, 100)).filter(Boolean),
    photos: (body.photos || []).map(safeHttpUrl),
    source: body.source || 'editorial',
    status: body.status || 'published'
  };
}

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  }
  const session = requireAdmin(req, res);
  if (!session) return;
  if (req.method !== 'GET' && !await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'admin-venues', identifier: session.sub
  })) return;
  const store = createStore();
  try {
    if (req.method === 'GET') {
      const venues = await store.listPublished({
        city: text(queryValue(req.query?.city), 80),
        category: text(queryValue(req.query?.category), 100),
        limit: 500
      });
      return json(res, 200, { venues });
    }

    const body = await readAdminBody(req, 1_000_000);
    const id = uuid(body.id);
    if (req.method === 'DELETE') {
      if (!id) return json(res, 400, { message: 'Некорректный идентификатор.' });
      const removed = await store.deleteVenue(id);
      if (!Array.isArray(removed) || !removed.length) return json(res, 404, { message: 'Заведение не найдено.' });
      await attemptPostCommit(() => store.audit({
        actor_label: session.sub,
        actor_role: 'admin',
        action: 'venue.deleted',
        entity_type: 'venue',
        entity_id: id
      }));
      await attemptPostCommit(() => invalidatePublicVenueCache({ id, reason: 'venue.deleted' }));
      return json(res, 200, { ok: true });
    }

    if (req.method === 'PATCH' && !id) {
      return json(res, 400, { message: 'Некорректный идентификатор.' });
    }
    const payload = venuePayload(body);
    if (!payload) return json(res, 400, { message: 'Проверьте поля заведения.' });
    if (!payload.slug || !payload.title || !payload.city || !payload.category || !payload.description) {
      return json(res, 400, { message: 'Заполните название, город, категорию и описание.' });
    }
    const venue = await store.saveVenue(payload, req.method === 'PATCH' ? id : null);
    if (!venue) {
      return json(res, req.method === 'PATCH' ? 404 : 500, {
        message: req.method === 'PATCH' ? 'Заведение не найдено.' : 'Не удалось создать заведение.'
      });
    }
    await attemptPostCommit(() => store.audit({
      actor_label: session.sub,
      actor_role: 'admin',
      action: req.method === 'PATCH' ? 'venue.updated' : 'venue.created',
      entity_type: 'venue',
      entity_id: venue.id
    }));
    await attemptPostCommit(() => invalidatePublicVenueCache({
      id: venue.id,
      slug: venue.slug || payload.slug,
      reason: req.method === 'PATCH' ? 'venue.updated' : 'venue.created'
    }));
    return json(res, req.method === 'PATCH' ? 200 : 201, { venue });
  } catch (error) {
    return handleApiError(res, error);
  }
};
