const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  cleanupExpiredMedia,
  cleanupFailedFinalization,
  createSignedUploadReceipt,
  mediaIds,
  ownedMediaReceipt,
  release: releaseHandler,
  releaseOwnedMedia,
  status: statusHandler,
  uploadReviewVariants
} = require('../handlers/uploads');
const {
  ambiguousModerationCommit,
  clearStagedPublicMedia,
  publishSubmissionMedia,
  publicMediaResponse,
  settleFailedModerationPublication
} = require('../handlers/admin/submissions');
const { cleanupDeletedVenueMedia } = require('../handlers/admin/venues');
const { signSession } = require('../lib/security');
const {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE_OPERATION_TIMEOUT_MS,
  MediaStorageError,
  PUBLIC_BUCKET,
  REVIEW_BUCKET,
  STAGING_BUCKET
} = require('../lib/media-storage');
const {
  MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS,
  MEDIA_PUBLICATION_LEASE_MS,
  SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS,
  SIGNED_UPLOAD_CLEANUP_GRACE_MS,
  createStore,
  request
} = require('../lib/supabase');

const ownerId = '10000000-0000-4000-8000-000000000001';
const firstId = '20000000-0000-4000-8000-000000000002';
const secondId = '30000000-0000-4000-8000-000000000003';
const thirdId = '40000000-0000-4000-8000-000000000004';
const fourthId = '50000000-0000-4000-8000-000000000005';

