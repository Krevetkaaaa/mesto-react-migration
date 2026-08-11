const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mediaReaperHandler = require('../handlers/cron/media-reaper');
const {
  MEDIA_REAPER_BATCH_LIMIT,
  MEDIA_REAPER_OPERATION_TIMEOUT_MS,
  MEDIA_REAPER_RUN_BUDGET_MS,
  VERCEL_HOBBY_FUNCTION_MAX_MS,
  runMediaReaper
} = require('../lib/media-reaper');
const {
  PUBLIC_BUCKET,
  REVIEW_BUCKET,
  STAGING_BUCKET,
  MediaStorageError
} = require('../lib/media-storage');
const {
  MEDIA_PUBLICATION_LEASE_MS,
  MEDIA_PUBLICATION_RECOVERY_LIMIT,
  SIGNED_UPLOAD_CLEANUP_GRACE_MS,
  createStore
} = require('../lib/supabase');

const ownerId = '10000000-0000-4000-8000-000000000001';
const firstId = '20000000-0000-4000-8000-000000000002';
const secondId = '30000000-0000-4000-8000-000000000003';
const submissionId = '40000000-0000-4000-8000-000000000004';
const oldVersion = '50000000-0000-4000-8000-000000000005';
const oldLease = '60000000-0000-4000-8000-000000000006';
const reaperLease = '70000000-0000-4000-8000-000000000007';
const cronSecret = 'media-reaper-test-secret-32-bytes';

function reviewManifest(id) {
  return Object.fromEntries(['thumb', 'card', 'hero'].map((variant) => [variant, {
    path: `${ownerId}/${id}/v1/${variant}.webp`
  }]));
}

function publicManifest(id, version = oldVersion) {
  return {
    version,
    ...Object.fromEntries(['thumb', 'card', 'hero'].map((variant) => [variant, {
      path: `assets/${id}/${version}/${variant}.webp`
    }]))
  };
}

function mediaAsset(id, status, overrides = {}) {
  return {
    id,
    owner_id: ownerId,
    submission_id: null,
    status,
    staging_path: `${ownerId}/${id}/source.png`,
    staging_token_expires_at: '2026-08-10T00:00:00.000Z',
    staging_cleanup_pending: false,
    review_manifest: {},
    review_cleanup_pending: false,
    public_manifest: {},
    public_cleanup_pending: false,
    publication_lease_id: null,
    expires_at: '2026-08-10T00:00:00.000Z',
    ...overrides
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

function emptyStore(overrides = {}) {
  return {
    recoverStaleMediaPublications: async () => ({ rows: [], hasMore: false }),
    attachedPublicMediaCleanupPending: async () => [],
    stagingMediaCleanupPending: async () => [],
    publishedMediaCleanupPending: async () => [],
    expiredMediaAssets: async () => [],
    ...overrides
  };
}

test('cron schedule and budgets fit the current Hobby execution contract', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.deepEqual(config.crons, [{
    path: '/api/cron/media-reaper',
    schedule: '17 3 * * *'
  }]);
  assert.ok(MEDIA_REAPER_RUN_BUDGET_MS < VERCEL_HOBBY_FUNCTION_MAX_MS);
  assert.ok(MEDIA_REAPER_RUN_BUDGET_MS < MEDIA_PUBLICATION_LEASE_MS);
  assert.equal(MEDIA_REAPER_BATCH_LIMIT, 2);
  assert.equal(MEDIA_REAPER_OPERATION_TIMEOUT_MS, 4_000);
  const router = fs.readFileSync(path.join(__dirname, '..', 'api', 'router.js'), 'utf8');
  assert.match(router, /\['cron\/media-reaper', require\('\.\.\/handlers\/cron\/media-reaper'\)\]/);
});

test('additive venue deletion migration returns the exact transactional cleanup receipt', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260811212027_venue_media_cleanup_receipts.sql'
  ), 'utf8');
  assert.match(migration, /with claimed as\s*\(\s*update public\.media_assets[\s\S]*returning media\.id/i);
  assert.match(migration, /array_agg\(claimed\.id order by claimed\.id\)/i);
  assert.match(migration, /'media_count', cardinality\(claimed_media_ids\)/i);
  assert.match(migration, /'media_ids', to_jsonb\(claimed_media_ids\)/i);
  const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert.match(schema, /create or replace function public\.delete_venue_with_media[\s\S]*'media_ids', to_jsonb\(claimed_media_ids\)/i);
});

