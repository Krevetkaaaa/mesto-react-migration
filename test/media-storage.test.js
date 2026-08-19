const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES,
  MEDIA_STORAGE_OPERATION_TIMEOUT_MS,
  PUBLIC_BUCKET,
  REVIEW_BUCKET,
  STAGING_BUCKET,
  cleanupPrivateAssets,
  createMediaStorage,
  planPublicManifest,
  reviewPath,
  stagingPath
} = require('../lib/media-storage');

const ownerId = '10000000-0000-4000-8000-000000000001';
const mediaId = '20000000-0000-4000-8000-000000000002';
const version = '30000000-0000-4000-8000-000000000003';

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
}

test('creates a one-time signed staging URL without enabling upsert', async () => {
  const calls = [];
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'service-role-secret',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        url: `/object/upload/sign/mesto-media-staging/${stagingPath(ownerId, mediaId, 'png')}?token=opaque`
      });
    }
  });
  const path = stagingPath(ownerId, mediaId, 'png');
  const signed = await storage.signedUpload(path);

  assert.equal(signed.path, path);
  assert.equal(
    signed.uploadUrl,
    `https://project.supabase.co/storage/v1/object/upload/sign/mesto-media-staging/${path}?token=opaque`
  );
  assert.equal(signed.uploadUrl.includes('service-role-secret'), false);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).has('x-upsert'), false);
});

test('signed staging URLs are fenced to the configured origin, exact object path and one token', async () => {
  const path = stagingPath(ownerId, mediaId, 'jpg');
  const exactPath = `/storage/v1/object/upload/sign/${STAGING_BUCKET}/${path}`;
  const invalidUrls = [
    `https://production.supabase.co${exactPath}?token=opaque`,
    `https://project.supabase.co:444${exactPath}?token=opaque`,
    `https://user@project.supabase.co${exactPath}?token=opaque`,
    `http://project.supabase.co${exactPath}?token=opaque`,
    `https://project.supabase.co${exactPath}/orphan?token=opaque`,
    `https://project.supabase.co${exactPath}%2Forphan?token=opaque`,
    `https://project.supabase.co${exactPath}?token=`,
    `https://project.supabase.co${exactPath}?token=one&token=two`,
    `https://project.supabase.co${exactPath}?token=opaque&extra=1`,
    `https://project.supabase.co${exactPath}?token=opaque#fragment`
  ];

  for (const url of invalidUrls) {
    const storage = createMediaStorage({
      url: 'https://project.supabase.co',
      key: 'service-role-secret',
      fetchImpl: async () => jsonResponse({ url })
    });
    await assert.rejects(
      () => storage.signedUpload(path),
      (error) => error.code === 'MEDIA_SIGN_INVALID_RESPONSE' && error.statusCode === 502
    );
  }

  const absolute = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'service-role-secret',
    fetchImpl: async () => jsonResponse({
      signedURL: `https://project.supabase.co${exactPath}?token=opaque`
    })
  });
  assert.equal(
    (await absolute.signedUpload(path)).uploadUrl,
    `https://project.supabase.co${exactPath}?token=opaque`
  );
});

test('uploads immutable public objects with no-upsert semantics', async () => {
  const calls = [];
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'secret',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ Key: 'ok' });
    }
  });
  await storage.upload(PUBLIC_BUCKET, `assets/${mediaId}/${version}/hero.webp`, Buffer.from('webp'), 'image/webp', IMMUTABLE_CACHE_CONTROL);
  const headers = new Headers(calls[0].init.headers);
  assert.equal(headers.get('x-upsert'), 'false');
  assert.equal(headers.get('cache-control'), IMMUTABLE_CACHE_CONTROL);
  assert.equal(headers.get('content-type'), 'image/webp');
});

test('aborts a stalled provider PUT at the bounded publication deadline', async () => {
  let capturedSignal;
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'secret',
    operationTimeoutMs: 20,
    fetchImpl: async (_url, init) => {
      capturedSignal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
      });
    }
  });

  await assert.rejects(
    () => storage.upload(PUBLIC_BUCKET, `assets/${mediaId}/${version}/hero.webp`, Buffer.from('webp'), 'image/webp'),
    (error) => error.code === 'MEDIA_STORAGE_TIMEOUT' && error.statusCode === 504
  );
  assert.equal(capturedSignal.aborted, true);
  assert.ok(MEDIA_STORAGE_OPERATION_TIMEOUT_MS < 15 * 60_000);
});

test('Storage deletion accepts only a bounded array of requested object receipts', async () => {
  const first = stagingPath(ownerId, mediaId, 'png');
  const second = reviewPath(ownerId, mediaId, 'thumb');
  const responses = [
    jsonResponse([{ name: first }, { path: second }]),
    jsonResponse([]),
    jsonResponse({ message: 'removed' }),
    jsonResponse([{ name: 'foreign/object.webp' }]),
    jsonResponse([{ name: first }, { name: first }]),
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES + 1) }
    })
  ];
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'secret',
    fetchImpl: async () => responses.shift()
  });

  assert.deepEqual(await storage.remove(STAGING_BUCKET, [first, second]), [first, second]);
  assert.deepEqual(await storage.remove(STAGING_BUCKET, [first]), []);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(
      () => storage.remove(STAGING_BUCKET, [first]),
      (error) => error.code === 'MEDIA_CLEANUP_RECEIPT_INVALID'
    );
  }
});

test('Storage deletion cancels a chunked receipt as soon as the byte cap is exceeded', async () => {
  const objectPath = stagingPath(ownerId, mediaId, 'png');
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES));
      controller.enqueue(new Uint8Array([0]));
    },
    cancel() {
      cancelled = true;
    }
  });
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'secret',
    fetchImpl: async () => new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  });

  await assert.rejects(
    () => storage.remove(STAGING_BUCKET, [objectPath]),
    (error) => error.code === 'MEDIA_CLEANUP_RECEIPT_INVALID'
  );
  assert.equal(cancelled, true);
});

test('plans UUID-versioned publication and removes private staging/review paths', async () => {
  const removed = [];
  const storage = {
    publicUrl: (path) => `https://project.supabase.co/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`,
    remove: async (bucket, paths) => removed.push({ bucket, paths })
  };
  const asset = {
    id: mediaId,
    staging_path: stagingPath(ownerId, mediaId, 'jpg'),
    review_manifest: Object.fromEntries(['thumb', 'card', 'hero'].map((name) => [name, {
      path: reviewPath(ownerId, mediaId, name), width: 640, height: 480
    }]))
  };
  const manifest = planPublicManifest(storage, asset, version);
  assert.equal(manifest.hero.path, `assets/${mediaId}/${version}/hero.webp`);
  assert.match(manifest.hero.url, /\/object\/public\/mesto-media-public\/assets\//);

  await cleanupPrivateAssets(storage, [asset]);
  assert.deepEqual(removed, [
    { bucket: STAGING_BUCKET, paths: [asset.staging_path] },
    { bucket: REVIEW_BUCKET, paths: ['thumb', 'card', 'hero'].map((name) => asset.review_manifest[name].path) }
  ]);
});

test('rejects downloads whose authoritative bytes exceed the limit', async () => {
  const storage = createMediaStorage({
    url: 'https://project.supabase.co',
    key: 'secret',
    fetchImpl: async () => new Response(Buffer.alloc(11), { status: 200, headers: { 'Content-Length': '11' } })
  });
  await assert.rejects(
    () => storage.download(STAGING_BUCKET, stagingPath(ownerId, mediaId, 'png'), 10),
    (error) => error.code === 'MEDIA_TOO_LARGE' && error.statusCode === 413
  );
});
