const { json, methodNotAllowed, queryValue, text, uuid } = require('../../lib/http');
const {
  attemptPostCommit,
  handleApiError,
  readAdminBody,
  requireAdmin,
  setAdminResponseHeaders
} = require('../../lib/admin');
const {
  cleanupPrivateAssets,
  cleanupPublicManifests,
  createMediaStorage
} = require('../../lib/media-storage');
const { configuration, createStore } = require('../../lib/supabase');
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

function exactVenueMediaReceipt(deletion, assets) {
  const expectedIds = (assets || []).map((asset) => uuid(asset?.id));
  const returnedIds = Array.isArray(deletion?.media_ids)
    ? deletion.media_ids.map(uuid)
    : [];
  if (expectedIds.some((id) => !id) || returnedIds.some((id) => !id)) return false;
  if (new Set(expectedIds).size !== expectedIds.length
    || new Set(returnedIds).size !== returnedIds.length
    || Number(deletion?.media_count) !== returnedIds.length
    || expectedIds.length !== returnedIds.length) return false;
  const returned = new Set(returnedIds);
  return expectedIds.every((id) => returned.has(id));
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

async function cleanupDeletedVenueMedia(store, storage, assets) {
  if (!assets.length) return true;
  const ids = assets.map((asset) => asset?.id).filter(Boolean);
  if (ids.length !== assets.length || new Set(ids).size !== ids.length) return false;
  const exactlyReturned = (rows) => {
    if (!Array.isArray(rows) || rows.length !== ids.length) return false;
    const returnedIds = new Set(rows.map((row) => row?.id).filter(Boolean));
    return returnedIds.size === ids.length && ids.every((id) => returnedIds.has(id));
  };
  try {
    const claimed = await store.markMediaCleanupPending({ ids });
    if (!exactlyReturned(claimed)
      || claimed.some((asset) => asset?.status !== 'cleanup_pending')) return false;
    await Promise.all([
      cleanupPrivateAssets(storage, claimed),
      cleanupPublicManifests(storage, Object.fromEntries(claimed
        .filter((asset) => Object.keys(asset.public_manifest || {}).length)
        .map((asset) => [asset.id, asset.public_manifest])))
    ]);
    const completed = await store.completeStagingCleanup({ ids });
    if (!exactlyReturned(completed)
      || completed.some((asset) => asset?.status !== 'cleanup_pending'
        || asset?.staging_cleanup_pending !== false)) return false;
    const deleted = await store.deleteMediaAssets({ ids });
    // The staging tombstone deliberately filters live signed-token receipts
    // from DELETE. Treat any missing row as pending cleanup, never as success.
    return exactlyReturned(deleted);
  } catch {
    // The delete RPC already committed a cleanup_pending tombstone. A bounded
    // sign-time reaper can safely retry without resurrecting the venue.
    return false;
  }
}

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  }
  const session = await requireAdmin(req, res);
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
      const assets = await store.mediaAssetsForApprovedVenue(id);
      const storage = assets.length ? createMediaStorage(configuration()) : null;
      const deletionResult = await store.deleteVenueWithMedia(id);
      const deletion = Array.isArray(deletionResult) ? deletionResult[0] : deletionResult;
      const removed = deletion?.deleted ? [deletion] : [];
      const mediaReceiptMatches = deletion?.deleted && exactVenueMediaReceipt(deletion, assets);
      const mediaCleanupPending = deletion?.deleted
        ? !mediaReceiptMatches || (assets.length
          ? !await cleanupDeletedVenueMedia(store, storage, assets)
          : false)
        : false;
      if (!Array.isArray(removed) || !removed.length) return json(res, 404, { message: 'Заведение не найдено.' });
      await attemptPostCommit(() => store.audit({
        actor_label: session.sub,
        actor_role: 'admin',
        action: 'venue.deleted',
        entity_type: 'venue',
        entity_id: id
      }));
      await attemptPostCommit(() => invalidatePublicVenueCache({ id, reason: 'venue.deleted' }));
      return json(res, 200, { ok: true, ...(mediaCleanupPending ? { mediaCleanupPending: true } : {}) });
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

module.exports.cleanupDeletedVenueMedia = cleanupDeletedVenueMedia;
module.exports.exactVenueMediaReceipt = exactVenueMediaReceipt;