test('additive submission moderation migration returns the exact transactional media receipt', () => {
  const migration = fs.readFileSync(path.join(
    __dirname,
    '..',
    'supabase',
    'migrations',
    '20260811185937_submission_media_cleanup_receipts.sql'
  ), 'utf8');
  assert.match(migration, /select coalesce\(array_agg\(media\.id order by media\.id\)/i);
  assert.match(migration, /'media_count', cardinality\(claimed_media_ids\)/i);
  assert.match(migration, /'media_ids', to_jsonb\(claimed_media_ids\)/i);
  assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  assert.match(schema, /moderate_venue_submission_with_media[\s\S]*'media_ids', to_jsonb\(claimed_media_ids\)/i);
});

test('Supabase reaper store operations carry exact state, owner and lease CAS filters', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const calls = [];
  try {
    process.env.SUPABASE_URL = 'https://media-reaper-store.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-reaper-store-service-role';
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({
        method: init.method || 'GET',
        pathname: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body
      });
      if (body?.status === 'publishing') {
        return new Response(JSON.stringify([mediaAsset(firstId, 'publishing', {
          submission_id: submissionId,
          publication_lease_id: body.publication_lease_id,
          public_manifest: publicManifest(firstId),
          public_cleanup_pending: true
        })]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const store = createStore();
    await store.attachedPublicMediaCleanupPending(3, { timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS });
    const claim = await store.claimAttachedPublicMediaCleanup({
      id: firstId,
      submissionId,
      timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
    });
    await store.completeReviewCleanup([firstId], {
      ownerId,
      timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
    });
    assert.match(claim.publicationLeaseId, /^[0-9a-f-]{36}$/);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }

  assert.deepEqual(calls[0].query, {
    select: '*',
    status: 'eq.attached',
    public_cleanup_pending: 'eq.true',
    order: 'updated_at.asc',
    limit: '3'
  });
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].query.id, `eq.${firstId}`);
  assert.equal(calls[1].query.submission_id, `eq.${submissionId}`);
  assert.equal(calls[1].query.status, 'eq.attached');
  assert.equal(calls[1].query.public_cleanup_pending, 'eq.true');
  assert.match(calls[1].body.publication_lease_id, /^[0-9a-f-]{36}$/);
  assert.equal(calls[2].query.owner_id, `eq.${ownerId}`);
  assert.equal(calls[2].query.status, 'eq.published');
  assert.equal(calls[2].query.review_cleanup_pending, 'eq.true');
});

test('stale publication recovery processes only the batch and reports scanned backlog', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ids = [firstId, secondId, oldVersion, oldLease];
  const submissionIds = [submissionId, reaperLease, ownerId, '80000000-0000-4000-8000-000000000008'];
  const calls = [];
  try {
    process.env.SUPABASE_URL = 'https://media-reaper-recovery.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'media-reaper-recovery-service-role';
    global.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = init.method || 'GET';
      calls.push({ method, pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname === '/rest/v1/media_assets' && method === 'GET') {
        return new Response(JSON.stringify(ids.map((id, index) => ({
          id,
          submission_id: submissionIds[index],
          status: 'publishing',
          updated_at: '2026-08-10T00:00:00.000Z',
          publication_lease_id: reaperLease,
          public_manifest: publicManifest(id),
          public_cleanup_pending: true
        }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/rest/v1/venue_submissions' && method === 'GET') {
        return new Response(JSON.stringify(submissionIds.map((id) => ({
          id,
          status: 'pending',
          approved_venue_id: null
        }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'PATCH') {
        const selected = String(url.searchParams.get('id') || '');
        assert.match(selected, new RegExp(firstId));
        assert.match(selected, new RegExp(secondId));
        assert.doesNotMatch(selected, new RegExp(oldVersion));
        return new Response(JSON.stringify(ids.slice(0, 2).map((id, index) => ({
          id,
          submission_id: submissionIds[index],
          status: 'attached',
          publication_lease_id: null
        }))), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };

    const result = await createStore().recoverStaleMediaPublications({
      limit: 4,
      processLimit: 2,
      withMetadata: true,
      timeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
    });
    assert.equal(result.hasMore, true);
    assert.deepEqual(result.rows.map((row) => row.id), ids.slice(0, 2));
    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('reaper summary cannot report drained while stale publication recovery has backlog', async () => {
  const recovered = [
    mediaAsset(firstId, 'attached'),
    mediaAsset(secondId, 'attached')
  ];
  const summary = await runMediaReaper({
    store: emptyStore({
      recoverStaleMediaPublications: async () => ({ rows: recovered, hasMore: true })
    }),
    storage: { remove: async () => [] }
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.drained, false);
  assert.equal(summary.counts.recovered, MEDIA_REAPER_BATCH_LIMIT);
  assert.equal(summary.hasMore.recovered, true);
});

test('unauthorized cron requests make zero configuration, database or Storage calls', async () => {
  for (const scenario of [
    { env: {}, headers: {}, status: 503 },
    { env: { CRON_SECRET: 'too-short' }, headers: {}, status: 503 },
    { env: { CRON_SECRET: `${cronSecret}\n` }, headers: { authorization: `Bearer ${cronSecret}` }, status: 503 },
    { env: { CRON_SECRET: cronSecret }, headers: {}, status: 401 },
    { env: { CRON_SECRET: cronSecret }, headers: { authorization: 'Bearer wrong-secret' }, status: 401 }
  ]) {
    const calls = [];
    const res = responseRecorder();
    await mediaReaperHandler({ method: 'GET', headers: scenario.headers }, res, {
      env: scenario.env,
      configurationFn: () => calls.push('configuration'),
      createStoreFn: () => calls.push('database'),
      createStorageFn: () => calls.push('storage'),
      runMediaReaperFn: () => calls.push('run')
    });
    assert.equal(res.statusCode, scenario.status);
    assert.deepEqual(calls, []);
    assert.equal(Object.hasOwn(res.body, 'failures'), false);
  }

  const calls = [];
  const res = responseRecorder();
  await mediaReaperHandler({
    method: 'POST',
    headers: { authorization: `Bearer ${cronSecret}` }
  }, res, {
    env: { CRON_SECRET: cronSecret },
    configurationFn: () => calls.push('configuration')
  });
  assert.equal(res.statusCode, 405);
  assert.deepEqual(calls, []);
});

test('cron reports partial cleanup as unavailable and bounded backlog without false drain', async () => {
  const created = [];
  const partial = {
    ok: false,
    drained: false,
    counts: { recovered: 0, public: 0, staging: 0, review: 0, expired: 0 },
    hasMore: { public: false, staging: false, review: false, expired: false },
    failures: [{ phase: 'public-cleanup', code: 'MEDIA_STORAGE_TIMEOUT' }]
  };
  const res = responseRecorder();
  await mediaReaperHandler({
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` }
  }, res, {
    env: { CRON_SECRET: cronSecret },
    configurationFn: () => ({ url: 'https://project.supabase.co', key: 'service-role' }),
    createStoreFn: () => { created.push('database'); return {}; },
    createStorageFn: (config) => { created.push(['storage', config.operationTimeoutMs]); return {}; },
    runMediaReaperFn: async () => partial
  });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, partial);
  assert.deepEqual(created, ['database', ['storage', MEDIA_REAPER_OPERATION_TIMEOUT_MS]]);

  const success = responseRecorder();
  await mediaReaperHandler({
    method: 'GET',
    headers: { authorization: `Bearer ${cronSecret}` }
  }, success, {
    env: { CRON_SECRET: cronSecret },
    configurationFn: () => ({}),
    createStoreFn: () => ({}),
    createStorageFn: () => ({}),
    runMediaReaperFn: async () => ({ ...partial, ok: true, failures: [] })
  });
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.drained, false);
});

test('a recovered attached publication deletes only its preserved attempt manifest under a new fence', async () => {
  const fixedNow = Date.parse('2026-08-11T18:00:00.000Z');
  let row = mediaAsset(firstId, 'publishing', {
    submission_id: submissionId,
    publication_lease_id: oldLease,
    public_manifest: publicManifest(firstId),
    public_cleanup_pending: true,
    updated_at: new Date(fixedNow - MEDIA_PUBLICATION_LEASE_MS - 1).toISOString()
  });
  const removed = [];
  const mutations = [];
  const store = emptyStore({
    recoverStaleMediaPublications: async ({ limit, processLimit, withMetadata, timeoutMs }) => {
      assert.equal(limit, MEDIA_PUBLICATION_RECOVERY_LIMIT);
      assert.equal(processLimit, MEDIA_REAPER_BATCH_LIMIT);
      assert.equal(withMetadata, true);
      assert.equal(timeoutMs, MEDIA_REAPER_OPERATION_TIMEOUT_MS);
      row = { ...row, status: 'attached', publication_lease_id: null };
      mutations.push('recover');
      return { rows: [structuredClone(row)], hasMore: false };
    },
    attachedPublicMediaCleanupPending: async () => [structuredClone(row)],
    claimAttachedPublicMediaCleanup: async ({ id, submissionId: claimedSubmission, timeoutMs }) => {
      assert.equal(id, firstId);
      assert.equal(claimedSubmission, submissionId);
      assert.equal(timeoutMs, MEDIA_REAPER_OPERATION_TIMEOUT_MS);
      row = { ...row, status: 'publishing', publication_lease_id: reaperLease };
      mutations.push('claim');
      return { asset: structuredClone(row), publicationLeaseId: reaperLease };
    },
    claimStagedPublicMediaCleanup: async ({ publicationLeaseId }) => {
      assert.equal(publicationLeaseId, reaperLease);
      mutations.push('authoritative-manifest');
      return [structuredClone(row)];
    },
    clearStagedPublicMedia: async ({ publicationLeaseId }) => {
      assert.equal(publicationLeaseId, reaperLease);
      row = { ...row, public_manifest: {}, public_cleanup_pending: false };
      mutations.push('clear');
      return [structuredClone(row)];
    },
    releaseMediaPublication: async ({ publicationLeaseId }) => {
      assert.equal(publicationLeaseId, reaperLease);
      row = { ...row, status: 'attached', publication_lease_id: null };
      mutations.push('release');
      return [structuredClone(row)];
    }
  });
  const storage = {
    remove: async (bucket, paths) => removed.push([bucket, [...paths]])
  };

  const summary = await runMediaReaper({ store, storage, now: () => fixedNow });

  assert.equal(summary.ok, true);
  assert.equal(summary.counts.recovered, 1);
  assert.equal(summary.counts.public, 1);
  assert.deepEqual(mutations, ['recover', 'claim', 'authoritative-manifest', 'clear', 'release']);
  assert.deepEqual(removed, [[PUBLIC_BUCKET, [
    `assets/${firstId}/${oldVersion}/thumb.webp`,
    `assets/${firstId}/${oldVersion}/card.webp`,
    `assets/${firstId}/${oldVersion}/hero.webp`
  ]]]);
  assert.equal(row.status, 'attached');
  assert.equal(row.public_cleanup_pending, false);
  assert.deepEqual(row.public_manifest, {});
});

test('last signer abandonment is reaped after token grace without any future sign request', async () => {
  const fixedNow = Date.parse('2026-08-11T18:00:00.000Z');
  let row = mediaAsset(firstId, 'signed', {
    staging_cleanup_pending: true,
    staging_token_expires_at: new Date(fixedNow - SIGNED_UPLOAD_CLEANUP_GRACE_MS - 1).toISOString()
  });
  let deleted = false;
  const removed = [];
  const store = emptyStore({
    stagingMediaCleanupPending: async () => row.staging_cleanup_pending ? [structuredClone(row)] : [],
    completeStagingCleanup: async ({ ids, ownerId: claimedOwner }) => {
      assert.deepEqual(ids, [firstId]);
      assert.equal(claimedOwner, ownerId);
      row = { ...row, staging_cleanup_pending: false };
      return [structuredClone(row)];
    },
    expiredMediaAssets: async (_limit, options) => {
      assert.equal(options.recoverPublications, false);
      return !row.staging_cleanup_pending && !deleted ? [structuredClone(row)] : [];
    },
    markMediaCleanupPending: async () => {
      row = { ...row, status: 'cleanup_pending' };
      return [structuredClone(row)];
    },
    deleteMediaAssets: async ({ cleanupClaimed }) => {
      assert.equal(cleanupClaimed, true);
      deleted = true;
      return [structuredClone(row)];
    }
  });
  const storage = { remove: async (bucket, paths) => removed.push([bucket, [...paths]]) };

  const summary = await runMediaReaper({ store, storage, now: () => fixedNow });

  assert.equal(summary.ok, true);
  assert.equal(summary.counts.staging, 1);
  assert.equal(summary.counts.expired, 1);
  assert.equal(deleted, true);
  assert.ok(removed.some(([bucket, paths]) => bucket === STAGING_BUCKET
    && paths.includes(`${ownerId}/${firstId}/source.png`)));
});

test('an ambiguous public delete retains the exact manifest and lease until later reconciliation', async () => {
  let now = Date.parse('2026-08-11T18:00:00.000Z');
  let row = mediaAsset(firstId, 'attached', {
    submission_id: submissionId,
    public_manifest: publicManifest(firstId),
    public_cleanup_pending: true
  });
  let run = 0;
  let clearCalls = 0;
  let releaseCalls = 0;
  const removed = [];
  const store = emptyStore({
    recoverStaleMediaPublications: async () => {
      if (row.status === 'publishing' && run > 0) {
        row = { ...row, status: 'attached', publication_lease_id: null };
        return { rows: [structuredClone(row)], hasMore: false };
      }
      return { rows: [], hasMore: false };
    },
    attachedPublicMediaCleanupPending: async () => row.status === 'attached'
      && row.public_cleanup_pending ? [structuredClone(row)] : [],
    claimAttachedPublicMediaCleanup: async () => {
      row = { ...row, status: 'publishing', publication_lease_id: reaperLease };
      return { asset: structuredClone(row), publicationLeaseId: reaperLease };
    },
    claimStagedPublicMediaCleanup: async () => [structuredClone(row)],
    clearStagedPublicMedia: async () => {
      clearCalls += 1;
      row = { ...row, public_manifest: {}, public_cleanup_pending: false };
      return [structuredClone(row)];
    },
    releaseMediaPublication: async () => {
      releaseCalls += 1;
      row = { ...row, status: 'attached', publication_lease_id: null };
      return [structuredClone(row)];
    }
  });
  const storage = {
    remove: async (bucket, paths) => {
      removed.push([bucket, [...paths]]);
      if (run === 0 && bucket === PUBLIC_BUCKET) {
        throw new MediaStorageError('MEDIA_STORAGE_TIMEOUT', 'unknown provider outcome', 504);
      }
    }
  };

  const first = await runMediaReaper({ store, storage, now: () => now });
  assert.equal(first.ok, false);
  assert.deepEqual(first.failures, [{ phase: 'public-cleanup', code: 'MEDIA_STORAGE_TIMEOUT' }]);
  assert.equal(row.status, 'publishing');
  assert.equal(row.public_cleanup_pending, true);
  assert.deepEqual(row.public_manifest, publicManifest(firstId));
  assert.equal(clearCalls, 0);
  assert.equal(releaseCalls, 0);

  run += 1;
  now += MEDIA_PUBLICATION_LEASE_MS + 1;
  const second = await runMediaReaper({ store, storage, now: () => now });
  assert.equal(second.ok, true);
  assert.equal(second.counts.recovered, 1);
  assert.equal(second.counts.public, 1);
  assert.equal(row.status, 'attached');
  assert.equal(row.public_cleanup_pending, false);
  assert.deepEqual(row.public_manifest, {});
  assert.equal(clearCalls, 1);
  assert.equal(releaseCalls, 1);
  assert.deepEqual(removed.filter(([bucket]) => bucket === PUBLIC_BUCKET).map(([, paths]) => paths), [
    [
      `assets/${firstId}/${oldVersion}/thumb.webp`,
      `assets/${firstId}/${oldVersion}/card.webp`,
      `assets/${firstId}/${oldVersion}/hero.webp`
    ],
    [
      `assets/${firstId}/${oldVersion}/thumb.webp`,
      `assets/${firstId}/${oldVersion}/card.webp`,
      `assets/${firstId}/${oldVersion}/hero.webp`
    ]
  ]);
});

test('bounded batches expose backlog and never process beyond the configured limit', async () => {
  const fixedNow = Date.parse('2026-08-11T18:00:00.000Z');
  const rows = [firstId, secondId, submissionId].map((id) => mediaAsset(id, 'failed', {
    staging_cleanup_pending: true,
    staging_token_expires_at: new Date(fixedNow - SIGNED_UPLOAD_CLEANUP_GRACE_MS - 1).toISOString()
  }));
  const completed = [];
  const store = emptyStore({
    stagingMediaCleanupPending: async (limit) => {
      assert.equal(limit, MEDIA_REAPER_BATCH_LIMIT + 1);
      return rows;
    },
    completeStagingCleanup: async ({ ids }) => {
      const row = rows.find((candidate) => candidate.id === ids[0]);
      completed.push(row.id);
      return [{ ...row, staging_cleanup_pending: false }];
    }
  });
  const summary = await runMediaReaper({
    store,
    storage: { remove: async () => undefined },
    now: () => fixedNow
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.drained, false);
  assert.equal(summary.hasMore.staging, true);
  assert.equal(summary.counts.staging, MEDIA_REAPER_BATCH_LIMIT);
  assert.deepEqual(completed, [firstId, secondId]);
});

test('published review cleanup uses only exact derived paths and preserves staging tombstones', async () => {
  const fixedNow = Date.parse('2026-08-11T18:00:00.000Z');
  let row = mediaAsset(firstId, 'published', {
    staging_cleanup_pending: true,
    staging_token_expires_at: new Date(fixedNow + 60_000).toISOString(),
    review_manifest: reviewManifest(firstId),
    review_cleanup_pending: true
  });
  const removed = [];
  const store = emptyStore({
    publishedMediaCleanupPending: async () => [structuredClone(row)],
    completeReviewCleanup: async (ids, options) => {
      assert.deepEqual(ids, [firstId]);
      assert.equal(options.ownerId, ownerId);
      row = { ...row, review_manifest: {}, review_cleanup_pending: false };
      return [structuredClone(row)];
    }
  });
  const summary = await runMediaReaper({
    store,
    storage: { remove: async (bucket, paths) => removed.push([bucket, [...paths]]) },
    now: () => fixedNow
  });
  assert.equal(summary.ok, true);
  assert.equal(summary.counts.review, 1);
  assert.deepEqual(removed, [[REVIEW_BUCKET, [
    `${ownerId}/${firstId}/v1/thumb.webp`,
    `${ownerId}/${firstId}/v1/card.webp`,
    `${ownerId}/${firstId}/v1/hero.webp`
  ]]]);
  assert.equal(row.staging_cleanup_pending, true);
});
