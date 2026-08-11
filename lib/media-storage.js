const crypto = require('node:crypto');

const STAGING_BUCKET = 'mesto-media-staging';
const REVIEW_BUCKET = 'mesto-media-review';
const PUBLIC_BUCKET = 'mesto-media-public';
const PRIVATE_CACHE_CONTROL = 'no-store, max-age=0';
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const VARIANT_NAMES = Object.freeze(['thumb', 'card', 'hero']);
const MEDIA_STORAGE_OPERATION_TIMEOUT_MS = 6_000;
const MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES = 256 * 1024;

class MediaStorageError extends Error {
  constructor(code, message, statusCode = 502, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MediaStorageError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function storageMutationCommitIsAmbiguous(error) {
  const statusCode = Number(error?.statusCode);
  return error?.code === 'MEDIA_STORAGE_TIMEOUT'
    || !Number.isInteger(statusCode)
    || statusCode < 100
    || statusCode >= 500;
}

function ambiguousPublicUploadError(error, path) {
  const wrapped = new MediaStorageError(
    'MEDIA_PUBLIC_UPLOAD_COMMIT_AMBIGUOUS',
    'Public media upload outcome is unknown and requires reconciliation',
    Number(error?.statusCode) >= 500 ? Number(error.statusCode) : 502,
    error instanceof Error ? error : undefined
  );
  wrapped.publicMediaUploadCommitAmbiguous = true;
  wrapped.publicMediaUploadPath = safePath(path);
  return wrapped;
}

function normalizeConfiguration(input = {}) {
  const url = String(input.url || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(input.key || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    throw new MediaStorageError('SUPABASE_NOT_CONFIGURED', 'Supabase Storage is not configured', 503);
  }
  return { url, key, storageUrl: `${url}/storage/v1` };
}

function safePath(path) {
  const normalized = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('\\') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError('Unsafe media object path');
  }
  return normalized;
}

function encodedPath(path) {
  return safePath(path).split('/').map(encodeURIComponent).join('/');
}

function validateSignedUploadUrl(rawUrl, config, normalizedPath) {
  const expected = new URL(
    `${config.storageUrl}/object/upload/sign/${STAGING_BUCKET}/${encodedPath(normalizedPath)}`
  );
  let candidate;
  try {
    const raw = String(rawUrl || '');
    if (!raw) throw new TypeError('Missing signed URL');
    candidate = /^https?:\/\//i.test(raw)
      ? new URL(raw)
      : raw.startsWith('/storage/v1/')
        ? new URL(raw, expected.origin)
        : raw.startsWith('/')
          ? new URL(`${new URL(config.storageUrl).pathname}${raw}`, expected.origin)
          : new URL(raw, `${config.storageUrl}/`);
  } catch {
    throw new MediaStorageError('MEDIA_SIGN_INVALID_RESPONSE', 'Storage returned an invalid signed upload URL');
  }
  const tokens = candidate.searchParams.getAll('token');
  const queryKeys = [...candidate.searchParams.keys()];
  if (candidate.protocol !== 'https:'
    || candidate.origin !== expected.origin
    || candidate.username
    || candidate.password
    || candidate.pathname !== expected.pathname
    || candidate.hash
    || tokens.length !== 1
    || !tokens[0]
    || queryKeys.length !== 1
    || queryKeys[0] !== 'token') {
    throw new MediaStorageError('MEDIA_SIGN_INVALID_RESPONSE', 'Storage returned an invalid signed upload URL');
  }
  return candidate.href;
}

function mediaPath(ownerId, mediaId, leaf) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(String(ownerId)) || !uuid.test(String(mediaId))) throw new TypeError('Media paths require UUID identifiers');
  return `${String(ownerId).toLowerCase()}/${String(mediaId).toLowerCase()}/${safePath(leaf)}`;
}

function stagingPath(ownerId, mediaId, extension) {
  const selected = ['jpg', 'png', 'webp'].includes(extension) ? extension : 'bin';
  return mediaPath(ownerId, mediaId, `source.${selected}`);
}

function reviewPath(ownerId, mediaId, variant) {
  if (!VARIANT_NAMES.includes(variant)) throw new TypeError('Unknown media variant');
  return mediaPath(ownerId, mediaId, `v1/${variant}.webp`);
}

function publicPath(mediaId, version, variant) {
  if (!VARIANT_NAMES.includes(variant)) throw new TypeError('Unknown media variant');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(String(mediaId)) || !uuid.test(String(version))) throw new TypeError('Public media paths require UUID identifiers');
  return `assets/${String(mediaId).toLowerCase()}/${String(version).toLowerCase()}/${variant}.webp`;
}

