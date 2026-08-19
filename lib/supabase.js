const crypto = require('node:crypto');
const { text } = require('./http');
const { attemptPostCommit } = require('./merchant-operations');
const { normalizeMembershipRole, permissionsForRole } = require('./merchant-permissions');

const PUBLIC_SITEMAP_MAX_SLUGS = 50_000;
const PUBLIC_SITEMAP_PAGE_SIZE = 1_000;

class StoreConfigurationError extends Error {
  constructor() {
    super('SUPABASE_NOT_CONFIGURED');
    this.code = 'SUPABASE_NOT_CONFIGURED';
    this.statusCode = 503;
  }
}

function configuration() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key, configured: Boolean(url && key) };
}

function encodeFilters(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function withAbortableDeadline(timeoutMs, operation) {
  if (!timeoutMs) return operation(undefined);
  const bounded = Number(timeoutMs);
  if (!Number.isInteger(bounded) || bounded < 1 || bounded > 60_000) {
    throw new TypeError('Supabase request timeout is invalid');
  }
  const controller = new AbortController();
  const timeoutError = Object.assign(new Error('Supabase request exceeded its deadline'), {
    code: 'SUPABASE_REQUEST_TIMEOUT',
    statusCode: 504
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, bounded);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (controller.signal.aborted) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function request(path, options = {}) {
  const config = configuration();
  if (!config.configured) throw new StoreConfigurationError();
  const query = encodeFilters(options.query);
  const { response, body } = await withAbortableDeadline(options.timeoutMs, async (signal) => {
    const response = await fetch(`${config.url}/rest/v1/${path}${query ? `?${query}` : ''}`, {
      method: options.method || 'GET',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.prefer ? { Prefer: options.prefer } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      ...(signal ? { signal } : {})
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { response, body };
  });
  if (!response.ok) {
    const error = new Error(body?.message || body?.hint || `Supabase request failed (${response.status})`);
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }
  if (options.withMetadata) {
    const contentRange = response.headers.get('content-range') || '';
    const totalMatch = contentRange.match(/\/(\d+)$/);
    return {
      items: Array.isArray(body) ? body : [],
      total: totalMatch ? Number(totalMatch[1]) : null
    };
  }
  return body;
}

async function authRequest(path, options = {}) {
  const config = configuration();
  if (!config.configured) throw new StoreConfigurationError();
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${options.accessToken || config.key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.msg || body?.message || body?.error_description || `Supabase Auth request failed (${response.status})`);
    error.statusCode = response.status;
    error.code = body?.code || body?.error_code || 'AUTH_ERROR';
    error.details = body;
    throw error;
  }
  return body;
}

function missingExtendedSchema(error) {
  return error?.statusCode === 404 || /schema cache|could not find the table|relation .* does not exist|PGRST205/i.test(`${error?.message || ''} ${error?.details?.code || ''}`);
}

function missingPublicCatalogSummaryRpc(error) {
  const details = `${error?.message || ''} ${error?.details?.code || ''} ${error?.details?.hint || ''}`;
  return error?.details?.code === 'PGRST202'
    || (error?.statusCode === 404 && /public_catalog_summary|function.*schema cache/i.test(details));
}

function countMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Public catalog summary returned an invalid count map');
  }
  return Object.fromEntries(Object.entries(value).map(([key, count]) => {
    const normalized = Number(count);
    if (!key || !Number.isInteger(normalized) || normalized < 0) {
      throw new Error('Public catalog summary returned an invalid count map');
    }
    return [key, normalized];
  }));
}

function normalizePublicCatalogSummary(payload) {
  const summary = Array.isArray(payload) ? payload[0] : payload;
  const total = Number(summary?.total);
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('Public catalog summary returned an invalid total');
  }
  return {
    total,
    byCategory: countMap(summary.byCategory),
    byCity: countMap(summary.byCity)
  };
}

function incrementCount(counts, key) {
  if (typeof key !== 'string' || !key.trim()) return;
  counts.set(key, (counts.get(key) || 0) + 1);
}

async function compatiblePublicCatalogSummary() {
  const byCategory = new Map();
  const byCity = new Map();
  let total = 0;
  let offset = 0;
  const limit = 1000;

  while (true) {
    const rows = await request('venues', {
      query: {
        select: 'city,category',
        status: 'eq.published',
        order: 'id.asc',
        limit,
        offset
      }
    });
    if (!Array.isArray(rows)) throw new Error('Public catalog summary fallback returned an invalid page');
    if (!rows.length) break;
    rows.forEach((venue) => {
      total += 1;
      incrementCount(byCategory, venue.category);
      incrementCount(byCity, venue.city);
    });
    offset += rows.length;
  }

  return {
    total,
    byCategory: Object.fromEntries(byCategory),
    byCity: Object.fromEntries(byCity)
  };
}

function profileFromAuthUser(user) {
  const metadata = user?.user_metadata || {};
  const app = user?.app_metadata || {};
  return user ? {
    id: user.id,
    username: metadata.username || String(user.email || '').split('@')[0],
    display_name: metadata.display_name || metadata.full_name || metadata.name || String(user.email || '').split('@')[0],
    email: String(user.email || '').toLowerCase(),
    email_is_internal: Boolean(app.mesto_email_is_internal) || /@oauth\.mesto\.invalid$/i.test(String(user.email || '')),
    phone: metadata.phone || user.phone || '',
    role: app.mesto_role || 'customer',
    status: app.mesto_status || 'active',
    must_change_password: Boolean(app.must_change_password),
    session_version: Number.isInteger(Number(app.mesto_session_version)) ? Number(app.mesto_session_version) : 0,
    last_login_at: user.last_sign_in_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at || user.created_at,
    _auth_user: user
  } : null;
}

async function authUserById(id) {
  const result = await authRequest(`admin/users/${id}`);
  return result?.user || result;
}

async function listAuthUsers() {
  const result = await authRequest('admin/users?page=1&per_page=1000');
  return Array.isArray(result) ? result : result?.users || [];
}

async function updateAuthMetadata(id, patch = {}) {
  const user = await authUserById(id);
  const userMetadata = { ...(user.user_metadata || {}), ...(patch.user_metadata || {}) };
  const appMetadata = { ...(user.app_metadata || {}), ...(patch.app_metadata || {}) };
  const result = await authRequest(`admin/users/${id}`, { method: 'PUT', body: { user_metadata: userMetadata, app_metadata: appMetadata } });
  return result?.user || result;
}

function venueFromSubmission(submission) {
  const slugBase = text(submission.title, 120).toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '') || 'venue';
  return {
    slug: `${slugBase}-${String(submission.id).slice(0, 8)}`,
    title: submission.title,
    city: submission.city,
    category: submission.category,
    cuisine: submission.cuisine || '',
    description: submission.description,
    address: submission.address || '',
    phone: submission.phone || '',
    website: submission.website || '',
    hours: submission.hours || '',
    average_check: submission.average_check || '',
    features: submission.features || [],
    photos: submission.photos || [],
    source: 'community',
    status: 'published',
    created_by: submission.submitted_by || null
  };
}

