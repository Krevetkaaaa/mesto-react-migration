const {
  PUBLIC_BUCKET,
  REVIEW_BUCKET,
  STAGING_BUCKET,
  VARIANT_NAMES,
  publicPath,
  reviewPath,
  safePath
} = require('./media-storage');
const {
  MEDIA_PUBLICATION_LEASE_MS,
  MEDIA_PUBLICATION_RECOVERY_LIMIT,
  SIGNED_UPLOAD_CLEANUP_GRACE_MS
} = require('./supabase');
const { uuid } = require('./http');

// A Hobby cron has a 300 second function ceiling and can overlap or be
// delivered more than once. Keep the worst-case bounded well below both that
// ceiling and the 15 minute publication lease. Every database mutation below
// is also fenced by the row state/owner or a fresh publication lease.
const MEDIA_REAPER_BATCH_LIMIT = 2;
const MEDIA_REAPER_OPERATION_TIMEOUT_MS = 4_000;
const MEDIA_REAPER_RUN_BUDGET_MS = 120_000;
const VERCEL_HOBBY_FUNCTION_MAX_MS = 300_000;
const OPERATION_START_MARGIN_MS = 250;

if (MEDIA_REAPER_RUN_BUDGET_MS >= VERCEL_HOBBY_FUNCTION_MAX_MS
  || MEDIA_REAPER_RUN_BUDGET_MS >= MEDIA_PUBLICATION_LEASE_MS) {
  throw new Error('Media reaper budget must remain below its platform and lease ceilings');
}

function reaperError(code, statusCode = 503) {
  return Object.assign(new Error(code), { code, statusCode });
}

function errorCode(error) {
  const candidate = String(error?.code || '').trim();
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(candidate)
    ? candidate
    : 'MEDIA_REAPER_OPERATION_FAILED';
}

function exactRows(rows, expectedIds, predicate = () => true) {
  if (!Array.isArray(rows) || rows.length !== expectedIds.length) return false;
  const byId = new Map(rows.map((row) => [uuid(row?.id), row]));
  return byId.size === expectedIds.length
    && expectedIds.every((id) => byId.has(id) && predicate(byId.get(id)));
}

function emptyManifest(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 0;
}

function stagingObjectPath(asset) {
  const id = uuid(asset?.id);
  const ownerId = uuid(asset?.owner_id);
  const persisted = safePath(asset?.staging_path);
  const match = persisted.match(/\/source\.(jpg|png|webp)$/);
  if (!id || !ownerId || !match
    || persisted !== `${ownerId}/${id}/source.${match[1]}`) {
    throw reaperError('MEDIA_REAPER_STAGING_MANIFEST_INVALID');
  }
  return persisted;
}

function reviewObjectPaths(asset, { allowEmpty = true } = {}) {
  const manifest = asset?.review_manifest;
  if (emptyManifest(manifest) && allowEmpty) return [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw reaperError('MEDIA_REAPER_REVIEW_MANIFEST_INVALID');
  }
  const keys = Object.keys(manifest);
  if (keys.length !== VARIANT_NAMES.length
    || !VARIANT_NAMES.every((variant) => keys.includes(variant))) {
    throw reaperError('MEDIA_REAPER_REVIEW_MANIFEST_INVALID');
  }
  const ownerId = uuid(asset?.owner_id);
  const id = uuid(asset?.id);
  if (!ownerId || !id) throw reaperError('MEDIA_REAPER_REVIEW_MANIFEST_INVALID');
  return VARIANT_NAMES.map((variant) => {
    const expected = reviewPath(ownerId, id, variant);
    if (safePath(manifest[variant]?.path) !== expected) {
      throw reaperError('MEDIA_REAPER_REVIEW_MANIFEST_INVALID');
    }
    return expected;
  });
}