function jsonResponse(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function asset(id, status = 'processed') {
  return {
    id,
    owner_id: ownerId,
    status,
    staging_path: `${ownerId}/${id}/source.png`,
    staging_token_expires_at: '2026-08-11T14:00:00.000Z',
    staging_cleanup_pending: true,
    review_manifest: {
      thumb: { path: `${ownerId}/${id}/v1/thumb.webp` },
      card: { path: `${ownerId}/${id}/v1/card.webp` },
      hero: { path: `${ownerId}/${id}/v1/hero.webp` }
    }
  };
}

let releaseHandlerAddress = 0;

async function invokeStatusHandler({ mediaId = firstId, rows = [] } = {}) {
  const originalFetch = global.fetch;
  const environment = Object.fromEntries([
    'MESTO_PUBLIC_ORIGIN',
    'MESTO_USER_SESSION_SECRET',
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VERCEL_ENV'
  ].map((name) => [name, process.env[name]]));
  const userSecret = 'media-status-user-secret-that-is-long-enough';
  const publicOrigin = 'https://media-status.example';
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    typ: 'mesto.user-session',
    aud: 'mesto.public',
    version: 1,
    sub: ownerId,
    role: 'customer',
    sv: 0,
    iat: now,
    exp: now + 60
  }, userSecret);
  let mediaReads = 0;
  try {
    process.env.MESTO_PUBLIC_ORIGIN = publicOrigin;
    process.env.MESTO_USER_SESSION_SECRET = userSecret;
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://media-status.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-status-service-role';
    delete process.env.VERCEL_ENV;
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
        return jsonResponse([{ id: ownerId, role: 'customer', status: 'active', session_version: 0 }]);
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'GET') {
        mediaReads += 1;
        assert.equal(url.searchParams.get('owner_id'), `eq.${ownerId}`);
        assert.equal(url.searchParams.get('id'), `in.(${mediaId})`);
        return jsonResponse(rows);
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    const response = {
      headers: {},
      statusCode: null,
      body: null,
      setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
      getHeader(name) { return this.headers[String(name).toLowerCase()]; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return body; }
    };
    await statusHandler({
      method: 'GET',
      query: { mediaId },
      headers: { cookie: `mesto_session=${encodeURIComponent(token)}` },
      socket: { remoteAddress: `media-status-handler-${++releaseHandlerAddress}` }
    }, response);
    return { response, mediaReads };
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function invokeReleaseHandler({ ids, completion = 'exact', deletion = 'exact' }) {
  const originalFetch = global.fetch;
  const environment = Object.fromEntries([
    'MESTO_ADMIN_SESSION_SECRET',
    'MESTO_PUBLIC_ORIGIN',
    'MESTO_USER_SESSION_SECRET',
    'NODE_ENV',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VERCEL_ENV'
  ].map((name) => [name, process.env[name]]));
  const userSecret = 'media-release-user-secret-that-is-long-enough';
  const publicOrigin = 'https://media-release.example';
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({
    typ: 'mesto.user-session',
    aud: 'mesto.public',
    version: 1,
    sub: ownerId,
    role: 'customer',
    sv: 0,
    iat: now,
    exp: now + 60
  }, userSecret);
  const claimed = ids.map((id) => asset(id, 'cleanup_pending'));
  const completed = claimed.map((row) => ({ ...row, staging_cleanup_pending: false }));
  const calls = [];
  try {
    delete process.env.MESTO_ADMIN_SESSION_SECRET;
    process.env.MESTO_PUBLIC_ORIGIN = publicOrigin;
    process.env.MESTO_USER_SESSION_SECRET = userSecret;
    process.env.NODE_ENV = 'test';
    process.env.SUPABASE_URL = 'https://media-release.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-release-service-role';
    delete process.env.VERCEL_ENV;
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      calls.push(`${method} ${url.pathname}`);
      if (url.pathname === '/rest/v1/profiles' && method === 'GET') {
        return jsonResponse([{ id: ownerId, role: 'customer', status: 'active', session_version: 0 }]);
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'PATCH') {
        const body = JSON.parse(init.body);
        if (body.status === 'cleanup_pending') return jsonResponse(claimed);
        if (body.staging_cleanup_pending === false) {
          if (completion === 'empty') return jsonResponse([]);
          if (completion === 'partial') return jsonResponse(completed.slice(0, 1));
          return jsonResponse(completed);
        }
      }
      if (url.pathname.startsWith('/storage/v1/object/') && method === 'DELETE') {
        const { prefixes } = JSON.parse(init.body);
        return jsonResponse(prefixes.map((name) => ({ name })));
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'DELETE') {
        if (deletion === 'empty') return jsonResponse([]);
        if (deletion === 'partial') return jsonResponse(completed.slice(0, 1));
        return jsonResponse(completed);
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    const response = {
      headers: {},
      statusCode: null,
      body: null,
      setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
      getHeader(name) { return this.headers[String(name).toLowerCase()]; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return body; }
    };
    await releaseHandler({
      method: 'POST',
      body: { mediaIds: ids },
      headers: {
        cookie: `mesto_session=${encodeURIComponent(token)}`,
        origin: publicOrigin,
        'sec-fetch-site': 'same-origin'
      },
      socket: { remoteAddress: `media-release-handler-${++releaseHandlerAddress}` }
    }, response);
    return { response, calls };
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function processedMedia() {
  return {
    original: { contentType: 'image/png', width: 1200, height: 800, bytes: 42 },
    variants: Object.fromEntries(['thumb', 'card', 'hero'].map((name, index) => [name, {
      bytes: Buffer.from(`${name}-webp`),
      width: 320 * (index + 1),
      height: 240 * (index + 1),
      size: Buffer.byteLength(`${name}-webp`),
      contentType: 'image/webp'
    }]))
  };
}

function publicManifest(mediaId, version) {
  return Object.fromEntries(['thumb', 'card', 'hero'].map((name) => [name, {
    path: `assets/${mediaId}/${version}/${name}.webp`,
    url: `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/assets/${mediaId}/${version}/${name}.webp`,
    width: 640,
    height: 480,
    bytes: 42,
    contentType: 'image/webp'
  }]));
}

test('validates bounded unique media receipts', () => {
  assert.deepEqual(mediaIds([firstId, secondId]), [firstId, secondId]);
  assert.equal(mediaIds([firstId, firstId]), null);
  assert.equal(mediaIds(['not-a-uuid']), null);
  assert.equal(mediaIds(new Array(7).fill(firstId)), null);
});

test('owner-scoped media status exposes only exact receipt existence', () => {
  assert.deepEqual(ownedMediaReceipt([], firstId, ownerId), {
    mediaId: firstId,
    exists: false
  });
  assert.deepEqual(ownedMediaReceipt([asset(firstId, 'signed')], firstId, ownerId), {
    mediaId: firstId,
    exists: true
  });
  assert.equal(ownedMediaReceipt([asset(firstId), asset(firstId)], firstId, ownerId), null);
  assert.equal(ownedMediaReceipt([{ ...asset(firstId), owner_id: secondId }], firstId, ownerId), null);
  assert.equal(ownedMediaReceipt([{ ...asset(firstId), id: secondId }], firstId, ownerId), null);
  assert.equal(ownedMediaReceipt(null, firstId, ownerId), null);
});

test('owner-scoped media status handler proves presence and absence without paths', async () => {
  const present = await invokeStatusHandler({ rows: [asset(firstId, 'signed')] });
  assert.equal(present.response.statusCode, 200);
  assert.deepEqual(present.response.body, { mediaId: firstId, exists: true });
  assert.equal(present.response.headers['cache-control'], 'private, no-store, max-age=0');
  assert.equal(present.response.headers.vary, 'Cookie');
  assert.equal(present.response.headers['x-robots-tag'], 'noindex');
  assert.equal(present.mediaReads, 1);

  const absent = await invokeStatusHandler({ rows: [] });
  assert.equal(absent.response.statusCode, 200);
  assert.deepEqual(absent.response.body, { mediaId: firstId, exists: false });
  assert.equal(absent.mediaReads, 1);

  const malformed = await invokeStatusHandler({ rows: [asset(firstId), asset(firstId)] });
  assert.equal(malformed.response.statusCode, 502);
  assert.equal(malformed.response.body.code, 'MEDIA_STATUS_UNAVAILABLE');
});

test('owner-scoped media status rejects invalid IDs before a media read', async () => {
  const invalid = await invokeStatusHandler({ mediaId: 'not-a-uuid' });
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.response.body.code, 'MEDIA_ID_INVALID');
  assert.equal(invalid.mediaReads, 0);
});

test('additive tombstone migration enforces immutable expiry, grace, and delete fencing', () => {
  const sql = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260811163000_signed_upload_tombstones.sql'
  ), 'utf8');
  assert.match(sql, /add column if not exists staging_token_expires_at timestamptz/i);
  assert.match(sql, /greatest\(expires_at, created_at \+ interval '2 hours'\)/i);
  assert.match(sql, /set staging_cleanup_pending = true[\s\S]*where not staging_cleanup_pending[\s\S]*clock_timestamp\(\) < staging_token_expires_at \+ interval '5 minutes'/i);
  assert.match(sql, /staging_token_expires_at is distinct from old\.staging_token_expires_at/i);
  assert.match(sql, /staging_token_expires_at \+ interval '5 minutes'/i);
  assert.match(sql, /before delete on public\.media_assets/i);
  assert.match(sql, /if old\.staging_cleanup_pending then/i);
});

test('publication operation deadlines leave more than half the stale lease for cleanup', () => {
  // Conservative upper bound for six assets: all variant downloads/uploads,
  // DB stages/CAS calls, stale recovery, final RPC and both cleanup paths.
  const worstCaseProviderOperations = 40;
  const worstCaseDatabaseOperations = 24;
  const boundedAttemptMs = worstCaseProviderOperations * MEDIA_STORAGE_OPERATION_TIMEOUT_MS
    + worstCaseDatabaseOperations * MEDIA_PUBLICATION_DB_OPERATION_TIMEOUT_MS;
  assert.ok(boundedAttemptMs < MEDIA_PUBLICATION_LEASE_MS / 2);
});

test('receipt creation and token issuance deadlines fit strictly inside tombstone grace', () => {
  assert.ok(SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS > 0);
  assert.ok(SIGNED_UPLOAD_DB_OPERATION_TIMEOUT_MS + MEDIA_STORAGE_OPERATION_TIMEOUT_MS
    < SIGNED_UPLOAD_CLEANUP_GRACE_MS);
});

test('a delayed media receipt insert is aborted and cannot proceed to token issuance', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let capturedSignal;
  let signedUploadCalls = 0;
  try {
    process.env.SUPABASE_URL = 'https://media-sign-timeout.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-sign-timeout-service-key';
    global.fetch = async (_url, init) => {
      capturedSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    };
    const store = createStore({ signedUploadDbOperationTimeoutMs: 20 });
    await assert.rejects(
      () => createSignedUploadReceipt({
        store,
        storage: {
          signedUpload: async () => {
            signedUploadCalls += 1;
            return { uploadUrl: 'https://must-not-be-issued.invalid' };
          }
        },
        receipt: {
          id: firstId,
          owner_id: ownerId,
          status: 'signed',
          declared_content_type: 'image/png',
          declared_size: 42,
          staging_path: `${ownerId}/${firstId}/source.png`,
          staging_token_expires_at: '2026-08-11T14:00:00.000Z',
          expires_at: '2026-08-11T14:00:00.000Z'
        }
      }),
      (error) => error.code === 'SUPABASE_REQUEST_TIMEOUT' && error.statusCode === 504
    );
    assert.equal(capturedSignal.aborted, true);
    assert.equal(signedUploadCalls, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('publication database deadlines abort a stalled CAS transport', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let capturedSignal;
  try {
    process.env.SUPABASE_URL = 'https://media-timeout.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-timeout-service-key';
    global.fetch = async (_url, init) => {
      capturedSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    };
    await assert.rejects(
      () => request('media_assets', { timeoutMs: 20 }),
      (error) => error.code === 'SUPABASE_REQUEST_TIMEOUT' && error.statusCode === 504
    );
    assert.equal(capturedSignal.aborted, true);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('finalization persists every review path before the first Storage upload', async () => {
  const calls = [];
  const claimed = asset(firstId, 'processing');
  const store = {
    stageReviewMediaManifest: async ({ id, ownerId: persistedOwner, reviewManifest }) => {
      calls.push(['stage', id, persistedOwner, reviewManifest]);
      return { ...claimed, review_manifest: reviewManifest, review_cleanup_pending: true };
    }
  };
  const storage = {
    upload: async (bucket, path) => calls.push(['upload', bucket, path])
  };

  const manifest = await uploadReviewVariants({
    store,
    storage,
    asset: claimed,
    ownerId,
    processed: processedMedia()
  });

  assert.equal(calls[0][0], 'stage');
  assert.deepEqual(Object.keys(calls[0][3]), ['thumb', 'card', 'hero']);
  assert.deepEqual(calls.slice(1).map((entry) => entry.slice(0, 2)), [
    ['upload', REVIEW_BUCKET],
    ['upload', REVIEW_BUCKET],
    ['upload', REVIEW_BUCKET]
  ]);
  assert.deepEqual(calls.slice(1).map((entry) => entry[2]), Object.values(manifest).map((entry) => entry.path));
});

test('an ambiguous review-manifest commit never starts an untracked Storage upload', async () => {
  const calls = [];
  const claimed = asset(firstId, 'processing');
  const store = {
    stageReviewMediaManifest: async ({ reviewManifest }) => {
      calls.push(['stage', reviewManifest]);
      throw new TypeError('connection closed after request commit');
    }
  };
  const storage = {
    upload: async () => calls.push(['upload'])
  };

  await assert.rejects(() => uploadReviewVariants({
    store,
    storage,
    asset: claimed,
    ownerId,
    processed: processedMedia()
  }), /connection closed/);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'stage');
  assert.deepEqual(Object.keys(calls[0][1]), ['thumb', 'card', 'hero']);
});

test('an unacknowledged review cleanup plan never permits a Storage upload', async () => {
  const calls = [];
  const claimed = asset(firstId, 'processing');
  const store = {
    stageReviewMediaManifest: async ({ reviewManifest }) => ({
      ...claimed,
      review_manifest: reviewManifest,
      review_cleanup_pending: false
    })
  };
  const storage = { upload: async () => calls.push('upload') };

  await assert.rejects(() => uploadReviewVariants({
    store,
    storage,
    asset: claimed,
    ownerId,
    processed: processedMedia()
  }), (error) => error.code === 'MEDIA_REVIEW_STAGE_CONFLICT');
  assert.deepEqual(calls, []);
});

test('failed finalization never deletes Storage without an authoritative cleanup claim', async () => {
  for (const claimResult of [[], new TypeError('database unavailable')]) {
    const calls = [];
    const store = {
      markMediaCleanupPending: async () => {
        calls.push('claim');
        if (claimResult instanceof Error) throw claimResult;
        return claimResult;
      },
      deleteMediaAssets: async () => calls.push('delete')
    };
    const storage = { remove: async () => calls.push('remove') };

    assert.equal(await cleanupFailedFinalization({
      store,
      storage,
      assetId: firstId,
      ownerId
    }), false);
    assert.deepEqual(calls, ['claim']);
  }
});

test('failed finalization rejects cleanup rows with the wrong owner or state', async () => {
  for (const untrusted of [
    { ...asset(firstId, 'cleanup_pending'), owner_id: secondId },
    asset(firstId, 'processing')
  ]) {
    const calls = [];
    const store = {
      markMediaCleanupPending: async () => [untrusted],
      deleteMediaAssets: async () => calls.push('delete')
    };
    const storage = { remove: async () => calls.push('remove') };

    assert.equal(await cleanupFailedFinalization({
      store,
      storage,
      assetId: firstId,
      ownerId
    }), false);
    assert.deepEqual(calls, []);
  }
});

test('failed finalization cleans only paths returned by its cleanup_pending ownership claim', async () => {
  const calls = [];
  const claimed = asset(firstId, 'cleanup_pending');
  const store = {
    markMediaCleanupPending: async () => [claimed],
    completeStagingCleanup: async () => [{ ...claimed, staging_cleanup_pending: false }],
    deleteMediaAssets: async (options) => calls.push(['delete', options])
  };
  const storage = {
    remove: async (bucket, paths) => calls.push(['remove', bucket, paths])
  };

  assert.equal(await cleanupFailedFinalization({
    store,
    storage,
    assetId: firstId,
    ownerId
  }), true);
  assert.deepEqual(new Set(calls.filter(([operation]) => operation === 'remove').map(([, bucket]) => bucket)),
    new Set([STAGING_BUCKET, REVIEW_BUCKET]));
  assert.deepEqual(calls.at(-1), ['delete', {
    ids: [firstId],
    ownerId,
    cleanupClaimed: true
  }]);
});

test('release removes bytes early but retains the receipt while its signed token is live', async () => {
  const order = [];
  const assets = [asset(firstId, 'cleanup_pending')];
  const store = {
    markMediaCleanupPending: async ({ ids }) => { order.push(['claim', ids]); return assets; },
    completeStagingCleanup: async ({ ids }) => { order.push(['complete-staging', ids]); return []; },
    deleteMediaAssets: async ({ ids }) => order.push(['delete', ids]),
  };
  const storage = {
    remove: async (bucket, paths) => order.push(['remove', bucket, paths])
  };
  await assert.rejects(
    () => releaseOwnedMedia({ store, storage, ownerId, ids: [firstId] }),
    (error) => error.code === 'MEDIA_CLEANUP_PENDING' && error.statusCode === 409
  );
  assert.deepEqual(order.map((entry) => entry[0]), ['claim', 'remove', 'remove', 'complete-staging']);
  assert.deepEqual(new Set(order.slice(1, 3).map((entry) => entry[1])), new Set([STAGING_BUCKET, REVIEW_BUCKET]));
  assert.equal(order.some(([operation]) => operation === 'delete'), false);
});

test('a late PUT after release is removed only after token expiry plus grace', async () => {
  const expiresAt = Date.parse('2026-08-11T14:00:00.000Z');
  let now = expiresAt + SIGNED_UPLOAD_CLEANUP_GRACE_MS - 1;
  let providerObjectExists = true;
  let tombstone = { ...asset(firstId, 'cleanup_pending') };
  let rowDeleted = false;
  const calls = [];
  const store = {
    markMediaCleanupPending: async () => [tombstone],
    completeStagingCleanup: async () => {
      calls.push(['complete-staging', now]);
      if (now < expiresAt + SIGNED_UPLOAD_CLEANUP_GRACE_MS) return [];
      tombstone = { ...tombstone, staging_cleanup_pending: false };
      return [tombstone];
    },
    stagingMediaCleanupPending: async () => now < expiresAt + SIGNED_UPLOAD_CLEANUP_GRACE_MS ? [] : [tombstone],
    publishedMediaCleanupPending: async () => [],
    expiredMediaAssets: async () => tombstone.staging_cleanup_pending ? [] : [tombstone],
    deleteMediaAssets: async () => {
      rowDeleted = true;
      return [tombstone];
    }
  };
  const storage = {
    remove: async (bucket, paths) => {
      calls.push(['remove', bucket, paths]);
      if (bucket === STAGING_BUCKET && paths.includes(tombstone.staging_path)) providerObjectExists = false;
    }
  };

  await assert.rejects(
    () => releaseOwnedMedia({ store, storage, ownerId, ids: [firstId] }),
    (error) => error.code === 'MEDIA_CLEANUP_PENDING' && error.statusCode === 409
  );
  assert.equal(rowDeleted, false);
  // The client still owns the provider token and recreates the object after
  // the early best-effort delete.
  providerObjectExists = true;

  assert.deepEqual(await cleanupExpiredMedia(store, storage), []);
  assert.equal(providerObjectExists, true);
  assert.equal(rowDeleted, false);

  now += 1;
  assert.deepEqual(await cleanupExpiredMedia(store, storage), [firstId]);
  assert.equal(providerObjectExists, false);
  assert.equal(rowDeleted, true);
  assert.ok(calls.some(([operation, bucket]) => operation === 'remove' && bucket === STAGING_BUCKET));
});

test('failed cleanup keeps a retryable database marker and never deletes the row', async () => {
  const calls = [];
  const store = {
    deleteMediaAssets: async () => calls.push('delete'),
    markMediaCleanupPending: async ({ ids }) => { calls.push(['claim', ids]); return [asset(firstId, 'cleanup_pending')]; }
  };
  const storage = { remove: async () => { throw new Error('provider unavailable'); } };
  await assert.rejects(() => releaseOwnedMedia({ store, storage, ownerId, ids: [firstId] }));
  assert.deepEqual(calls, [['claim', [firstId]]]);
});

test('release removes a partially staged public publication before deleting its receipt', async () => {
  const calls = [];
  const pending = asset(firstId, 'cleanup_pending');
  pending.public_manifest = Object.fromEntries(['thumb', 'card', 'hero'].map((name) => [name, {
    path: `assets/${firstId}/40000000-0000-4000-8000-000000000004/${name}.webp`
  }]));
  const store = {
    markMediaCleanupPending: async () => [pending],
    completeStagingCleanup: async () => [{ ...pending, staging_cleanup_pending: false }],
    deleteMediaAssets: async ({ ids }) => {
      calls.push(['delete', ids]);
      return [{ ...pending, staging_cleanup_pending: false }];
    }
  };
  const storage = { remove: async (bucket, paths) => calls.push(['remove', bucket, paths]) };

  await releaseOwnedMedia({ store, storage, ownerId, ids: [firstId] });

  const removedBuckets = calls.filter(([operation]) => operation === 'remove').map(([, bucket]) => bucket);
  assert.deepEqual(new Set(removedBuckets), new Set([STAGING_BUCKET, REVIEW_BUCKET, PUBLIC_BUCKET]));
  assert.deepEqual(calls.at(-1), ['delete', [firstId]]);
});

test('release rejects empty or partial authoritative staging completion', async () => {
  const claimed = [asset(firstId, 'cleanup_pending'), asset(secondId, 'cleanup_pending')];
  for (const completed of [[], [{ ...claimed[0], staging_cleanup_pending: false }]]) {
    let deleteCalls = 0;
    const store = {
      markMediaCleanupPending: async () => claimed,
      completeStagingCleanup: async () => completed,
      deleteMediaAssets: async () => { deleteCalls += 1; return []; }
    };
    const storage = { remove: async () => undefined };

    await assert.rejects(
      () => releaseOwnedMedia({ store, storage, ownerId, ids: [firstId, secondId] }),
      (error) => error.code === 'MEDIA_CLEANUP_PENDING' && error.statusCode === 409
    );
    assert.equal(deleteCalls, 0);
  }
});

test('release rejects empty or partial receipt deletion after exact completion', async () => {
  const claimed = [asset(firstId, 'cleanup_pending'), asset(secondId, 'cleanup_pending')];
  const completed = claimed.map((row) => ({ ...row, staging_cleanup_pending: false }));
  for (const deleted of [[], [completed[0]]]) {
    const store = {
      markMediaCleanupPending: async () => claimed,
      completeStagingCleanup: async () => completed,
      deleteMediaAssets: async () => deleted
    };
    const storage = { remove: async () => undefined };

    await assert.rejects(
      () => releaseOwnedMedia({ store, storage, ownerId, ids: [firstId, secondId] }),
      (error) => error.code === 'MEDIA_CLEANUP_PENDING' && error.statusCode === 409
    );
  }
});

test('release handler never reports released before authoritative staging completion', async () => {
  for (const completion of ['empty', 'partial']) {
    const { response, calls } = await invokeReleaseHandler({
      ids: [firstId, secondId],
      completion
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'MEDIA_CLEANUP_PENDING');
    assert.equal(Object.hasOwn(response.body, 'released'), false);
    assert.equal(calls.includes('DELETE /rest/v1/media_assets'), false);
  }
});

test('release handler never reports released after empty or partial receipt deletion', async () => {
  for (const deletion of ['empty', 'partial']) {
    const { response, calls } = await invokeReleaseHandler({
      ids: [firstId, secondId],
      deletion
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'MEDIA_CLEANUP_PENDING');
    assert.equal(Object.hasOwn(response.body, 'released'), false);
    assert.equal(calls.includes('DELETE /rest/v1/media_assets'), true);
  }
});

test('release handler reports IDs only after exact completion and exact receipt deletion', async () => {
  const { response } = await invokeReleaseHandler({ ids: [firstId, secondId] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { released: [firstId, secondId] });
});

test('a later sign request opportunistically reaps expired unattached media', async () => {
  const calls = [];
  const expired = [asset(firstId, 'cleanup_pending'), asset(secondId, 'signed')];
  const store = {
    expiredMediaAssets: async (limit) => { calls.push(['query', limit]); return expired; },
    deleteMediaAssets: async ({ ids }) => calls.push(['delete', ids]),
    markMediaCleanupPending: async ({ ids }) => { calls.push(['claim', ids]); return expired; }
  };
  const storage = { remove: async (bucket) => calls.push(['remove', bucket]) };
  await cleanupExpiredMedia(store, storage);
  assert.deepEqual(calls, [
    ['query', 20],
    ['claim', [firstId, secondId]],
    ['remove', STAGING_BUCKET],
    ['remove', REVIEW_BUCKET],
    ['delete', [firstId, secondId]]
  ]);
});

test('a bounded sign-time pass retries private cleanup for already published media', async () => {
  const calls = [];
  const published = asset(firstId, 'published');
  const store = {
    publishedMediaCleanupPending: async (limit) => { calls.push(['published-query', limit]); return [published]; },
    completeReviewCleanup: async (ids) => calls.push(['published-complete', ids]),
    expiredMediaAssets: async (limit) => { calls.push(['expired-query', limit]); return []; }
  };
  const storage = { remove: async (bucket) => calls.push(['remove', bucket]) };

  await cleanupExpiredMedia(store, storage);

  assert.deepEqual(calls, [
    ['published-query', 20],
    ['remove', STAGING_BUCKET],
    ['remove', REVIEW_BUCKET],
    ['published-complete', [firstId]],
    ['expired-query', 20]
  ]);
});

test('an approval RPC transport failure is treated as commit-ambiguous', () => {
  assert.equal(ambiguousModerationCommit(new TypeError('socket closed'), 'approved', true), true);
  assert.equal(ambiguousModerationCommit(Object.assign(new Error('gateway failed'), { statusCode: 503 }), 'approved', true), true);
  assert.equal(ambiguousModerationCommit(Object.assign(new Error('provider failed'), { statusCode: 500 }), 'approved', true), true);
  assert.equal(ambiguousModerationCommit(Object.assign(new Error('rollback'), { statusCode: 409 }), 'approved', true), false);
  assert.equal(ambiguousModerationCommit(Object.assign(new Error('rate limited'), { statusCode: 429 }), 'approved', true), false);
  assert.equal(ambiguousModerationCommit(new TypeError('before RPC'), 'approved', false), false);
  assert.equal(ambiguousModerationCommit(new TypeError('rejection'), 'rejected', true), false);
});

test('a moderation HTTP 5xx preserves the publishing lease, planned paths and cleanup marker', async () => {
  const calls = [];
  const manifest = {
    [firstId]: {
      hero: { path: `assets/${firstId}/${thirdId}/hero.webp`, url: 'https://project.supabase.co/hero.webp' }
    }
  };
  const snapshot = structuredClone(manifest);
  const outcome = await settleFailedModerationPublication({
    error: Object.assign(new Error('upstream response lost'), { statusCode: 503 }),
    decision: 'approved',
    moderationAttempted: true,
    store: {
      clearStagedPublicMedia: async () => calls.push('clear-row'),
      releaseMediaPublication: async () => calls.push('release-lease')
    },
    storage: { remove: async () => calls.push('remove-public') },
    publicManifests: manifest,
    claimedIds: [firstId],
    submissionId: secondId,
    publicationLeaseId: thirdId
  });

  assert.equal(outcome, 'reconciliation_pending');
  assert.deepEqual(calls, []);
  assert.deepEqual(manifest, snapshot);
});

test('an authoritative moderation conflict rolls back staged public state and releases the lease', async () => {
  const calls = [];
  const manifest = { [firstId]: publicManifest(firstId, thirdId) };
  const leasedRow = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    publication_lease_id: thirdId,
    public_manifest: manifest[firstId],
    public_cleanup_pending: true
  };
  const outcome = await settleFailedModerationPublication({
    error: Object.assign(new Error('submission already moderated'), { statusCode: 409 }),
    decision: 'approved',
    moderationAttempted: true,
    store: {
      claimStagedPublicMediaCleanup: async (options) => {
        calls.push(['claim-cleanup', options]);
        return [leasedRow];
      },
      clearStagedPublicMedia: async (options) => {
        calls.push(['clear-row', options]);
        return [{ ...leasedRow, public_manifest: {}, public_cleanup_pending: false }];
      },
      releaseMediaPublication: async (options) => calls.push(['release-lease', options])
    },
    storage: { remove: async (bucket, paths) => calls.push(['remove-public', bucket, paths]) },
    publicManifests: manifest,
    claimedIds: [firstId],
    submissionId: secondId,
    publicationLeaseId: thirdId
  });

  assert.equal(outcome, 'rolled_back');
  assert.deepEqual(calls.map((call) => call[0]), ['claim-cleanup', 'remove-public', 'clear-row', 'release-lease']);
  assert.deepEqual(calls.at(-1), ['release-lease', {
    ids: [firstId],
    submissionId: secondId,
    publicationLeaseId: thirdId
  }]);
});

test('the sign-time store reaper releases only stale pending leases without clearing public state', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fixedNow = Date.parse('2026-08-11T12:00:00.000Z');
  const staleBefore = '2026-08-11T11:45:00.000Z';
  const pendingManifest = { hero: { path: `assets/${firstId}/${fourthId}/hero.webp` } };
  const pendingAsset = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    updated_at: '2026-08-11T11:00:00.000Z',
    publication_lease_id: thirdId,
    public_manifest: pendingManifest,
    public_cleanup_pending: true
  };
  const approvedAsset = {
    ...asset(thirdId, 'publishing'),
    submission_id: fourthId,
    updated_at: '2026-08-11T11:01:00.000Z',
    publication_lease_id: ownerId,
    public_manifest: { hero: { path: `assets/${thirdId}/${fourthId}/hero.webp` } },
    public_cleanup_pending: true
  };
  const calls = [];

  try {
    Date.now = () => fixedNow;
    process.env.SUPABASE_URL = 'https://media-reaper.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-reaper-service-key';
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      const status = url.searchParams.get('status');
      calls.push({ method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), body: init.body ? JSON.parse(init.body) : null });
      if (url.pathname === '/rest/v1/media_assets' && method === 'GET' && status === 'eq.publishing') {
        return jsonResponse([pendingAsset, approvedAsset]);
      }
      if (url.pathname === '/rest/v1/venue_submissions' && method === 'GET') {
        return jsonResponse([
          { id: secondId, status: 'pending', approved_venue_id: null },
          { id: fourthId, status: 'approved', approved_venue_id: ownerId }
        ]);
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'PATCH') {
        return jsonResponse([{ ...pendingAsset, status: 'attached', publication_lease_id: null }]);
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'GET' && status?.startsWith('in.(')) {
        return jsonResponse([]);
      }
      throw new Error(`Unexpected reaper request: ${method} ${url.pathname}`);
    };

    assert.deepEqual(await createStore().expiredMediaAssets(99), []);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }

  const staleQuery = calls.find((call) => call.method === 'GET' && call.query.status === 'eq.publishing');
  const leasePatch = calls.find((call) => call.method === 'PATCH');
  assert.equal(staleQuery.query.limit, '20');
  assert.equal(staleQuery.query.updated_at, `lt.${staleBefore}`);
  assert.equal(leasePatch.query.id, `in.(${firstId})`);
  assert.equal(leasePatch.query.status, 'eq.publishing');
  assert.equal(leasePatch.query.updated_at, `lt.${staleBefore}`);
  assert.deepEqual(leasePatch.body, { status: 'attached', publication_lease_id: null });
  assert.equal(JSON.stringify(leasePatch.body).includes('public_manifest'), false);
  assert.equal(calls.some((call) => call.method === 'DELETE'), false);
  assert.equal(calls.some((call) => call.pathname.startsWith('/storage/')), false);
});

test('the store carries one generated lease through every publication CAS and moderation RPC', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  let current = {
    ...asset(firstId, 'attached'),
    submission_id: secondId,
    publication_lease_id: null,
    public_manifest: {},
    public_cleanup_pending: false
  };

  try {
    process.env.SUPABASE_URL = 'https://media-fencing.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-fencing-service-key';
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      const call = { method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), body };
      calls.push(call);

      if (url.pathname === '/rest/v1/media_assets' && method === 'GET') return jsonResponse([]);
      if (url.pathname === '/rest/v1/media_assets' && method === 'PATCH') {
        if (body.status === 'publishing') {
          current = { ...current, status: 'publishing', publication_lease_id: body.publication_lease_id };
        } else if (body.status === 'attached') {
          current = { ...current, status: 'attached', publication_lease_id: null };
        } else if (body.public_manifest) {
          current = { ...current, public_manifest: body.public_manifest, public_cleanup_pending: true };
        } else if (body.public_cleanup_pending === true) {
          current = { ...current, public_cleanup_pending: true };
        } else if (body.public_cleanup_pending === false) {
          current = { ...current, public_manifest: {}, public_cleanup_pending: false };
        }
        return jsonResponse([current]);
      }
      if (url.pathname === '/rest/v1/rpc/moderate_venue_submission_with_media' && method === 'POST') {
        return jsonResponse({ status: 'approved' });
      }
      throw new Error(`Unexpected fencing request: ${method} ${url.pathname}`);
    };

    const store = createStore();
    const claim = await store.claimMediaPublication({ ids: [firstId], submissionId: secondId });
    const leaseId = claim.publicationLeaseId;
    const manifest = publicManifest(firstId, fourthId);
    assert.match(leaseId, /^[0-9a-f-]{36}$/);
    assert.equal(claim.assets[0].publication_lease_id, leaseId);

    await store.stagePublicMediaManifest({
      id: firstId,
      submissionId: secondId,
      publicationLeaseId: leaseId,
      manifest
    });
    await store.claimStagedPublicMediaCleanup({
      ids: [firstId],
      submissionId: secondId,
      publicationLeaseId: leaseId
    });
    await store.clearStagedPublicMedia({
      ids: [firstId],
      submissionId: secondId,
      publicationLeaseId: leaseId
    });
    await store.releaseMediaPublication({
      ids: [firstId],
      submissionId: secondId,
      publicationLeaseId: leaseId
    });
    await store.moderateSubmission({
      id: secondId,
      decision: 'approved',
      publicManifests: { [firstId]: manifest },
      publicationLeaseId: leaseId
    });

    const claimMutation = calls.find((call) => call.body?.status === 'publishing');
    assert.equal(claimMutation.body.publication_lease_id, leaseId);
    const fencedMutations = calls.filter((call) => call.method === 'PATCH' && call !== claimMutation);
    assert.ok(fencedMutations.length >= 4);
    assert.ok(fencedMutations.every((call) => call.query.publication_lease_id === `eq.${leaseId}`));
    const moderation = calls.find((call) => call.pathname.endsWith('/rpc/moderate_venue_submission_with_media'));
    assert.equal(moderation.body.p_media_publication_lease_id, leaseId);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('database tombstone guards apply the same expiry grace to attached and published receipts', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fixedNow = Date.parse('2026-08-11T15:00:00.000Z');
  const expectedCutoff = new Date(fixedNow - SIGNED_UPLOAD_CLEANUP_GRACE_MS).toISOString();
  const calls = [];
  try {
    Date.now = () => fixedNow;
    process.env.SUPABASE_URL = 'https://media-tombstone.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-tombstone-service-key';
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      calls.push({
        method: init.method || 'GET',
        query: Object.fromEntries(url.searchParams),
        body: init.body ? JSON.parse(init.body) : null
      });
      return jsonResponse([]);
    };

    const store = createStore();
    await store.stagingMediaCleanupPending(20);
    await store.completeStagingCleanup({ ids: [firstId] });
    await store.deleteMediaAssets({ ids: [firstId], includeAttached: true });
    await store.completeReviewCleanup([firstId]);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }

  assert.equal(calls[0].query.staging_token_expires_at, `lt.${expectedCutoff}`);
  assert.equal(calls[1].query.staging_token_expires_at, `lt.${expectedCutoff}`);
  assert.equal(calls[1].query.staging_cleanup_pending, 'eq.true');
  assert.equal(calls[2].query.staging_cleanup_pending, 'eq.false');
  assert.deepEqual(calls[3].body, { review_manifest: {}, review_cleanup_pending: false });
  assert.equal(Object.hasOwn(calls[3].body, 'staging_cleanup_pending'), false);
});

test('venue deletion after signed-token grace removes claimed public and private media before receipts', async () => {
  const calls = [];
  const claimed = asset(firstId, 'cleanup_pending');
  claimed.public_manifest = Object.fromEntries(['thumb', 'card', 'hero'].map((name) => [name, {
    path: `assets/${firstId}/40000000-0000-4000-8000-000000000004/${name}.webp`
  }]));
  const store = {
    markMediaCleanupPending: async ({ ids }) => { calls.push(['claim', ids]); return [claimed]; },
    completeStagingCleanup: async ({ ids }) => {
      calls.push(['complete-staging', ids]);
      return [{ ...claimed, staging_cleanup_pending: false }];
    },
    deleteMediaAssets: async ({ ids }) => {
      calls.push(['delete', ids]);
      return ids.map((id) => ({ id }));
    }
  };
  const storage = { remove: async (bucket, paths) => calls.push(['remove', bucket, paths]) };

  assert.equal(await cleanupDeletedVenueMedia(store, storage, [claimed]), true);
  assert.deepEqual(new Set(calls.filter(([operation]) => operation === 'remove').map(([, bucket]) => bucket)),
    new Set([STAGING_BUCKET, REVIEW_BUCKET, PUBLIC_BUCKET]));
  assert.deepEqual(
    calls.find(([, bucket]) => bucket === PUBLIC_BUCKET),
    ['remove', PUBLIC_BUCKET, ['thumb', 'card', 'hero'].map((name) => claimed.public_manifest[name].path)]
  );
  assert.deepEqual(calls.at(-1), ['delete', [firstId]]);
  assert.deepEqual(calls.at(-2), ['complete-staging', [firstId]]);
});

test('venue deletion before signed-token grace stays pending without attempting receipt deletion', async () => {
  const calls = [];
  const claimed = asset(firstId, 'cleanup_pending');
  const store = {
    markMediaCleanupPending: async () => [claimed],
    completeStagingCleanup: async ({ ids }) => {
      calls.push(['complete-staging', ids]);
      return [];
    },
    deleteMediaAssets: async () => calls.push(['unexpected-delete'])
  };
  const storage = { remove: async (bucket, paths) => calls.push(['remove', bucket, paths]) };

  assert.equal(await cleanupDeletedVenueMedia(store, storage, [claimed]), false);
  assert.deepEqual(calls.at(-1), ['complete-staging', [firstId]]);
  assert.equal(calls.some(([operation]) => operation === 'unexpected-delete'), false);
});

test('venue deletion keeps its cleanup_pending tombstone when Storage fails', async () => {
  const calls = [];
  const claimed = asset(firstId, 'cleanup_pending');
  const store = {
    markMediaCleanupPending: async () => [claimed],
    deleteMediaAssets: async () => calls.push('delete')
  };
  const storage = { remove: async () => { throw new Error('provider unavailable'); } };

  assert.equal(await cleanupDeletedVenueMedia(store, storage, [claimed]), false);
  assert.deepEqual(calls, []);
});

test('a delayed worker deletes only its attempt paths after recovery and a newer publication', async () => {
  const calls = [];
  const oldWorkerAsset = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    publication_lease_id: thirdId,
    public_manifest: {},
    public_cleanup_pending: false
  };
  const newWorkerManifest = publicManifest(firstId, fourthId);
  let current = { ...oldWorkerAsset };
  let recovered = false;
  const store = {
    stagePublicMediaManifest: async ({ publicationLeaseId, manifest }) => {
      calls.push(['stage', publicationLeaseId, manifest]);
      if (publicationLeaseId !== current.publication_lease_id) return null;
      current = { ...current, public_manifest: manifest, public_cleanup_pending: true };
      return current;
    },
    claimStagedPublicMediaCleanup: async ({ publicationLeaseId }) => {
      calls.push(['claim-cleanup', publicationLeaseId]);
      return publicationLeaseId === current.publication_lease_id ? [current] : [];
    },
    clearStagedPublicMedia: async () => {
      calls.push(['clear-row']);
      return [];
    }
  };
  const storage = {
    publicUrl: (path) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`,
    download: async () => Buffer.from('processed-webp'),
    upload: async (_bucket, path) => {
      if (!recovered) {
        // Worker A's lease became stale; recovery released it and worker B
        // cleaned A's recorded paths, then claimed/staged a new version while
        // A's provider PUT was still in flight.
        recovered = true;
        calls.push(['worker-b-cleanup', ['thumb', 'card', 'hero'].map((variant) => current.public_manifest[variant].path)]);
        current = {
          ...current,
          publication_lease_id: fourthId,
          public_manifest: newWorkerManifest,
          public_cleanup_pending: true
        };
      }
      // The old provider PUT commits only after B's cleanup/new claim.
      calls.push(['upload', path]);
    },
    remove: async (_bucket, paths) => calls.push(['remove', paths])
  };

  await assert.rejects(() => publishSubmissionMedia(
    store,
    storage,
    secondId,
    [oldWorkerAsset],
    thirdId
  ), (error) => error.code === 'MEDIA_PUBLICATION_FENCED');

  assert.equal(current.publication_lease_id, fourthId);
  assert.deepEqual(current.public_manifest, newWorkerManifest);
  assert.ok(calls.findIndex(([operation]) => operation === 'worker-b-cleanup')
    < calls.findIndex(([operation]) => operation === 'upload'));
  assert.equal(calls.filter(([operation]) => operation === 'stage').length, 2);
  assert.deepEqual(calls.filter(([operation]) => operation === 'claim-cleanup').map((entry) => entry[1]), [thirdId]);
  const removed = calls.filter(([operation]) => operation === 'remove').flatMap((entry) => entry[1]);
  assert.equal(removed.length, 3);
  assert.ok(removed.every((path) => path.includes(`/${thirdId}/`)));
  assert.ok(removed.every((path) => !path.includes(`/${fourthId}/`)));
  assert.equal(calls.some(([operation]) => operation === 'clear-row'), false);
});

test('an ambiguous public upload keeps its receipt and lease until delayed reconciliation', async () => {
  const calls = [];
  let row = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    publication_lease_id: thirdId,
    public_manifest: {},
    public_cleanup_pending: false
  };
  const store = {
    stagePublicMediaManifest: async ({ manifest }) => {
      calls.push(['stage']);
      row = { ...row, public_manifest: manifest, public_cleanup_pending: true };
      return row;
    },
    claimStagedPublicMediaCleanup: async () => calls.push(['unexpected-immediate-claim']),
    clearStagedPublicMedia: async () => calls.push(['unexpected-immediate-clear']),
    releaseMediaPublication: async () => calls.push(['unexpected-immediate-release'])
  };
  const storage = {
    publicUrl: (objectPath) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${objectPath}`,
    download: async () => Buffer.from('processed-webp'),
    upload: async (_bucket, objectPath) => {
      calls.push(['upload-timeout', objectPath]);
      throw new MediaStorageError('MEDIA_STORAGE_TIMEOUT', 'provider response lost', 504);
    },
    remove: async (_bucket, paths) => calls.push(['unexpected-immediate-remove', paths])
  };

  let ambiguousError;
  await assert.rejects(
    () => publishSubmissionMedia(store, storage, secondId, [row], thirdId),
    (error) => {
      ambiguousError = error;
      return error.code === 'MEDIA_PUBLIC_UPLOAD_COMMIT_AMBIGUOUS'
        && error.publicMediaUploadCommitAmbiguous === true;
    }
  );

  assert.equal(row.status, 'publishing');
  assert.equal(row.publication_lease_id, thirdId);
  assert.equal(row.public_cleanup_pending, true);
  assert.equal(Object.keys(row.public_manifest).length, 4);
  assert.equal(calls.some(([operation]) => operation.includes('immediate')), false);

  const outcome = await settleFailedModerationPublication({
    error: ambiguousError,
    decision: 'approved',
    moderationAttempted: false,
    store,
    storage,
    // Mirrors the real assignment: publishSubmissionMedia rejected before it
    // could return, while the authoritative manifest already lives in Postgres.
    publicManifests: {},
    claimedIds: [firstId],
    submissionId: secondId,
    publicationLeaseId: thirdId
  });
  assert.equal(outcome, 'reconciliation_pending');
  assert.equal(calls.some(([operation]) => operation.includes('immediate')), false);

  // The provider commits after the timeout and after the immediate-cleanup
  // window. Recovery then ages out A, worker B claims the row, and its first
  // action deletes A's still-recorded exact attempt paths.
  const lateObjectPath = row.public_manifest.thumb.path;
  const providerObjects = new Set([lateObjectPath]);
  const oldManifest = row.public_manifest;
  row = { ...row, publication_lease_id: fourthId };
  const reconciled = await clearStagedPublicMedia({
    claimStagedPublicMediaCleanup: async () => [row],
    clearStagedPublicMedia: async () => {
      row = { ...row, public_manifest: {}, public_cleanup_pending: false };
      return [row];
    }
  }, {
    remove: async (bucket, paths) => {
      calls.push(['delayed-reconcile', bucket, paths]);
      for (const objectPath of paths) providerObjects.delete(objectPath);
    }
  }, { [firstId]: oldManifest }, {
    submissionId: secondId,
    publicationLeaseId: fourthId
  });

  assert.equal(reconciled, true);
  assert.equal(providerObjects.size, 0);
  assert.equal(row.publication_lease_id, fourthId);
  assert.equal(row.public_cleanup_pending, false);
  const delayed = calls.find(([operation]) => operation === 'delayed-reconcile');
  assert.equal(delayed[1], PUBLIC_BUCKET);
  assert.deepEqual(delayed[2], ['thumb', 'card', 'hero'].map((variant) => oldManifest[variant].path));
  assert.ok(delayed[2].every((objectPath) => objectPath.includes(`/${thirdId}/`)));
  assert.ok(delayed[2].every((objectPath) => !objectPath.includes(`/${fourthId}/`)));
});