const MEDIA_PUBLICATION_LEASE_MS = 15 * 60_000;
const MEDIA_PUBLICATION_RECOVERY_LIMIT = 20;
const MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS = 6_000;
const SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS = 6_000;
const SIGNED_UPLOAD_CLEANUP_GRACE_MS = 5 * 60_000;

function boundedMediaPublicationRecoveryLimit(limit) {
  return Math.min(Math.max(Number(limit) || MEDIA_PUBLICATION_RECOVERY_LIMIT, 1), MEDIA_PUBLICATION_RECOVERY_LIMIT);
}

async function recoverStaleMediaPublications({
  limit = MEDIA_PUBLICATION_RECOVERY_LIMIT,
  processLimit = limit,
  withMetadata = false,
  ids = [],
  submissionId = '',
  timeoutMs = MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS
} = {}) {
  const uniqueIds = [...new Set(ids || [])];
  const boundedLimit = boundedMediaPublicationRecoveryLimit(limit);
  const boundedProcessLimit = Math.min(
    boundedMediaPublicationRecoveryLimit(processLimit),
    boundedLimit
  );
  const staleBefore = new Date(Date.now() - MEDIA_PUBLICATION_LEASE_MS).toISOString();
  const stale = await request('media_assets', {
    timeoutMs,
    query: {
      select: 'id,submission_id,status,updated_at,publication_lease_id,public_manifest,public_cleanup_pending',
      status: 'eq.publishing',
      updated_at: `lt.${staleBefore}`,
      ...(uniqueIds.length ? { id: `in.(${uniqueIds.join(',')})` } : {}),
      ...(submissionId ? { submission_id: `eq.${submissionId}` } : {}),
      order: 'updated_at.asc',
      limit: boundedLimit
    }
  });
  const submissionIds = [...new Set((stale || [])
    .map((asset) => asset?.submission_id)
    .filter(Boolean))];
  const metadata = (rows, hasMore) => withMetadata ? { rows, hasMore } : rows;
  if (!submissionIds.length) return metadata([], stale.length >= boundedLimit);

  const submissions = await request('venue_submissions', {
    timeoutMs,
    query: {
      select: 'id,status,approved_venue_id',
      id: `in.(${submissionIds.join(',')})`
    }
  });
  const pendingSubmissionIds = new Set((submissions || [])
    .filter((submission) => submission?.status === 'pending' && !submission.approved_venue_id)
    .map((submission) => submission.id));
  const recoverableIds = (stale || [])
    .filter((asset) => pendingSubmissionIds.has(asset?.submission_id))
    .map((asset) => asset.id);
  const hasMore = stale.length >= boundedLimit || recoverableIds.length > boundedProcessLimit;
  const selectedIds = recoverableIds.slice(0, boundedProcessLimit);
  if (!selectedIds.length) return metadata([], hasMore);

  // This conditional PATCH is the lease claim. It races safely with the
  // moderation transaction: published rows no longer match, while a PATCH
  // that wins first forces the moderation RPC to fail before commit. Only the
  // status changes; planned paths and public_cleanup_pending stay intact.
  const recovered = await request('media_assets', {
    timeoutMs,
    method: 'PATCH',
    prefer: 'return=representation',
    query: {
      id: `in.(${selectedIds.join(',')})`,
      status: 'eq.publishing',
      updated_at: `lt.${staleBefore}`
    },
    body: { status: 'attached', publication_lease_id: null }
  });
  return metadata(recovered, hasMore);
}

