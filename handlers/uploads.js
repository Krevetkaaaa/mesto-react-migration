const crypto = require('node:crypto');

const { json, methodNotAllowed, readJson, text, uuid } = require('../lib/http');
const { requireUser } = require('../lib/identity');
const {
  MAX_IMAGE_BYTES,
  MediaValidationError,
  processMedia
} = require('../lib/media-processing');
const {
  REVIEW_BUCKET,
  STAGING_BUCKET,
  cleanupPrivateAssets,
  cleanupPublicManifests,
  createMediaStorage,
  reviewPath,
  stagingPath
} = require('../lib/media-storage');
const { enforceRateLimit } = require('../lib/rate-limit');
const { configuration, createStore } = require('../lib/supabase');

const ALLOWED_DECLARED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
const SIGNED_UPLOAD_LIFETIME_MS = 2 * 60 * 60 * 1000;

function mediaIds(value) {
  if (!Array.isArray(value) || value.length > 6) return null;
  const normalized = value.map(uuid);
  if (normalized.some((id) => !id) || new Set(normalized).size !== normalized.length) return null;
  return normalized;
}

function storageForRequest() {
  return createMediaStorage(configuration());
}

async function createSignedUploadReceipt({ store, storage, receipt }) {
  const asset = await store.createMediaAsset(receipt);
  if (!asset) throw Object.assign(new Error('Media registry did not return the created asset'), { statusCode: 502 });
  // Keep this strictly sequenced. A timeout/transport loss from the mutating
  // receipt INSERT is commit-ambiguous, so issuing a provider token afterward
  // could create an upload with no response-side receipt ownership proof.
  const signed = await storage.signedUpload(asset.staging_path);
  return { asset, signed };
}

function planReviewManifest(ownerId, assetId, processed) {
  return Object.fromEntries(Object.entries(processed.variants).map(([variant, output]) => [variant, {
    path: reviewPath(ownerId, assetId, variant),
    width: output.width,
    height: output.height,
    bytes: output.size,
    contentType: output.contentType
  }]));
}

function stagedReviewManifestIsAuthoritative(staged, asset, ownerId, reviewManifest) {
  if (staged?.id !== asset.id
    || staged?.owner_id !== ownerId
    || staged?.status !== 'processing'
    || staged?.review_cleanup_pending !== true) return false;
  return Object.entries(reviewManifest).every(([variant, planned]) => {
    const persisted = staged.review_manifest?.[variant];
    return persisted?.path === planned.path
      && Number(persisted.width) === Number(planned.width)
      && Number(persisted.height) === Number(planned.height)
      && Number(persisted.bytes) === Number(planned.bytes)
      && persisted.contentType === planned.contentType;
  });
}

async function uploadReviewVariants({ store, storage, asset, ownerId, processed }) {
  const reviewManifest = planReviewManifest(ownerId, asset.id, processed);
  // Persist every exact target path before the first Storage write. A hard kill
  // or an ambiguous PATCH response therefore cannot create an untracked object.
  const staged = await store.stageReviewMediaManifest({
    id: asset.id,
    ownerId,
    reviewManifest
  });
  if (!stagedReviewManifestIsAuthoritative(staged, asset, ownerId, reviewManifest)) {
    throw Object.assign(new Error('Review media manifest was not persisted authoritatively'), {
      statusCode: 409,
      code: 'MEDIA_REVIEW_STAGE_CONFLICT'
    });
  }

  for (const [variant, output] of Object.entries(processed.variants)) {
    await storage.upload(REVIEW_BUCKET, reviewManifest[variant].path, output.bytes, output.contentType);
  }
  return reviewManifest;
}

function authoritativeCleanupClaim(rows, assetId, ownerId) {
  if (!Array.isArray(rows)) return null;
  return rows.find((row) => row?.id === assetId
    && row?.owner_id === ownerId
    && row?.status === 'cleanup_pending') || null;
}