test('an authoritative public upload 4xx can clean its planned paths immediately', async () => {
  const calls = [];
  let row = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    publication_lease_id: thirdId,
    public_manifest: {},
    public_cleanup_pending: false
  };
  const store = {
    stagePublicMediaManifest: async ({ manifest }) => {
      row = { ...row, public_manifest: manifest, public_cleanup_pending: true };
      return row;
    },
    claimStagedPublicMediaCleanup: async () => [row],
    clearStagedPublicMedia: async () => {
      row = { ...row, public_manifest: {}, public_cleanup_pending: false };
      return [row];
    }
  };
  const storage = {
    publicUrl: (objectPath) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${objectPath}`,
    download: async () => Buffer.from('processed-webp'),
    upload: async () => {
      throw new MediaStorageError('MEDIA_UPLOAD_FAILED', 'asset already exists', 409);
    },
    remove: async (bucket, paths) => calls.push([bucket, paths])
  };

  await assert.rejects(
    () => publishSubmissionMedia(store, storage, secondId, [row], thirdId),
    (error) => error.code === 'MEDIA_UPLOAD_FAILED' && error.statusCode === 409
  );

  assert.equal(row.public_cleanup_pending, false);
  assert.deepEqual(row.public_manifest, {});
  const plannedCleanup = calls.find(([, paths]) => paths.length === 3);
  assert.equal(plannedCleanup[0], PUBLIC_BUCKET);
  assert.ok(plannedCleanup[1].every((objectPath) => objectPath.includes(`/${thirdId}/`)));
});

test('an ambiguous planned-manifest stage starts no public upload and remains recoverable', async () => {
  const calls = [];
  const leasedAsset = {
    ...asset(firstId, 'publishing'),
    submission_id: secondId,
    publication_lease_id: thirdId,
    public_manifest: {},
    public_cleanup_pending: false
  };
  let committed = leasedAsset;
  const store = {
    stagePublicMediaManifest: async ({ publicationLeaseId, manifest }) => {
      calls.push(['stage', publicationLeaseId]);
      committed = {
        ...leasedAsset,
        public_manifest: manifest,
        public_cleanup_pending: true
      };
      throw new TypeError('response lost after manifest commit');
    },
    claimStagedPublicMediaCleanup: async () => calls.push(['claim-cleanup'])
  };
  const storage = {
    publicUrl: (path) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`,
    download: async () => Buffer.from('processed-webp'),
    upload: async () => calls.push(['upload']),
    remove: async () => calls.push(['remove'])
  };

  await assert.rejects(() => publishSubmissionMedia(
    store,
    storage,
    secondId,
    [leasedAsset],
    thirdId
  ), /response lost/);

  assert.equal(committed.publication_lease_id, thirdId);
  assert.equal(committed.public_cleanup_pending, true);
  assert.deepEqual(Object.keys(committed.public_manifest), ['version', 'thumb', 'card', 'hero']);
  assert.deepEqual(calls, [['stage', thirdId]]);
});

