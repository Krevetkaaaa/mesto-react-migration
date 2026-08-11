const { json, methodNotAllowed, text, uuid } = require('../../lib/http');
const { attemptPostCommit, handleApiError, readAdminBody, requireAdmin, setAdminResponseHeaders } = require('../../lib/admin');
const {
  cleanupPrivateAssets,
  cleanupPublicManifests,
  createMediaStorage,
  planPublicManifest,
  publicPath,
  publishAsset,
  VARIANT_NAMES
} = require('../../lib/media-storage');
const { invalidatePublicVenueCache } = require('../../lib/public-cache');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { configuration, createStore } = require('../../lib/supabase');
const { releaseOwnedMedia } = require('../uploads');

function manifestPathsMatch(expected, actual) {
  return VARIANT_NAMES.every((variant) => {
    const expectedPath = String(expected?.[variant]?.path || '');
    const actualPath = String(actual?.[variant]?.path || '');
    return expectedPath && expectedPath === actualPath;
  });
}

function emptyManifest(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function leaseRowMatches(row, { id, submissionId, publicationLeaseId }) {
  return row?.id === id
    && row?.submission_id === submissionId
    && row?.status === 'publishing'
    && row?.publication_lease_id === publicationLeaseId;
}

function publicationClaimIsAuthoritative(claim, expectedIds, submissionId) {
  const publicationLeaseId = uuid(claim?.publicationLeaseId);
  const assets = Array.isArray(claim?.assets) ? claim.assets : [];
  const uniqueExpectedIds = [...new Set(expectedIds || [])];
  if (!publicationLeaseId || assets.length !== uniqueExpectedIds.length) return null;
  const rows = new Map(assets.map((row) => [row?.id, row]));
  if (rows.size !== uniqueExpectedIds.length) return null;
  if (uniqueExpectedIds.some((id) => !leaseRowMatches(rows.get(id), { id, submissionId, publicationLeaseId }))) return null;
  return { assets, publicationLeaseId };
}

function stagedManifestIsAuthoritative(row, { id, submissionId, publicationLeaseId, manifest }) {
  return leaseRowMatches(row, { id, submissionId, publicationLeaseId })
    && row.public_cleanup_pending === true
    && manifestPathsMatch(manifest, row.public_manifest);
}

function attemptManifestsAreOwned(manifests, publicationLeaseId) {
  const leaseId = uuid(publicationLeaseId);
  const entries = Object.entries(manifests || {});
  if (!leaseId || !entries.length) return false;
  return entries.every(([mediaId, manifest]) => {
    const id = uuid(mediaId);
    return id && VARIANT_NAMES.every((variant) => {
      try {
        return manifest?.[variant]?.path === publicPath(id, leaseId, variant);
      } catch {
        return false;
      }
    });
  });
}

async function cleanupAttemptPublicManifests(storage, manifests, publicationLeaseId) {
  if (!Object.keys(manifests || {}).length) return true;
  if (!attemptManifestsAreOwned(manifests, publicationLeaseId)) return false;
  try {
    await cleanupPublicManifests(storage, manifests);
    return true;
  } catch {
    return false;
  }
}

async function clearStagedPublicMedia(store, storage, manifests, { submissionId, publicationLeaseId }) {
  const ids = Object.keys(manifests);
  if (!ids.length) return true;
  const leaseId = uuid(publicationLeaseId);
  if (!leaseId || !uuid(submissionId)) return false;
  try {
    // Claim the exact DB manifests with a lease-token CAS before deleting any
    // provider bytes. A worker fenced out by recovery cannot delete a newer
    // worker's paths even if its catch/finally block resumes much later.
    const claimed = await store.claimStagedPublicMediaCleanup({
      ids,
      submissionId,
      publicationLeaseId: leaseId
    });
    if (!Array.isArray(claimed) || claimed.length !== ids.length) return false;
    const rows = new Map(claimed.map((row) => [row?.id, row]));
    if (rows.size !== ids.length) return false;

    const authoritativeManifests = {};
    for (const id of ids) {
      const row = rows.get(id);
      if (!leaseRowMatches(row, { id, submissionId, publicationLeaseId: leaseId }) || row.public_cleanup_pending !== true) return false;
      if (emptyManifest(row.public_manifest)) continue;
      if (!manifestPathsMatch(manifests[id], row.public_manifest)) return false;
      authoritativeManifests[id] = row.public_manifest;
    }
    if (Object.keys(authoritativeManifests).length) {
      await cleanupPublicManifests(storage, authoritativeManifests);
    }

    const cleared = await store.clearStagedPublicMedia({ ids, submissionId, publicationLeaseId: leaseId });
    if (!Array.isArray(cleared) || cleared.length !== ids.length) return false;
    const clearedRows = new Map(cleared.map((row) => [row?.id, row]));
    return clearedRows.size === ids.length && ids.every((id) => {
      const row = clearedRows.get(id);
      return leaseRowMatches(row, { id, submissionId, publicationLeaseId: leaseId })
        && row.public_cleanup_pending === false
        && emptyManifest(row.public_manifest);
    });
  } catch {
    return false;
  }
}

async function publishSubmissionMedia(store, storage, submissionId, assets, publicationLeaseId) {
  const manifests = {};
  if (!assets.length) return manifests;
  const leaseId = uuid(publicationLeaseId);
  if (!leaseId) throw Object.assign(new Error('Media publication lease is missing'), {
    code: 'MEDIA_PUBLICATION_LEASE_INVALID',
    statusCode: 409
  });
  const pending = Object.fromEntries(assets
    .filter((asset) => asset.public_cleanup_pending && Object.keys(asset.public_manifest || {}).length)
    .map((asset) => [asset.id, asset.public_manifest]));
  if (Object.keys(pending).length && !await clearStagedPublicMedia(store, storage, pending, {
    submissionId,
    publicationLeaseId: leaseId
  })) {
    throw Object.assign(new Error('A previous public-media cleanup is still pending'), {
      code: 'MEDIA_PUBLIC_CLEANUP_PENDING',
      statusCode: 503
    });
  }

  try {
    for (const asset of assets) {
      // The lease UUID is also the immutable path version. This makes every
      // object provably attempt-owned even after a later worker takes the row.
      const version = leaseId;
      const planned = planPublicManifest(storage, asset, version);
      const staged = await store.stagePublicMediaManifest({
        id: asset.id,
        submissionId,
        publicationLeaseId: leaseId,
        manifest: planned
      });
      if (!stagedManifestIsAuthoritative(staged, {
        id: asset.id,
        submissionId,
        publicationLeaseId: leaseId,
        manifest: planned
      })) throw Object.assign(new Error('Media publication conflict'), { statusCode: 409, code: 'MEDIA_PUBLICATION_FENCED' });
      manifests[asset.id] = planned;
      const published = await publishAsset(storage, asset, version);
      manifests[asset.id] = published;
      const recorded = await store.stagePublicMediaManifest({
        id: asset.id,
        submissionId,
        publicationLeaseId: leaseId,
        manifest: published
      });
      if (!stagedManifestIsAuthoritative(recorded, {
        id: asset.id,
        submissionId,
        publicationLeaseId: leaseId,
        manifest: published
      })) throw Object.assign(new Error('Media publication receipt conflict'), { statusCode: 409, code: 'MEDIA_PUBLICATION_FENCED' });
    }
    return manifests;
  } catch (error) {
    if (error?.publicMediaUploadCommitAmbiguous === true) {
      // The pre-write receipt is the recovery oracle. Keep its exact paths,
      // cleanup marker and lease until the bounded stale-worker window has
      // elapsed; deleting or releasing now can race a delayed provider commit.
      throw error;
    }
    const cleared = await clearStagedPublicMedia(store, storage, manifests, {
      submissionId,
      publicationLeaseId: leaseId
    });
    // DB cleanup remains fenced, but versioned provider paths belong only to
    // this attempt and are safe to remove after losing the database lease.
    if (!cleared) await cleanupAttemptPublicManifests(storage, manifests, leaseId);
    throw error;
  }
}

async function cleanupRejectedMedia(store, storage, assets) {
  if (!assets.length) return true;
  const expectedIds = assets.map((asset) => uuid(asset?.id));
  if (expectedIds.some((id) => !id) || new Set(expectedIds).size !== expectedIds.length) return false;
  try {
    const released = await releaseOwnedMedia({
      store,
      storage,
      ids: expectedIds,
      includeAttached: true
    });
    return Array.isArray(released)
      && released.length === expectedIds.length
      && new Set(released).size === expectedIds.length
      && expectedIds.every((id) => released.includes(id));
  } catch {
    // The committed rejection remains valid, but cleanup cannot be reported as
    // complete. Its exact cleanup_pending receipts stay visible to the cron.
    return false;
  }
}

function moderationMediaReceiptIsAuthoritative(result, assets) {
  const expectedIds = (assets || []).map((asset) => uuid(asset?.id));
  const returnedIds = Array.isArray(result?.media_ids) ? result.media_ids.map(uuid) : [];
  if (expectedIds.some((id) => !id) || returnedIds.some((id) => !id)) return false;
  if (new Set(expectedIds).size !== expectedIds.length
    || new Set(returnedIds).size !== returnedIds.length
    || Number(result?.media_count) !== returnedIds.length
    || expectedIds.length !== returnedIds.length) return false;
  const returned = new Set(returnedIds);
  return expectedIds.every((id) => returned.has(id));
}

function ambiguousModerationCommit(error, decision, attempted) {
  const providerStatus = Number(error?.statusCode);
  return decision === 'approved'
    && attempted
    && (!Number.isInteger(providerStatus) || providerStatus < 100 || providerStatus >= 500);
}

async function settleFailedModerationPublication({
  error,
  decision,
  moderationAttempted,
  store,
  storage,
  publicManifests,
  claimedIds,
  submissionId,
  publicationLeaseId
}) {
  if (error?.publicMediaUploadCommitAmbiguous === true
    || ambiguousModerationCommit(error, decision, moderationAttempted)) {
    // A transport or provider 5xx after the POST was sent is not proof of a
    // rollback. The publishing rows already contain the exact planned paths
    // and public_cleanup_pending marker, so leave both the lease and bytes
    // untouched for an authoritative database reconciliation.
    return 'reconciliation_pending';
  }
  if (decision === 'approved') {
    const cleared = await clearStagedPublicMedia(store, storage, publicManifests, {
      submissionId,
      publicationLeaseId
    });
    if (!cleared) await cleanupAttemptPublicManifests(storage, publicManifests, publicationLeaseId);
  }
  if (claimedIds.length) {
    await store.releaseMediaPublication({ ids: claimedIds, submissionId, publicationLeaseId }).catch(() => null);
  }
  return 'rolled_back';
}

function publicMediaResponse(manifests) {
  return Object.entries(manifests || {}).map(([id, manifest]) => ({
    id,
    ...Object.fromEntries(VARIANT_NAMES.map((variant) => {
      const value = manifest?.[variant] || {};
      return [variant, {
        url: String(value.url || ''),
        width: Number(value.width),
        height: Number(value.height),
        bytes: Number(value.bytes),
        contentType: String(value.contentType || '')
      }];
    }))
  }));
}

module.exports = async function handler(req, res) {
  setAdminResponseHeaders(res);
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'admin-submissions', identifier: session.sub
  })) return;
  try {
    const body = await readAdminBody(req, 100_000);
    const id = uuid(body.id);
    if (!id || !['approved', 'rejected'].includes(body.decision)) {
      return json(res, 400, { message: 'Некорректное решение модерации.' });
    }

    const store = createStore();
    const storage = createMediaStorage(configuration());
    if (body.decision === 'rejected') await store.releaseStaleMediaPublication(id);
    let assets = await store.mediaAssetsForSubmission(id);
    if (body.decision === 'rejected' && assets.some((asset) => asset.status === 'publishing')) {
      throw Object.assign(new Error('Media publication is already in progress'), {
        code: 'MEDIA_PUBLICATION_IN_PROGRESS',
        statusCode: 409
      });
    }
    let publicManifests = {};
    let claimedIds = [];
    let publicationLeaseId = null;
    let result;
    let moderationAttempted = false;
    try {
      if (body.decision === 'approved' && assets.length) {
        const expectedIds = assets.map((asset) => asset.id);
        const claim = await store.claimMediaPublication({ ids: expectedIds, submissionId: id });
        const authoritativeClaim = publicationClaimIsAuthoritative(claim, expectedIds, id);
        publicationLeaseId = uuid(claim?.publicationLeaseId) || null;
        claimedIds = Array.isArray(claim?.assets) ? claim.assets.map((asset) => uuid(asset.id)).filter(Boolean) : [];
        if (!authoritativeClaim) {
          throw Object.assign(new Error('Media publication is already in progress'), {
            code: 'MEDIA_PUBLICATION_IN_PROGRESS',
            statusCode: 409
          });
        }
        assets = authoritativeClaim.assets;
        publicationLeaseId = authoritativeClaim.publicationLeaseId;
      }
      if (body.decision === 'approved') {
        publicManifests = await publishSubmissionMedia(store, storage, id, assets, publicationLeaseId);
      }
      moderationAttempted = true;
      result = await store.moderateSubmission({
        id,
        decision: body.decision,
        note: text(body.note, 600),
        moderator: session.sub,
        publicManifests,
        publicationLeaseId
      });
    } catch (error) {
      await settleFailedModerationPublication({
        error,
        decision: body.decision,
        moderationAttempted,
        store,
        storage,
        publicManifests,
        claimedIds,
        submissionId: id,
        publicationLeaseId
      });
      throw error;
    }

    let mediaCleanupPending = false;
    if (body.decision === 'approved') {
      await attemptPostCommit(async () => {
        await cleanupPrivateAssets(storage, assets);
        await store.completeReviewCleanup(assets.map((asset) => asset.id));
      });
      await attemptPostCommit(() => invalidatePublicVenueCache({ reason: 'submission.approved' }));
    } else {
      const receiptMatches = moderationMediaReceiptIsAuthoritative(result, assets);
      const cleanupComplete = await cleanupRejectedMedia(store, storage, assets);
      mediaCleanupPending = !receiptMatches || !cleanupComplete;
    }
    return json(res, 200, {
      result,
      media: body.decision === 'approved' ? publicMediaResponse(publicManifests) : [],
      ...(body.decision === 'rejected' ? { mediaCleanupPending } : {})
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports.clearStagedPublicMedia = clearStagedPublicMedia;
module.exports.cleanupAttemptPublicManifests = cleanupAttemptPublicManifests;
module.exports.cleanupRejectedMedia = cleanupRejectedMedia;
module.exports.moderationMediaReceiptIsAuthoritative = moderationMediaReceiptIsAuthoritative;
module.exports.ambiguousModerationCommit = ambiguousModerationCommit;
module.exports.publishSubmissionMedia = publishSubmissionMedia;
module.exports.publicMediaResponse = publicMediaResponse;
module.exports.publicationClaimIsAuthoritative = publicationClaimIsAuthoritative;
module.exports.settleFailedModerationPublication = settleFailedModerationPublication;