async function cleanupFailedFinalization({ store, storage, assetId, ownerId }) {
  const claimed = await store.markMediaCleanupPending({ ids: [assetId], ownerId }).catch(() => []);
  const cleanupAsset = authoritativeCleanupClaim(claimed, assetId, ownerId);
  if (!cleanupAsset) return false;

  try {
    // Only the authoritative database row supplies paths. Never fall back to
    // request-local state when the cleanup claim failed or was commit-ambiguous.
    await cleanupPrivateAssets(storage, [cleanupAsset]);
    const completed = await store.completeStagingCleanup({ ids: [assetId], ownerId });
    if (completed.some((row) => row?.id === assetId
      && row?.owner_id === ownerId
      && row?.staging_cleanup_pending === false)) {
      await store.deleteMediaAssets({ ids: [assetId], ownerId, cleanupClaimed: true });
    }
    return true;
  } catch {
    // The cleanup_pending receipt and its persisted manifest remain retryable.
    return false;
  }
}

function mediaCleanupPendingError() {
  return Object.assign(new Error('Media cleanup is still pending'), {
    code: 'MEDIA_CLEANUP_PENDING',
    statusCode: 409
  });
}

function ownedMediaReceipt(rows, mediaId, ownerId) {
  if (!Array.isArray(rows) || rows.length > 1) return null;
  if (rows.length === 0) return { mediaId, exists: false };
  const row = rows[0];
  if (row?.id !== mediaId || row?.owner_id !== ownerId) return null;
  return { mediaId, exists: true };
}

function exactReleaseRows(rows, expectedIds, { ownerId, ownerById, stagingCompleted = false } = {}) {
  if (!Array.isArray(rows) || rows.length !== expectedIds.length) return false;
  const byId = new Map(rows.map((row) => [row?.id, row]));
  if (byId.size !== expectedIds.length) return false;
  return expectedIds.every((id) => {
    const row = byId.get(id);
    const expectedOwner = ownerId || ownerById?.get(id) || uuid(row?.owner_id);
    return row?.status === 'cleanup_pending'
      && Boolean(expectedOwner)
      && row.owner_id === expectedOwner
      && (!stagingCompleted || row.staging_cleanup_pending === false);
  });
}

async function releaseOwnedMedia({ store, storage, ownerId, ids, includeAttached = false }) {
  const expectedIds = [...new Set(ids || [])];
  if (expectedIds.length !== (ids || []).length) throw mediaCleanupPendingError();
  if (!expectedIds.length) return [];
  // Claim in Postgres before touching Storage. This prevents a concurrent
  // submission RPC from attaching a processed object while release deletes it.
  const assets = await store.markMediaCleanupPending({ ids: expectedIds, ownerId, includeAttached });
  if (!exactReleaseRows(assets, expectedIds, { ownerId })) throw mediaCleanupPendingError();
  const ownerById = new Map(assets.map((asset) => [asset.id, asset.owner_id]));
  try {
    await Promise.all([
      cleanupPrivateAssets(storage, assets),
      cleanupPublicManifests(storage, Object.fromEntries(assets
        .filter((asset) => Object.keys(asset.public_manifest || {}).length)
        .map((asset) => [asset.id, asset.public_manifest])))
    ]);
  } catch (error) {
    throw error;
  }
  const completed = await store.completeStagingCleanup({
    ids: expectedIds,
    ownerId
  });
  if (!exactReleaseRows(completed, expectedIds, {
    ownerId,
    ownerById,
    stagingCompleted: true
  })) throw mediaCleanupPendingError();
  const deleted = await store.deleteMediaAssets({ ids: expectedIds, ownerId, includeAttached });
  if (!exactReleaseRows(deleted, expectedIds, { ownerId, ownerById, stagingCompleted: true })) {
    throw mediaCleanupPendingError();
  }
  return expectedIds;
}

async function cleanupExpiredMedia(store, storage) {
  const staging = typeof store.stagingMediaCleanupPending === 'function'
    ? await store.stagingMediaCleanupPending(20)
    : [];
  if (staging.length) {
    try {
      await storage.remove(STAGING_BUCKET, staging.map((asset) => asset.staging_path));
      await store.completeStagingCleanup({ ids: staging.map((asset) => asset.id) });
    } catch {
      // Signed-upload tombstones remain pending until a later bounded pass.
    }
  }

  const published = typeof store.publishedMediaCleanupPending === 'function'
    ? await store.publishedMediaCleanupPending(20)
    : [];
  if (published.length) {
    try {
      await cleanupPrivateAssets(storage, published);
      await store.completeReviewCleanup(published.map((asset) => asset.id));
    } catch {
      // Published receipts retain their cleanup flags for the next bounded pass.
    }
  }

  const candidates = await store.expiredMediaAssets(20);
  if (!candidates.length) return [];
  const assets = await store.markMediaCleanupPending({ ids: candidates.map((asset) => asset.id) });
  const ids = assets.map((asset) => asset.id);
  if (!ids.length) return [];
  try {
    await Promise.all([
      cleanupPrivateAssets(storage, assets),
      cleanupPublicManifests(storage, Object.fromEntries(assets
        .filter((asset) => Object.keys(asset.public_manifest || {}).length)
        .map((asset) => [asset.id, asset.public_manifest])))
    ]);
    const deleted = await store.deleteMediaAssets({ ids });
    return Array.isArray(deleted) ? deleted.map((row) => row.id).filter(Boolean) : [];
  } catch (error) {
    throw error;
  }
}