test('approval records planned immutable paths before copying any public bytes', async () => {
  const calls = [];
  const reviewAsset = asset(firstId, 'publishing');
  reviewAsset.submission_id = secondId;
  reviewAsset.publication_lease_id = thirdId;
  reviewAsset.review_manifest = Object.fromEntries(['thumb', 'card', 'hero'].map((name) => [name, {
    path: `${ownerId}/${firstId}/v1/${name}.webp`, width: 640, height: 480
  }]));
  reviewAsset.public_manifest = {};
  reviewAsset.public_cleanup_pending = false;
  const store = {
    stagePublicMediaManifest: async ({ publicationLeaseId, manifest }) => {
      calls.push(['stage', publicationLeaseId, manifest]);
      return {
        ...reviewAsset,
        public_manifest: manifest,
        public_cleanup_pending: true
      };
    },
    clearStagedPublicMedia: async () => calls.push(['clear'])
  };
  const storage = {
    publicUrl: (path) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`,
    download: async (bucket, path) => {
      calls.push(['download', bucket, path]);
      return Buffer.from('processed-webp');
    },
    upload: async (bucket, path, _bytes, type, cacheControl) => {
      calls.push(['upload', bucket, path, type, cacheControl]);
    },
    remove: async () => calls.push(['remove'])
  };

  const manifests = await publishSubmissionMedia(store, storage, secondId, [reviewAsset], thirdId);
  assert.equal(calls[0][0], 'stage');
  assert.equal(calls[0][1], thirdId);
  assert.equal(calls.filter((entry) => entry[0] === 'stage').length, 2);
  for (const upload of calls.filter((entry) => entry[0] === 'upload')) {
    assert.equal(upload[1], PUBLIC_BUCKET);
    assert.equal(upload[3], 'image/webp');
    assert.equal(upload[4], IMMUTABLE_CACHE_CONTROL);
  }
  assert.match(manifests[firstId].hero.path, new RegExp(`^assets/${firstId}/[0-9a-f-]+/hero\\.webp$`));
  assert.equal(manifests[firstId].hero.bytes, Buffer.byteLength('processed-webp'));

  const response = publicMediaResponse(manifests);
  assert.deepEqual(Object.keys(response[0]), ['id', 'thumb', 'card', 'hero']);
  assert.deepEqual(Object.keys(response[0].hero), ['url', 'width', 'height', 'bytes', 'contentType']);
  assert.equal(response[0].id, firstId);
  assert.equal(response[0].hero.url, manifests[firstId].hero.url);
  assert.equal(JSON.stringify(response).includes('path'), false);
});
