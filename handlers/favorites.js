const { json, methodNotAllowed, readJson, text, uuid } = require('../lib/http');
const { requireUser } = require('../lib/identity');
const { createStore } = require('../lib/supabase');

const FAVORITE_SLUG_PART = '[a-z\\u0430-\\u044f\\u04510-9]+';
const FAVORITE_SLUG_PATTERN = new RegExp(`^${FAVORITE_SLUG_PART}(?:-${FAVORITE_SLUG_PART})*$`, 'u');

function normalizeFavoriteSlug(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '';
  const slug = String(value).normalize('NFKC').trim().toLowerCase();
  if (slug.length > 160 || !FAVORITE_SLUG_PATTERN.test(slug)) {
    throw Object.assign(new Error('Venue slug is invalid'), { statusCode: 400 });
  }
  return slug;
}

module.exports = async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  const store = createStore();
  try {
    if (req.method === 'GET') return json(res, 200, { favorites: await store.listFavorites(profile.id) });
    const body = await readJson(req, 250_000);
    const venueKey = text(body.venueKey, 180);
    if (!venueKey) return json(res, 400, { message: 'Не удалось определить заведение.' });
    if (req.method === 'DELETE') {
      await store.deleteFavorite(profile.id, venueKey);
      return json(res, 200, { ok: true });
    }
    const snapshotSlug = normalizeFavoriteSlug(body.snapshot?.slug);
    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? {
      ...(snapshotSlug ? { slug: snapshotSlug } : {}),
      title: text(body.snapshot.title, 160),
      type: text(body.snapshot.type, 160),
      rating: text(body.snapshot.rating, 20),
      image: /^https?:\/\//i.test(String(body.snapshot.image || '')) || /^\/?assets\//.test(String(body.snapshot.image || '')) ? text(body.snapshot.image, 500) : '',
      text: text(body.snapshot.text, 500)
    } : {};
    const favorite = await store.saveFavorite({
      user_id: profile.id,
      venue_key: venueKey,
      venue_id: uuid(body.venueId) || null,
      external_venue_id: text(body.externalVenueId, 180) || null,
      snapshot
    });
    return json(res, 201, { favorite });
  } catch (error) {
    if ([400, 413].includes(error.statusCode)) {
      return json(res, error.statusCode, { message: error.message || 'Не удалось обработать запрос.' });
    }
    return json(res, 503, { message: 'Избранное временно недоступно.', code: 'FAVORITES_UNAVAILABLE' });
  }
};