async function authorize(req, res, rate) {
  const profile = await requireUser(req, res);
  if (!profile) return null;
  const allowed = await enforceRateLimit(req, res, {
    policy: rate.policy,
    scope: rate.scope,
    identifier: profile.id,
    message: rate.message
  });
  return allowed ? profile : null;
}

async function sign(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await authorize(req, res, {
    policy: 'upload',
    scope: 'media-sign',
    message: 'Лимит загрузок исчерпан. Попробуйте через час.'
  });
  if (!profile) return;

  let asset;
  const store = createStore();
  try {
    const storage = storageForRequest();
    await cleanupExpiredMedia(store, storage).catch(() => null);
    const body = await readJson(req, 100_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { code: 'INVALID_BODY', message: 'The request body must be a JSON object.' });
    }
    const declaredContentType = text(body.type, 50).toLowerCase();
    const declaredSize = Number(body.size);
    const extension = ALLOWED_DECLARED_TYPES.get(declaredContentType);
    if (!extension) return json(res, 400, { code: 'MEDIA_TYPE_UNSUPPORTED', message: 'Поддерживаются только JPG, PNG и WebP.' });
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > MAX_IMAGE_BYTES) {
      return json(res, 413, { code: 'MEDIA_TOO_LARGE', message: 'Файл должен быть не больше 6 МиБ.' });
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SIGNED_UPLOAD_LIFETIME_MS).toISOString();
    const issued = await createSignedUploadReceipt({
      store,
      storage,
      receipt: {
        id,
        owner_id: profile.id,
        status: 'signed',
        declared_content_type: declaredContentType,
        declared_size: declaredSize,
        staging_path: stagingPath(profile.id, id, extension),
        staging_token_expires_at: expiresAt,
        expires_at: expiresAt
      }
    });
    asset = issued.asset;
    const { signed } = issued;
    return json(res, 201, {
      mediaId: asset.id,
      uploadUrl: signed.uploadUrl,
      expiresAt,
      maxBytes: MAX_IMAGE_BYTES
    });
  } catch (error) {
    // Even if the provider created a token but its response was lost, retain
    // the receipt until token expiry + grace. The bounded reaper removes it.
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : error.message === 'INVALID_JSON' ? 400 : error.statusCode || 500;
    return json(res, status, {
      code: error.code || (error.message === 'INVALID_JSON' ? 'INVALID_JSON' : status === 413 ? 'MEDIA_TOO_LARGE' : 'MEDIA_SIGN_FAILED'),
      message: error.code === 'SUPABASE_NOT_CONFIGURED'
        ? 'Загрузка фотографий временно недоступна: хранилище не настроено.'
        : status >= 500 ? 'Не удалось подготовить безопасную загрузку.' : error.message
    });
  }
}