function publicObjectPaths(asset, { allowEmpty = false } = {}) {
  const manifest = asset?.public_manifest;
  if (emptyManifest(manifest) && allowEmpty) return [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');
  }
  const id = uuid(asset?.id);
  const declaredVersion = uuid(manifest.version);
  const versions = new Set();
  if (!id) throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');

  const paths = VARIANT_NAMES.map((variant) => {
    const persisted = safePath(manifest[variant]?.path);
    const parts = persisted.split('/');
    const version = uuid(parts[2]);
    if (parts.length !== 4 || parts[0] !== 'assets' || uuid(parts[1]) !== id
      || parts[3] !== `${variant}.webp` || !version) {
      throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');
    }
    versions.add(version);
    if (persisted !== publicPath(id, version, variant)) {
      throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');
    }
    return persisted;
  });

  if (versions.size !== 1 || (manifest.version && !declaredVersion)
    || (declaredVersion && !versions.has(declaredVersion))) {
    throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');
  }
  const allowedKeys = new Set([...VARIANT_NAMES, 'version']);
  if (Object.keys(manifest).some((key) => !allowedKeys.has(key))) {
    throw reaperError('MEDIA_REAPER_PUBLIC_MANIFEST_INVALID');
  }
  return paths;
}

function pathsEqual(left, right) {
  return left.length === right.length && left.every((path, index) => path === right[index]);
}

function operationTimeout(deadlineAt, now, operations = 1) {
  const minimum = (MEDIA_REAPER_OPERATION_TIMEOUT_MS * operations) + OPERATION_START_MARGIN_MS;
  if (deadlineAt - now() < minimum) {
    throw reaperError('MEDIA_REAPER_BUDGET_EXHAUSTED', 503);
  }
  return MEDIA_REAPER_OPERATION_TIMEOUT_MS;
}

function dueStagingAsset(asset, now) {
  const tokenExpiry = Date.parse(asset?.staging_token_expires_at);
  return asset?.staging_cleanup_pending === true
    && Number.isFinite(tokenExpiry)
    && tokenExpiry + SIGNED_UPLOAD_CLEANUP_GRACE_MS < now();
}