async function errorBody(response) {
  const body = await response.json().catch(() => null);
  return String(body?.message || body?.error || body?.code || `Storage request failed (${response.status})`).slice(0, 300);
}

async function boundedJson(response, maxBytes = MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.().catch(() => null);
    throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt is too large');
  }

  let bytes;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      length += chunk.length;
      if (length > maxBytes) {
        await reader.cancel().catch(() => null);
        throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt is too large');
      }
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks, length);
  } else {
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt is too large');
    }
  }

  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt is not valid JSON');
  }
}

function validateRemovalReceipt(receipt, requestedPaths) {
  if (!Array.isArray(receipt)) {
    throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt must be an array');
  }
  const requested = new Set(requestedPaths);
  const removed = new Set();
  for (const entry of receipt) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt contains an invalid object');
    }
    const candidate = typeof entry.name === 'string'
      ? entry.name
      : typeof entry.path === 'string'
        ? entry.path
        : '';
    let path;
    try {
      path = safePath(candidate);
    } catch {
      throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt contains an invalid path');
    }
    if (!requested.has(path) || removed.has(path)) {
      throw new MediaStorageError('MEDIA_CLEANUP_RECEIPT_INVALID', 'Storage cleanup receipt contains an unexpected path');
    }
    removed.add(path);
  }
  return [...removed];
}