function createStore({
  signedUploadDbOperationTimeoutMs = SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS
} = {}) {
  return {
    configured: configuration().configured,
    async listPublished({ city, category, limit = 100 } = {}) {
      const query = { select: '*', status: 'eq.published', order: 'created_at.desc', limit };
      if (city && city !== 'all') query.city = `eq.${city}`;
      if (category && category !== 'all') query.category = `eq.${category}`;
      return request('venues', { query });
    },
    async listPublishedPage({ city, category, search, limit = 50, offset = 0 } = {}) {
      const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
      const pageOffset = Math.max(Number(offset) || 0, 0);
      const query = {
        select: 'id,slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,latitude,longitude,source',
        status: 'eq.published',
        order: 'created_at.desc,id.desc',
        limit: pageSize,
        offset: pageOffset
      };
      if (city && city !== 'all') query.city = `eq.${city}`;
      if (category && category !== 'all') query.category = `eq.${category}`;
      const normalizedSearch = text(search, 120).replace(/[^\p{L}\p{N}\s.-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (normalizedSearch) {
        const pattern = `*${normalizedSearch}*`;
        query.or = `(title.ilike.${pattern},description.ilike.${pattern},address.ilike.${pattern},cuisine.ilike.${pattern},category.ilike.${pattern})`;
      }
      return request('venues', {
        prefer: 'count=exact',
        query,
        withMetadata: true
      });
    },
    async publicCatalogSummary() {
      try {
        const summary = await request('rpc/public_catalog_summary', {
          method: 'POST',
          body: {}
        });
        return normalizePublicCatalogSummary(summary);
      } catch (error) {
        if (!missingPublicCatalogSummaryRpc(error)) throw error;
        return compatiblePublicCatalogSummary();
      }
    },
    async publicVenueSlugs() {
      const slugs = [];
      let expectedTotal = null;
      while (true) {
        const page = await request('venues', {
          prefer: 'count=exact',
          query: {
            select: 'slug',
            status: 'eq.published',
            order: 'slug.asc',
            limit: PUBLIC_SITEMAP_PAGE_SIZE,
            offset: slugs.length
          },
          withMetadata: true
        });
        if (!Number.isInteger(page.total) || page.total < 0
          || (expectedTotal !== null && page.total !== expectedTotal)) {
          const error = new Error('Published venue slug batch is incomplete');
          error.statusCode = 503;
          throw error;
        }
        expectedTotal ??= page.total;
        if (expectedTotal > PUBLIC_SITEMAP_MAX_SLUGS
          || page.items.length === 0 && slugs.length < expectedTotal
          || slugs.length + page.items.length > expectedTotal) {
          const error = new Error('Published venue slug batch is incomplete');
          error.statusCode = 503;
          throw error;
        }
        slugs.push(...page.items.map((venue) => venue?.slug));
        if (slugs.length === expectedTotal) return slugs;
      }
    },
    async publishedVenueBySlug(slug) {
      const rows = await request('venues', {
        query: {
          select: 'id,slug,title,city,category,cuisine,description,address,phone,website,hours,average_check,features,photos,source,status,created_at,updated_at',
          status: 'eq.published',
          slug: `eq.${slug}`,
          limit: 1
        }
      });
      const venue = rows?.[0];
      return venue?.status === 'published' ? venue : null;
    },
    async createVenueSubmission(payload) {
      const rows = await request('venue_submissions', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async createVenueSubmissionWithMedia(payload, mediaIds, ownerId) {
      return request('rpc/create_venue_submission_with_media', {
        method: 'POST',
        body: { p_payload: payload, p_media_ids: mediaIds, p_owner: ownerId }
      });
    },
    async createMediaAsset(asset) {
      const rows = await request('media_assets', {
        timeoutMs: signedUploadDbOperationTimeoutMs,
        method: 'POST',
        prefer: 'return=representation',
        body: asset
      });
      return rows?.[0] || null;
    },
    async claimMediaAsset({ id, ownerId }) {
      const rows = await request('media_assets', {
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `eq.${id}`,
          owner_id: `eq.${ownerId}`,
          status: 'eq.signed',
          expires_at: `gt.${new Date().toISOString()}`
        },
        body: { status: 'processing' }
      });
      return rows?.[0] || null;
    },
    async mediaAssetsByIds({ ids, ownerId }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        query: {
          select: '*',
          id: `in.(${uniqueIds.join(',')})`,
          ...(ownerId ? { owner_id: `eq.${ownerId}` } : {})
        }
      });
    },
    async mediaAssetsForSubmission(submissionId) {
      return request('media_assets', {
        timeoutMs: MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
        query: { select: '*', submission_id: `eq.${submissionId}`, order: 'created_at.asc' }
      });
    },
    async mediaAssetsForApprovedVenue(venueId) {
      const submissions = await request('venue_submissions', {
        query: { select: 'id', approved_venue_id: `eq.${venueId}`, limit: 1 }
      });
      const submissionId = submissions?.[0]?.id;
      if (!submissionId) return [];
      return request('media_assets', {
        query: { select: '*', submission_id: `eq.${submissionId}`, order: 'created_at.asc' }
      });
    },
    async expiredMediaAssets(limit = 20, { recoverPublications = true, timeoutMs } = {}) {
      // Upload sign calls this bounded pass opportunistically. Recover old
      // publication leases first, but never delete their commit-ambiguous
      // public bytes or persisted manifests.
      if (recoverPublications) await recoverStaleMediaPublications({ limit, timeoutMs });
      return request('media_assets', {
        timeoutMs,
        query: {
          select: '*',
          status: 'in.(signed,processing,processed,cleanup_pending,failed)',
          or: '(and(submission_id.is.null,status.neq.cleanup_pending),and(status.eq.cleanup_pending,staging_cleanup_pending.eq.false))',
          staging_cleanup_pending: 'eq.false',
          expires_at: `lt.${new Date().toISOString()}`,
          order: 'expires_at.asc',
          limit: Math.min(Math.max(Number(limit) || 20, 1), 50)
        }
      });
    },
    async stagingMediaCleanupPending(limit = 20, { timeoutMs } = {}) {
      return request('media_assets', {
        timeoutMs,
        query: {
          select: '*',
          staging_cleanup_pending: 'eq.true',
          staging_token_expires_at: `lt.${new Date(Date.now() - SIGNED_UPLOAD_CLEANUP_GRACE_MS).toISOString()}`,
          order: 'staging_token_expires_at.asc',
          limit: Math.min(Math.max(Number(limit) || 20, 1), 50)
        }
      });
    },
    async publishedMediaCleanupPending(limit = 20, { timeoutMs } = {}) {
      return request('media_assets', {
        timeoutMs,
        query: {
          select: '*',
          status: 'eq.published',
          review_cleanup_pending: 'eq.true',
          order: 'updated_at.asc',
          limit: Math.min(Math.max(Number(limit) || 20, 1), 50)
        }
      });
    },
    async completeMediaProcessing({ id, ownerId, reviewManifest, actual }) {
      const rows = await request('media_assets', {
        method: 'PATCH',
        prefer: 'return=representation',
        query: { id: `eq.${id}`, owner_id: `eq.${ownerId}`, status: 'eq.processing' },
        body: {
          status: 'processed',
          review_manifest: reviewManifest,
          actual_content_type: actual.contentType,
          width: actual.width,
          height: actual.height
        }
      });
      return rows?.[0] || null;
    },
    async stageReviewMediaManifest({ id, ownerId, reviewManifest }) {
      const rows = await request('media_assets', {
        method: 'PATCH',
        prefer: 'return=representation',
        query: { id: `eq.${id}`, owner_id: `eq.${ownerId}`, status: 'eq.processing' },
        body: { review_manifest: reviewManifest, review_cleanup_pending: true }
      });
      return rows?.[0] || null;
    },
    async completeStagingCleanup({ ids, ownerId, timeoutMs }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          staging_cleanup_pending: 'eq.true',
          staging_token_expires_at: `lt.${new Date(Date.now() - SIGNED_UPLOAD_CLEANUP_GRACE_MS).toISOString()}`,
          ...(ownerId ? { owner_id: `eq.${ownerId}` } : {})
        },
        body: { staging_cleanup_pending: false }
      });
    },
    async claimMediaPublication({ ids, submissionId }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return { assets: [], publicationLeaseId: null };
      await recoverStaleMediaPublications({
        limit: uniqueIds.length,
        ids: uniqueIds,
        submissionId
      });
      const publicationLeaseId = crypto.randomUUID();
      const assets = await request('media_assets', {
        timeoutMs: MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.attached'
        },
        body: { status: 'publishing', publication_lease_id: publicationLeaseId }
      });
      return { assets, publicationLeaseId };
    },
    async attachedPublicMediaCleanupPending(limit = 20, { timeoutMs } = {}) {
      return request('media_assets', {
        timeoutMs,
        query: {
          select: '*',
          status: 'eq.attached',
          public_cleanup_pending: 'eq.true',
          order: 'updated_at.asc',
          limit: Math.min(Math.max(Number(limit) || 20, 1), 50)
        }
      });
    },
    async claimAttachedPublicMediaCleanup({ id, submissionId, timeoutMs = MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS }) {
      const publicationLeaseId = crypto.randomUUID();
      const rows = await request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `eq.${id}`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.attached',
          public_cleanup_pending: 'eq.true'
        },
        body: { status: 'publishing', publication_lease_id: publicationLeaseId }
      });
      return { asset: rows?.[0] || null, publicationLeaseId };
    },
    async releaseMediaPublication({ ids, submissionId, publicationLeaseId, timeoutMs = MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.publishing',
          publication_lease_id: `eq.${publicationLeaseId}`
        },
        body: { status: 'attached', publication_lease_id: null }
      });
    },
    async releaseStaleMediaPublication(submissionId) {
      return recoverStaleMediaPublications({ submissionId });
    },
    async recoverStaleMediaPublications(options = {}) {
      return recoverStaleMediaPublications(options);
    },
    async stagePublicMediaManifest({ id, submissionId, publicationLeaseId, manifest }) {
      const rows = await request('media_assets', {
        timeoutMs: MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `eq.${id}`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.publishing',
          publication_lease_id: `eq.${publicationLeaseId}`
        },
        body: { public_manifest: manifest, public_cleanup_pending: true }
      });
      return rows?.[0] || null;
    },
    async claimStagedPublicMediaCleanup({
      ids,
      submissionId,
      publicationLeaseId,
      timeoutMs = MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS
    }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.publishing',
          publication_lease_id: `eq.${publicationLeaseId}`
        },
        body: { public_cleanup_pending: true }
      });
    },
    async clearStagedPublicMedia({
      ids,
      submissionId,
      publicationLeaseId,
      timeoutMs = MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS
    }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          submission_id: `eq.${submissionId}`,
          status: 'eq.publishing',
          publication_lease_id: `eq.${publicationLeaseId}`
        },
        body: { public_manifest: {}, public_cleanup_pending: false }
      });
    },
    async markMediaCleanupPending({ ids, ownerId, includeAttached = false, timeoutMs }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          status: includeAttached
            ? 'in.(signed,processing,processed,attached,cleanup_pending,failed)'
            : 'in.(signed,processing,processed,cleanup_pending,failed)',
          ...(ownerId ? { owner_id: `eq.${ownerId}` } : {})
        },
        body: { status: 'cleanup_pending', expires_at: new Date().toISOString() }
      });
    },
    async deleteMediaAssets({
      ids,
      ownerId,
      includeAttached = false,
      cleanupClaimed = false,
      timeoutMs
    }) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'DELETE',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          status: cleanupClaimed
            ? 'eq.cleanup_pending'
            : includeAttached
              ? 'in.(signed,processing,processed,attached,cleanup_pending,failed)'
              : 'in.(signed,processing,processed,cleanup_pending,failed)',
          staging_cleanup_pending: 'eq.false',
          ...(ownerId ? { owner_id: `eq.${ownerId}` } : {})
        }
      });
    },
    async completeReviewCleanup(ids, { ownerId, timeoutMs } = {}) {
      const uniqueIds = [...new Set(ids || [])];
      if (!uniqueIds.length) return [];
      return request('media_assets', {
        timeoutMs,
        method: 'PATCH',
        prefer: 'return=representation',
        query: {
          id: `in.(${uniqueIds.join(',')})`,
          status: 'eq.published',
          review_cleanup_pending: 'eq.true',
          ...(ownerId ? { owner_id: `eq.${ownerId}` } : {})
        },
        body: { review_manifest: {}, review_cleanup_pending: false }
      });
    },
    async createReviewSubmission(payload) {
      const rows = await request('review_submissions', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async profileById(id) {
      try {
        const rows = await request('profiles', { query: { select: '*', id: `eq.${id}`, limit: 1 } });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        return profileFromAuthUser(await authUserById(id).catch(() => null));
      }
    },
    async profileByLogin(login) {
      const normalized = String(login || '').trim().toLowerCase();
      const filter = normalized.includes('@') ? { email: `eq.${normalized}` } : { username: `eq.${normalized}` };
      try {
        const rows = await request('profiles', { query: { select: '*', ...filter, limit: 1 } });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const users = await listAuthUsers();
        const user = users.find((item) => String(item.email || '').toLowerCase() === normalized || String(item.user_metadata?.username || '').toLowerCase() === normalized);
        return profileFromAuthUser(user);
      }
    },
    async saveProfile(profile) {
      try {
        const rows = await request('profiles', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: profile });
        return rows?.[0] || null;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const user = await updateAuthMetadata(profile.id, {
          user_metadata: { username: profile.username, display_name: profile.display_name, phone: profile.phone || '' },
          app_metadata: { mesto_role: profile.role, mesto_status: profile.status, must_change_password: Boolean(profile.must_change_password), mesto_session_version: Number(profile.session_version || 0), mesto_email_is_internal: Boolean(profile.email_is_internal) }
        });
        return profileFromAuthUser(user);
      }
    },
    async updateProfile(id, patch) {
      try {
        const rows = await request('profiles', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: patch });
        if (rows?.[0]) return rows[0];
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await updateAuthMetadata(id, {
        user_metadata: { ...(patch.username !== undefined ? { username: patch.username } : {}), ...(patch.display_name !== undefined ? { display_name: patch.display_name } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}) },
        app_metadata: { ...(patch.role !== undefined ? { mesto_role: patch.role } : {}), ...(patch.status !== undefined ? { mesto_status: patch.status } : {}), ...(patch.must_change_password !== undefined ? { must_change_password: Boolean(patch.must_change_password) } : {}), ...(patch.session_version !== undefined ? { mesto_session_version: Number(patch.session_version) } : {}), ...(patch.email_is_internal !== undefined ? { mesto_email_is_internal: Boolean(patch.email_is_internal) } : {}) }
      });
      return profileFromAuthUser(user);
    },
    async listFavorites(userId) {
      let stored = [];
      try {
        stored = await request('favorites', { query: { select: '*', user_id: `eq.${userId}`, order: 'created_at.desc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const metadata = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
      return [...new Map([...metadata, ...stored].map((item) => [item.venue_key, item])).values()];
    },
    async saveFavorite(payload) {
      try {
        const rows = await request('favorites', { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: payload });
        const favorite = rows?.[0] || null;
        const user = await authUserById(payload.user_id);
        const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
        if (current.some((item) => item.venue_key === payload.venue_key)) {
          await updateAuthMetadata(payload.user_id, { user_metadata: { mesto_favorites: current.filter((item) => item.venue_key !== payload.venue_key) } });
        }
        return favorite;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        const user = await authUserById(payload.user_id);
        const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
        const favorite = { ...payload, created_at: new Date().toISOString() };
        const next = [...current.filter((item) => item.venue_key !== payload.venue_key), favorite].slice(-500);
        await updateAuthMetadata(payload.user_id, { user_metadata: { mesto_favorites: next } });
        return favorite;
      }
    },
    async deleteFavorite(userId, venueKey) {
      let removed = [];
      try {
        removed = await request('favorites', { method: 'DELETE', prefer: 'return=representation', query: { user_id: `eq.${userId}`, venue_key: `eq.${venueKey}` } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const current = Array.isArray(user.user_metadata?.mesto_favorites) ? user.user_metadata.mesto_favorites : [];
      if (current.some((item) => item.venue_key === venueKey)) {
        await updateAuthMetadata(userId, { user_metadata: { mesto_favorites: current.filter((item) => item.venue_key !== venueKey) } });
      }
      return removed;
    },
    async dashboard() {
      const [venues, submissions, reviews, merchants] = await Promise.all([
        request('venues', { query: { select: '*', order: 'updated_at.desc', limit: 500 } }),
        request('venue_submissions', { query: { select: '*', order: 'created_at.desc', limit: 200 } }),
        request('review_submissions', { query: { select: '*', order: 'created_at.desc', limit: 200 } }),
        request('profiles', { query: { select: 'id', role: 'eq.merchant', limit: 500 } }).catch(async (error) => {
          if (!missingExtendedSchema(error)) throw error;
          return (await listAuthUsers()).filter((user) => profileFromAuthUser(user)?.role === 'merchant');
        })
      ]);
      const published = venues.filter((item) => item.status === 'published');
      return {
        stats: {
          venues: published.length,
          pendingVenues: submissions.filter((item) => item.status === 'pending').length,
          pendingReviews: reviews.filter((item) => item.status === 'pending').length,
          cities: new Set(published.map((item) => item.city).filter(Boolean)).size,
          merchants: merchants.length
        },
        venues,
        submissions,
        reviews
      };
    },
    async saveVenue(payload, id) {
      if (id) {
        const rows = await request('venues', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
        return rows?.[0] || null;
      }
      const rows = await request('venues', { method: 'POST', prefer: 'return=representation', body: payload });
      return rows?.[0] || null;
    },
    async deleteVenueWithMedia(id) {
      return request('rpc/delete_venue_with_media', { method: 'POST', body: { p_venue_id: id } });
    },
    async listMerchants() {
      const venues = await request('venues', { query: { select: 'id,title,city,category,status', order: 'title.asc', limit: 1000 } });
      let profiles = [];
      let memberships = [];
      try {
        [profiles, memberships] = await Promise.all([
          request('profiles', { query: { select: '*', role: 'eq.merchant', order: 'created_at.desc', limit: 500 } }),
          request('venue_memberships', { query: { select: '*', order: 'created_at.desc', limit: 1000 } })
        ]);
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const users = (await listAuthUsers()).filter((user) => profileFromAuthUser(user)?.role === 'merchant');
      const metadataProfiles = users.map(profileFromAuthUser);
      const metadataMemberships = users.flatMap((user) => (user.app_metadata?.mesto_venue_ids || []).map((venueId) => ({
        id: `${user.id}:${venueId}`,
        user_id: user.id,
        venue_id: venueId,
        membership_role: user.app_metadata?.mesto_membership_role || 'owner',
        created_at: user.created_at
      })));
      profiles = [...new Map([...metadataProfiles, ...profiles].map((profile) => [profile.id, profile])).values()];
      memberships = [...new Map([...metadataMemberships, ...memberships].map((membership) => [`${membership.user_id}:${membership.venue_id}`, membership])).values()];
      const venueMap = new Map(venues.map((venue) => [venue.id, venue]));
      return profiles.map((profile) => ({
        ...profile,
        memberships: memberships.filter((item) => item.user_id === profile.id).map((item) => ({ ...item, venue: venueMap.get(item.venue_id) || null }))
      }));
    },
    async listMemberships(userId) {
      let stored = [];
      try {
        stored = await request('venue_memberships', { query: { select: '*', user_id: `eq.${userId}`, order: 'created_at.asc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_venue_ids || []).map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: user.app_metadata?.mesto_membership_role || 'owner' }));
      return [...new Map([...metadata, ...stored].map((item) => [item.venue_id, item])).values()];
    },
    async replaceMemberships(userId, venueIds, membershipRole = 'owner') {
      const role = normalizeMembershipRole(membershipRole);
      if (!role) throw Object.assign(new Error('Некорректная роль ресторатора.'), { statusCode: 400 });
      const normalizedVenueIds = [...new Set(venueIds.map(String))];
      if (normalizedVenueIds.length) {
        const existingVenues = await request('venues', { query: { select: 'id', id: `in.(${normalizedVenueIds.join(',')})`, limit: normalizedVenueIds.length } });
        if (existingVenues.length !== normalizedVenueIds.length) throw Object.assign(new Error('Одно из назначенных заведений не найдено.'), { statusCode: 400 });
      }
      try {
        const current = await request('venue_memberships', { query: { select: '*', user_id: `eq.${userId}`, limit: 500 } });
        let memberships = [];
        if (normalizedVenueIds.length) {
          memberships = await request('venue_memberships', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=representation',
            query: { on_conflict: 'venue_id,user_id' },
            body: normalizedVenueIds.map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: role, permissions: permissionsForRole(role) }))
          });
        }
        const obsolete = current.filter((item) => !normalizedVenueIds.includes(item.venue_id)).map((item) => item.venue_id);
        if (obsolete.length) await request('venue_memberships', { method: 'DELETE', query: { user_id: `eq.${userId}`, venue_id: `in.(${obsolete.join(',')})` } });
        await updateAuthMetadata(userId, { app_metadata: { mesto_venue_ids: [], mesto_membership_role: role } }).catch(() => null);
        return memberships;
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
        await updateAuthMetadata(userId, { app_metadata: { mesto_venue_ids: normalizedVenueIds, mesto_membership_role: role } });
        return normalizedVenueIds.map((venueId) => ({ user_id: userId, venue_id: venueId, membership_role: role, permissions: permissionsForRole(role) }));
      }
    },
    async venuesByIds(ids) {
      if (!ids.length) return [];
      return request('venues', { query: { select: '*', id: `in.(${ids.join(',')})`, order: 'title.asc', limit: 500 } });
    },
    async menuForVenues(ids, userId) {
      if (!ids.length) return [];
      let stored = [];
      try {
        stored = await request('menu_items', { query: { select: '*', venue_id: `in.(${ids.join(',')})`, order: 'section.asc,sort_order.asc', limit: 1000 } });
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (!userId) return stored;
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_menu || []).filter((item) => ids.includes(item.venue_id));
      return [...new Map([...metadata, ...stored].map((item) => [item.id, item])).values()];
    },
    async saveMenuItem(payload, id, userId) {
      let item;
      try {
        if (id) {
          const rows = await request('menu_items', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
          if (rows?.[0]) item = rows[0];
          else {
            const inserted = await request('menu_items', { method: 'POST', prefer: 'return=representation', body: { ...payload, id } });
            item = inserted?.[0] || null;
          }
        } else {
          const rows = await request('menu_items', { method: 'POST', prefer: 'return=representation', body: payload });
          item = rows?.[0] || null;
        }
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
        const user = await authUserById(userId);
        const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
        const item = { ...payload, id: id || crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const next = [...current.filter((entry) => entry.id !== item.id), item];
        await updateAuthMetadata(userId, { app_metadata: { mesto_menu: next } });
        return item;
      }
      if (userId && id) {
        await attemptPostCommit(async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
          if (current.some((entry) => entry.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_menu: current.filter((entry) => entry.id !== id) } });
          }
        });
      }
      return item;
    },
    async deleteMenuItem(id, userId) {
      let removed = [];
      let databaseCommitted = false;
      try {
        removed = await request('menu_items', { method: 'DELETE', prefer: 'return=representation', query: { id: `eq.${id}` } });
        databaseCommitted = true;
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (userId) {
        const removeLegacyItem = async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [];
          if (current.some((item) => item.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_menu: current.filter((item) => item.id !== id) } });
          }
        };
        if (databaseCommitted) await attemptPostCommit(removeLegacyItem);
        else await removeLegacyItem();
      }
      return removed;
    },
    async promotionsForVenues(ids, userId) {
      if (!ids.length) return [];
      let stored = [];
      try {
        stored = await request('promotions', { query: { select: '*', venue_id: `in.(${ids.join(',')})`, order: 'created_at.desc', limit: 500 } });
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (!userId) return stored;
      const user = await authUserById(userId);
      const metadata = (user.app_metadata?.mesto_promotions || []).filter((item) => ids.includes(item.venue_id));
      return [...new Map([...metadata, ...stored].map((item) => [item.id, item])).values()];
    },
    async publicVenueContent(venueId) {
      let menu = [];
      let promotions = [];
      try {
        [menu, promotions] = await Promise.all([
          request('menu_items', { query: { select: 'id,venue_id,section,title,description,price,photo_url,is_available,sort_order', venue_id: `eq.${venueId}`, is_available: 'eq.true', order: 'section.asc,sort_order.asc', limit: 300 } }),
          request('promotions', { query: { select: 'id,venue_id,title,description,starts_at,ends_at,status', venue_id: `eq.${venueId}`, status: 'eq.active', order: 'created_at.desc', limit: 100 } })
        ]);
      } catch (error) {
        if (!missingExtendedSchema(error)) throw error;
      }
      const users = await listAuthUsers();
      const metadataMenu = users.flatMap((user) => Array.isArray(user.app_metadata?.mesto_menu) ? user.app_metadata.mesto_menu : [])
        .filter((item) => item.venue_id === venueId && item.is_available !== false);
      const metadataPromotions = users.flatMap((user) => Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [])
        .filter((item) => item.venue_id === venueId && item.status === 'active');
      const unique = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
      return {
        menu: unique([...menu, ...metadataMenu]).sort((a, b) => String(a.section || '').localeCompare(String(b.section || ''), 'ru') || Number(a.sort_order || 0) - Number(b.sort_order || 0)),
        promotions: unique([...promotions, ...metadataPromotions]).filter((item) => (!item.starts_at || new Date(item.starts_at).getTime() <= Date.now()) && (!item.ends_at || new Date(item.ends_at).getTime() >= Date.now()))
      };
    },
    async savePromotion(payload, id, userId) {
      let item;
      try {
        if (id) {
          const rows = await request('promotions', { method: 'PATCH', prefer: 'return=representation', query: { id: `eq.${id}` }, body: payload });
          if (rows?.[0]) item = rows[0];
          else {
            const inserted = await request('promotions', { method: 'POST', prefer: 'return=representation', body: { ...payload, id } });
            item = inserted?.[0] || null;
          }
        } else {
          const rows = await request('promotions', { method: 'POST', prefer: 'return=representation', body: payload });
          item = rows?.[0] || null;
        }
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
        const user = await authUserById(userId);
        const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
        const item = { ...payload, id: id || crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const next = [...current.filter((entry) => entry.id !== item.id), item];
        await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: next } });
        return item;
      }
      if (userId && id) {
        await attemptPostCommit(async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
          if (current.some((entry) => entry.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: current.filter((entry) => entry.id !== id) } });
          }
        });
      }
      return item;
    },
    async deletePromotion(id, userId) {
      let removed = [];
      let databaseCommitted = false;
      try {
        removed = await request('promotions', { method: 'DELETE', prefer: 'return=representation', query: { id: `eq.${id}` } });
        databaseCommitted = true;
      } catch (error) {
        if (!missingExtendedSchema(error) || !userId) throw error;
      }
      if (userId) {
        const removeLegacyItem = async () => {
          const user = await authUserById(userId);
          const current = Array.isArray(user.app_metadata?.mesto_promotions) ? user.app_metadata.mesto_promotions : [];
          if (current.some((item) => item.id === id)) {
            await updateAuthMetadata(userId, { app_metadata: { mesto_promotions: current.filter((item) => item.id !== id) } });
          }
        };
        if (databaseCommitted) await attemptPostCommit(removeLegacyItem);
        else await removeLegacyItem();
      }
      return removed;
    },
    async audit(entry) {
      try { return await request('audit_log', { method: 'POST', body: entry }); }
      catch (error) { if (missingExtendedSchema(error)) return null; throw error; }
    },
    async moderateSubmission({ id, decision, note, moderator, publicManifests = {}, publicationLeaseId = null }) {
      return request('rpc/moderate_venue_submission_with_media', {
        timeoutMs: MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
        method: 'POST',
        body: {
          p_submission_id: id,
          p_decision: decision,
          p_note: note || '',
          p_moderator: moderator || null,
          p_media_public_manifests: publicManifests,
          p_media_publication_lease_id: publicationLeaseId
        }
      });
    },
    async moderateReview({ id, decision, note, moderator }) {
      return request('rpc/moderate_review_submission', { method: 'POST', body: { p_review_id: id, p_decision: decision, p_note: note || '', p_moderator: moderator || null } });
    },
    venueFromSubmission
  };
}

module.exports = {
  MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
  MEDIA_PUBLICATION_LEASE_MS,
  MEDIA_PUBLICATION_RECOVERY_LIMIT,
  SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS,
  SIGNED_UPLOAD_CLEANUP_GRACE_MS,
  StoreConfigurationError,
  authRequest,
  configuration,
  createStore,
  request,
  venueFromSubmission
};