async function finalize(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await authorize(req, res, { policy: 'mutation', scope: 'media-finalize' });
  if (!profile) return;
  const store = createStore();
  let storage;
  let asset;
  let reviewManifest = {};
  try {
    storage = storageForRequest();
    const body = await readJson(req, 100_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { code: 'INVALID_BODY', message: 'The request body must be a JSON object.' });
    }
    const id = uuid(body.mediaId);
    if (!id) return json(res, 400, { code: 'MEDIA_ID_INVALID', message: 'Некорректный идентификатор загрузки.' });
    asset = await store.claimMediaAsset({ id, ownerId: profile.id });
    if (!asset) {
      const stale = (await store.mediaAssetsByIds({ ids: [id], ownerId: profile.id }))[0];
      if (stale?.status === 'signed' && new Date(stale.expires_at).getTime() <= Date.now()) {
        await releaseOwnedMedia({ store, storage, ownerId: profile.id, ids: [id] }).catch(() => null);
      }
      return json(res, 409, { code: 'MEDIA_NOT_FINALIZABLE', message: 'Загрузка истекла, уже обработана или принадлежит другому пользователю.' });
    }

    const sourceBytes = await storage.download(STAGING_BUCKET, asset.staging_path, MAX_IMAGE_BYTES);
    if (sourceBytes.length !== Number(asset.declared_size)) {
      throw new MediaValidationError('MEDIA_SIZE_MISMATCH', 'The uploaded byte length does not match the signed receipt');
    }
    const processed = await processMedia(sourceBytes);
    reviewManifest = await uploadReviewVariants({
      store,
      storage,
      asset,
      ownerId: profile.id,
      processed
    });

    const completed = await store.completeMediaProcessing({
      id: asset.id,
      ownerId: profile.id,
      reviewManifest,
      actual: processed.original
    });
    if (!completed) throw Object.assign(new Error('Concurrent media finalization conflict'), { statusCode: 409, code: 'MEDIA_FINALIZE_CONFLICT' });

    try {
      await storage.remove(STAGING_BUCKET, [asset.staging_path]);
    } catch {
      // The tombstone deliberately remains pending until token expiry + grace.
    }
    return json(res, 200, {
      media: {
        id: completed.id,
        status: completed.status,
        width: completed.width,
        height: completed.height,
        variants: Object.fromEntries(Object.entries(reviewManifest).map(([name, value]) => [name, {
          width: value.width,
          height: value.height
        }]))
      }
    });
  } catch (error) {
    if (asset && storage) {
      await cleanupFailedFinalization({
        store,
        storage,
        assetId: asset.id,
        ownerId: profile.id
      });
    }
    const validation = error instanceof MediaValidationError;
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : error.message === 'INVALID_JSON' ? 400 : error.statusCode || (validation ? 400 : 500);
    return json(res, status, {
      code: error.code || (error.message === 'INVALID_JSON' ? 'INVALID_JSON' : 'MEDIA_FINALIZE_FAILED'),
      message: status >= 500 ? 'Не удалось безопасно обработать изображение.' : error.message
    });
  }
}

async function release(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await authorize(req, res, { policy: 'mutation', scope: 'media-release' });
  if (!profile) return;
  try {
    const body = await readJson(req, 100_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { code: 'INVALID_BODY', message: 'The request body must be a JSON object.' });
    }
    const ids = mediaIds(body.mediaIds);
    if (!ids) return json(res, 400, { code: 'MEDIA_IDS_INVALID', message: 'Некорректный список загрузок.' });
    const released = await releaseOwnedMedia({
      store: createStore(),
      storage: storageForRequest(),
      ownerId: profile.id,
      ids
    });
    return json(res, 200, { released });
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : error.message === 'INVALID_JSON' ? 400 : error.statusCode || 502;
    return json(res, status, {
      code: error.code || (status === 400 ? 'INVALID_JSON' : 'MEDIA_RELEASE_FAILED'),
      message: 'Не удалось полностью очистить незавершённую загрузку. Повторите попытку.'
    });
  }
}

async function status(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const profile = await authorize(req, res, {
    policy: 'public-detail',
    scope: 'media-status'
  });
  if (!profile) return;
  const id = uuid(req.query?.mediaId);
  if (!id) {
    return json(res, 400, {
      code: 'MEDIA_ID_INVALID',
      message: 'The media identifier is invalid.'
    });
  }
  try {
    const rows = await createStore().mediaAssetsByIds({ ids: [id], ownerId: profile.id });
    const receipt = ownedMediaReceipt(rows, id, profile.id);
    if (!receipt) {
      return json(res, 502, {
        code: 'MEDIA_STATUS_UNAVAILABLE',
        message: 'The media receipt could not be verified.'
      });
    }
    return json(res, 200, receipt);
  } catch {
    return json(res, 502, {
      code: 'MEDIA_STATUS_UNAVAILABLE',
      message: 'The media receipt could not be verified.'
    });
  }
}

module.exports = {
  cleanupExpiredMedia,
  cleanupFailedFinalization,
  createSignedUploadReceipt,
  finalize,
  mediaIds,
  ownedMediaReceipt,
  planReviewManifest,
  release,
  releaseOwnedMedia,
  sign,
  status,
  uploadReviewVariants
};