async function cleanupAttachedPublicAsset({ store, storage, candidate, deadlineAt, now }) {
  const id = uuid(candidate?.id);
  const submissionId = uuid(candidate?.submission_id);
  if (!id || !submissionId || candidate?.status !== 'attached'
    || candidate?.public_cleanup_pending !== true) {
    throw reaperError('MEDIA_REAPER_PUBLIC_CANDIDATE_INVALID');
  }
  const candidatePaths = publicObjectPaths(candidate);
  const timeoutMs = operationTimeout(deadlineAt, now);
  const claim = await store.claimAttachedPublicMediaCleanup({ id, submissionId, timeoutMs });
  const leaseId = uuid(claim?.publicationLeaseId);
  const leased = claim?.asset;
  if (!leaseId || uuid(leased?.id) !== id || uuid(leased?.submission_id) !== submissionId
    || leased?.status !== 'publishing' || uuid(leased?.publication_lease_id) !== leaseId
    || leased?.public_cleanup_pending !== true
    || !pathsEqual(publicObjectPaths(leased), candidatePaths)) {
    throw reaperError('MEDIA_REAPER_PUBLIC_CLAIM_CONFLICT', 409);
  }

  operationTimeout(deadlineAt, now);
  const authoritative = await store.claimStagedPublicMediaCleanup({
    ids: [id],
    submissionId,
    publicationLeaseId: leaseId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(authoritative, [id], (row) => row?.status === 'publishing'
    && uuid(row?.submission_id) === submissionId
    && uuid(row?.publication_lease_id) === leaseId
    && row?.public_cleanup_pending === true
    && pathsEqual(publicObjectPaths(row), candidatePaths))) {
    throw reaperError('MEDIA_REAPER_PUBLIC_CLAIM_CONFLICT', 409);
  }

  operationTimeout(deadlineAt, now);
  await storage.remove(PUBLIC_BUCKET, candidatePaths);

  operationTimeout(deadlineAt, now);
  const cleared = await store.clearStagedPublicMedia({
    ids: [id],
    submissionId,
    publicationLeaseId: leaseId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(cleared, [id], (row) => row?.status === 'publishing'
    && uuid(row?.submission_id) === submissionId
    && uuid(row?.publication_lease_id) === leaseId
    && row?.public_cleanup_pending === false
    && emptyManifest(row?.public_manifest))) {
    throw reaperError('MEDIA_REAPER_PUBLIC_CLEAR_AMBIGUOUS');
  }

  operationTimeout(deadlineAt, now);
  const released = await store.releaseMediaPublication({
    ids: [id],
    submissionId,
    publicationLeaseId: leaseId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(released, [id], (row) => row?.status === 'attached'
    && uuid(row?.submission_id) === submissionId
    && !row?.publication_lease_id
    && row?.public_cleanup_pending === false
    && emptyManifest(row?.public_manifest))) {
    throw reaperError('MEDIA_REAPER_PUBLIC_RELEASE_AMBIGUOUS');
  }
}

async function cleanupStagingAsset({ store, storage, candidate, deadlineAt, now }) {
  const id = uuid(candidate?.id);
  const ownerId = uuid(candidate?.owner_id);
  if (!id || !ownerId || !dueStagingAsset(candidate, now)) {
    throw reaperError('MEDIA_REAPER_STAGING_CANDIDATE_INVALID');
  }
  const path = stagingObjectPath(candidate);
  operationTimeout(deadlineAt, now);
  await storage.remove(STAGING_BUCKET, [path]);
  operationTimeout(deadlineAt, now);
  const completed = await store.completeStagingCleanup({
    ids: [id],
    ownerId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(completed, [id], (row) => uuid(row?.owner_id) === ownerId
    && row?.staging_cleanup_pending === false
    && safePath(row?.staging_path) === path)) {
    throw reaperError('MEDIA_REAPER_STAGING_CLEAR_AMBIGUOUS');
  }
}

async function cleanupPublishedReviewAsset({ store, storage, candidate, deadlineAt, now }) {
  const id = uuid(candidate?.id);
  const ownerId = uuid(candidate?.owner_id);
  if (!id || !ownerId || candidate?.status !== 'published'
    || candidate?.review_cleanup_pending !== true) {
    throw reaperError('MEDIA_REAPER_REVIEW_CANDIDATE_INVALID');
  }
  const paths = reviewObjectPaths(candidate, { allowEmpty: false });
  operationTimeout(deadlineAt, now);
  await storage.remove(REVIEW_BUCKET, paths);
  operationTimeout(deadlineAt, now);
  const completed = await store.completeReviewCleanup([id], {
    ownerId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(completed, [id], (row) => uuid(row?.owner_id) === ownerId
    && row?.status === 'published'
    && row?.review_cleanup_pending === false
    && emptyManifest(row?.review_manifest))) {
    throw reaperError('MEDIA_REAPER_REVIEW_CLEAR_AMBIGUOUS');
  }
}

async function cleanupExpiredAsset({ store, storage, candidate, deadlineAt, now }) {
  const id = uuid(candidate?.id);
  const ownerId = uuid(candidate?.owner_id);
  if (!id || !ownerId || candidate?.staging_cleanup_pending !== false) {
    throw reaperError('MEDIA_REAPER_EXPIRED_CANDIDATE_INVALID');
  }
  const staging = stagingObjectPath(candidate);
  const review = reviewObjectPaths(candidate, { allowEmpty: true });
  const publicPaths = publicObjectPaths(candidate, { allowEmpty: true });

  operationTimeout(deadlineAt, now);
  const claimed = await store.markMediaCleanupPending({
    ids: [id],
    ownerId,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(claimed, [id], (row) => uuid(row?.owner_id) === ownerId
    && row?.status === 'cleanup_pending'
    && row?.staging_cleanup_pending === false
    && safePath(row?.staging_path) === staging
    && pathsEqual(reviewObjectPaths(row, { allowEmpty: true }), review)
    && pathsEqual(publicObjectPaths(row, { allowEmpty: true }), publicPaths))) {
    throw reaperError('MEDIA_REAPER_EXPIRED_CLAIM_CONFLICT', 409);
  }

  operationTimeout(deadlineAt, now);
  await Promise.all([
    storage.remove(STAGING_BUCKET, [staging]),
    storage.remove(REVIEW_BUCKET, review),
    storage.remove(PUBLIC_BUCKET, publicPaths)
  ]);

  operationTimeout(deadlineAt, now);
  const deleted = await store.deleteMediaAssets({
    ids: [id],
    ownerId,
    cleanupClaimed: true,
    timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
  });
  if (!exactRows(deleted, [id], (row) => uuid(row?.owner_id) === ownerId
    && row?.status === 'cleanup_pending'
    && row?.staging_cleanup_pending === false)) {
    throw reaperError('MEDIA_REAPER_EXPIRED_DELETE_AMBIGUOUS');
  }
}

async function runMediaReaper({
  store,
  storage,
  limit = MEDIA_REAPER_BATCH_LIMIT,
  now = Date.now,
  runBudgetMs = MEDIA_REAPER_RUN_BUDGET_MS
}) {
  if (!store || !storage || typeof now !== 'function') throw new TypeError('Media reaper dependencies are required');
  const boundedLimit = Math.min(Math.max(Number(limit) || MEDIA_REAPER_BATCH_LIMIT, 1), MEDIA_REAPER_BATCH_LIMIT);
  const boundedBudget = Math.min(Math.max(Number(runBudgetMs) || MEDIA_REAPER_RUN_BUDGET_MS, 1), MEDIA_REAPER_RUN_BUDGET_MS);
  const deadlineAt = now() + boundedBudget;
  const failures = [];
  const counts = { recovered: 0, public: 0, staging: 0, review: 0, expired: 0 };
  const hasMore = { recovered: false, public: false, staging: false, review: false, expired: false };
  let budgetExhausted = false;

  const recordFailure = (phase, error) => {
    const code = errorCode(error);
    failures.push({ phase, code });
    if (code === 'MEDIA_REAPER_BUDGET_EXHAUSTED') budgetExhausted = true;
  };

  try {
    const timeoutMs = operationTimeout(deadlineAt, now, 3);
    const recovery = await store.recoverStaleMediaPublications({
      limit: MEDIA_PUBLICATION_RECOVERY_LIMIT,
      processLimit: boundedLimit,
      withMetadata: true,
      timeoutMs
    });
    if (!recovery || !Array.isArray(recovery.rows) || typeof recovery.hasMore !== 'boolean') {
      throw reaperError('MEDIA_REAPER_RECOVERY_RESPONSE_INVALID');
    }
    counts.recovered = recovery.rows.length;
    hasMore.recovered = recovery.hasMore;
  } catch (error) {
    recordFailure('recover-publication-leases', error);
  }

  const runPhase = async ({ name, query, cleanup }) => {
    if (budgetExhausted) return;
    let candidates;
    try {
      operationTimeout(deadlineAt, now);
      candidates = await query(boundedLimit + 1, MEDIA_REAPER_OPERATION_TIMEOUT_MS);
      if (!Array.isArray(candidates)) throw reaperError('MEDIA_REAPER_QUERY_RESPONSE_INVALID');
      hasMore[name] = candidates.length > boundedLimit;
    } catch (error) {
      recordFailure(`${name}-query`, error);
      return;
    }
    for (const candidate of candidates.slice(0, boundedLimit)) {
      if (budgetExhausted) break;
      try {
        await cleanup({ store, storage, candidate, deadlineAt, now });
        counts[name] += 1;
      } catch (error) {
        recordFailure(`${name}-cleanup`, error);
      }
    }
  };

  await runPhase({
    name: 'public',
    query: (queryLimit, timeoutMs) => store.attachedPublicMediaCleanupPending(queryLimit, { timeoutMs }),
    cleanup: cleanupAttachedPublicAsset
  });
  await runPhase({
    name: 'staging',
    query: (queryLimit, timeoutMs) => store.stagingMediaCleanupPending(queryLimit, { timeoutMs }),
    cleanup: cleanupStagingAsset
  });
  await runPhase({
    name: 'review',
    query: (queryLimit, timeoutMs) => store.publishedMediaCleanupPending(queryLimit, { timeoutMs }),
    cleanup: cleanupPublishedReviewAsset
  });
  await runPhase({
    name: 'expired',
    query: (queryLimit, timeoutMs) => store.expiredMediaAssets(queryLimit, {
      recoverPublications: false,
      timeoutMs
    }),
    cleanup: cleanupExpiredAsset
  });

  const ok = failures.length === 0;
  return {
    ok,
    drained: ok && !Object.values(hasMore).some(Boolean),
    counts,
    hasMore,
    failures
  };
}

module.exports = {
  MEDIA_REAPER_BATCH_LIMIT,
  MEDIA_REAPER_OPERATION_TIMEOUT_MS,
  MEDIA_REAPER_RUN_BUDGET_MS,
  VERCEL_HOBBY_FUNCTION_MAX_MS,
  cleanupAttachedPublicAsset,
  cleanupExpiredAsset,
  cleanupPublishedReviewAsset,
  cleanupStagingAsset,
  publicObjectPaths,
  reviewObjectPaths,
  runMediaReaper,
  stagingObjectPath
};