function createMediaStorage({
  fetchImpl = global.fetch,
  operationTimeoutMs = MEDIA_STORAGE_OPERATION_TIMEOUT_MS,
  ...input
} = {}) {
  const config = normalizeConfiguration(input);
  if (typeof fetchImpl !== 'function') throw new TypeError('Media storage transport is unavailable');
  const timeoutMs = Number(operationTimeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new TypeError('Media storage operation timeout is invalid');
  }
  const headers = () => ({ apikey: config.key, Authorization: `Bearer ${config.key}` });

  async function withDeadline(operation) {
    const controller = new AbortController();
    const timeoutError = new MediaStorageError(
      'MEDIA_STORAGE_TIMEOUT',
      'Media storage operation exceeded its deadline',
      504
    );
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
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

  async function signedUpload(path) {
    const normalized = safePath(path);
    return withDeadline(async (signal) => {
      const response = await fetchImpl(`${config.storageUrl}/object/upload/sign/${STAGING_BUCKET}/${encodedPath(normalized)}`, {
        method: 'POST',
        headers: { ...headers(), Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal
      });
      if (!response.ok) throw new MediaStorageError('MEDIA_SIGN_FAILED', await errorBody(response), response.status >= 500 ? 502 : response.status);
      const body = await response.json().catch(() => null);
      const rawUrl = String(body?.url || body?.signedURL || body?.signedUrl || '');
      if (!rawUrl) throw new MediaStorageError('MEDIA_SIGN_INVALID_RESPONSE', 'Storage returned no signed upload URL');
      const uploadUrl = validateSignedUploadUrl(rawUrl, config, normalized);
      return { path: normalized, uploadUrl };
    });
  }

  async function upload(bucket, path, bytes, contentType, cacheControl = PRIVATE_CACHE_CONTROL) {
    const normalized = safePath(path);
    return withDeadline(async (signal) => {
      const response = await fetchImpl(`${config.storageUrl}/object/${encodeURIComponent(bucket)}/${encodedPath(normalized)}`, {
        method: 'POST',
        headers: {
          ...headers(),
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'x-upsert': 'false'
        },
        body: bytes,
        signal
      });
      if (!response.ok) throw new MediaStorageError('MEDIA_UPLOAD_FAILED', await errorBody(response), response.status >= 500 ? 502 : response.status);
      return { bucket, path: normalized };
    });
  }

  async function download(bucket, path, maxBytes) {
    const normalized = safePath(path);
    return withDeadline(async (signal) => {
      const response = await fetchImpl(`${config.storageUrl}/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath(normalized)}`, {
        method: 'GET',
        headers: headers(),
        signal
      });
      if (!response.ok) throw new MediaStorageError('MEDIA_DOWNLOAD_FAILED', await errorBody(response), response.status === 404 ? 404 : 502);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel?.().catch(() => null);
        throw new MediaStorageError('MEDIA_TOO_LARGE', 'Stored media exceeds the allowed size', 413);
      }
      if (!response.body?.getReader) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > maxBytes) throw new MediaStorageError('MEDIA_TOO_LARGE', 'Stored media exceeds the allowed size', 413);
        return bytes;
      }
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        length += chunk.length;
        if (length > maxBytes) {
          await reader.cancel().catch(() => null);
          throw new MediaStorageError('MEDIA_TOO_LARGE', 'Stored media exceeds the allowed size', 413);
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, length);
    });
  }

  async function remove(bucket, paths) {
    const prefixes = [...new Set((paths || []).filter(Boolean).map(safePath))];
    if (!prefixes.length) return;
    return withDeadline(async (signal) => {
      const response = await fetchImpl(`${config.storageUrl}/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE',
        headers: { ...headers(), Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes }),
        signal
      });
      if (!response.ok) throw new MediaStorageError('MEDIA_CLEANUP_FAILED', await errorBody(response));
      const receipt = await boundedJson(response);
      return validateRemovalReceipt(receipt, prefixes);
    });
  }

  function publicUrl(path) {
    return `${config.storageUrl}/object/public/${PUBLIC_BUCKET}/${encodedPath(path)}`;
  }

  return { download, publicUrl, remove, signedUpload, upload };
}

function manifestPaths(manifest) {
  return VARIANT_NAMES.map((variant) => manifest?.[variant]?.path).filter(Boolean).map(safePath);
}

async function cleanupPrivateAssets(storage, assets) {
  const staging = [];
  const review = [];
  for (const asset of assets || []) {
    if (asset?.staging_path) staging.push(asset.staging_path);
    review.push(...manifestPaths(asset?.review_manifest));
  }
  await Promise.all([
    storage.remove(STAGING_BUCKET, staging),
    storage.remove(REVIEW_BUCKET, review)
  ]);
}

async function cleanupPublicManifests(storage, manifests) {
  const paths = [];
  for (const manifest of Object.values(manifests || {})) paths.push(...manifestPaths(manifest));
  if (paths.length) await storage.remove(PUBLIC_BUCKET, paths);
}

function planPublicManifest(storage, asset, version = crypto.randomUUID()) {
  const manifest = { version };
  for (const variant of VARIANT_NAMES) {
    const source = asset?.review_manifest?.[variant];
    if (!source?.path) throw new MediaStorageError('MEDIA_REVIEW_INCOMPLETE', `Missing ${variant} review derivative`, 409);
    const path = publicPath(asset.id, version, variant);
    manifest[variant] = {
      path,
      url: storage.publicUrl(path),
      width: Number(source.width),
      height: Number(source.height),
      bytes: 0,
      contentType: 'image/webp'
    };
  }
  return manifest;
}

async function publishAsset(storage, asset, version = crypto.randomUUID()) {
  const uploaded = [];
  const manifest = planPublicManifest(storage, asset, version);
  try {
    for (const variant of VARIANT_NAMES) {
      const source = asset?.review_manifest?.[variant];
      const bytes = await storage.download(REVIEW_BUCKET, source.path, 6 * 1024 * 1024);
      const targetPath = manifest[variant].path;
      try {
        await storage.upload(PUBLIC_BUCKET, targetPath, bytes, 'image/webp', IMMUTABLE_CACHE_CONTROL);
      } catch (error) {
        // Timeout, transport loss and 5xx are commit-ambiguous for a mutating
        // PUT/POST. Do not race a DELETE against a provider write which may
        // still commit after the response was lost. The caller has already
        // persisted this exact immutable path and keeps its lease for the
        // delayed stale-publication reconciliation pass.
        if (storageMutationCommitIsAmbiguous(error)) {
          throw ambiguousPublicUploadError(error, targetPath);
        }
        throw error;
      }
      uploaded.push(targetPath);
      manifest[variant].bytes = bytes.length;
    }
    return manifest;
  } catch (error) {
    if (error?.publicMediaUploadCommitAmbiguous === true) throw error;
    await storage.remove(PUBLIC_BUCKET, uploaded).catch(() => null);
    throw error;
  }
}

module.exports = {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE_DELETE_RECEIPT_MAX_BYTES,
  MEDIA_STORAGE_OPERATION_TIMEOUT_MS,
  PRIVATE_CACHE_CONTROL,
  PUBLIC_BUCKET,
  REVIEW_BUCKET,
  STAGING_BUCKET,
  VARIANT_NAMES,
  MediaStorageError,
  cleanupPrivateAssets,
  cleanupPublicManifests,
  createMediaStorage,
  manifestPaths,
  planPublicManifest,
  publicPath,
  publishAsset,
  reviewPath,
  safePath,
  storageMutationCommitIsAmbiguous,
  stagingPath,
  validateSignedUploadUrl
};
