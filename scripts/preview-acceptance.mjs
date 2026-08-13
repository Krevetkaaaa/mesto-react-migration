import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';

import {
  linkedVercelProject,
  previewProviderExpectation,
  resolveExpectedPreviewCommitSha,
  verifyPreviewDeployment,
  verifyPreviewReleaseFingerprint,
} from './preview-load.mjs';
import { verifyStoredXssBrowser } from './preview-browser-oracle.mjs';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_MEDIA_REAPER_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
export const MEDIA_REAPER_REQUEST_TIMEOUT_MS = 135_000;
const PRODUCTION_ORIGIN = 'https://mesto-city-guide.vercel.app';
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEY = /authorization|body|cookie|credential|email|login|password|payload|secret|token|username/i;
const SAFE_ERROR_CODE = /^[A-Z0-9_]{1,80}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_VARIANTS = Object.freeze(['thumb', 'card', 'hero']);
const MAX_MEDIA_RESPONSE_BYTES = 6 * 1024 * 1024;
const SIGNED_UPLOAD_MIN_HORIZON_MS = 110 * 60 * 1_000;
const SIGNED_UPLOAD_MAX_HORIZON_MS = 130 * 60 * 1_000;
const STAGING_TOMBSTONE_GRACE_MS = 5 * 60 * 1_000;
const CLEANUP_CLOCK_BUFFER_MS = 30 * 1_000;
const CACHE_INVALIDATION_BASELINE_MAX_AGE_MS = 45_000;
const MEDIA_CLEANUP_ACTIONS = new Set(['submission.resolve', 'media.release', 'venue.delete']);
const SESSION_LOGOUT_ACTIONS = new Set(['merchant.logout', 'customer.logout', 'admin-a.logout', 'admin-b.logout']);
const MEDIA_REAPER_SUMMARY_KEYS = Object.freeze(['counts', 'drained', 'failures', 'hasMore', 'ok']);
const MEDIA_REAPER_PHASE_KEYS = Object.freeze(['expired', 'public', 'recovered', 'review', 'staging']);
const MEDIA_REAPER_EXPECTED_COUNTS = Object.freeze({
  recovered: 0,
  public: 0,
  staging: 1,
  review: 0,
  expired: 1,
});

function sleepMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const PREVIEW_API = Object.freeze({
  adminDashboard: '/api/admin/dashboard',
  adminLogin: '/api/admin/login',
  adminLogout: '/api/admin/logout',
  adminMerchants: '/api/admin/merchants',
  adminReviews: '/api/admin/reviews',
  adminSession: '/api/admin/session',
  adminSubmissions: '/api/admin/submissions',
  adminVenues: '/api/admin/venues',
  authLogin: '/api/auth/login',
  authLogout: '/api/auth/logout',
  authPassword: '/api/auth/password',
  authProviders: '/api/auth/providers',
  authRegister: '/api/auth/register',
  authSession: '/api/auth/session',
  favorites: '/api/favorites',
  merchantDashboard: '/api/merchant/dashboard',
  merchantMenu: '/api/merchant/menu',
  merchantPromotions: '/api/merchant/promotions',
  merchantVenue: '/api/merchant/venue',
  mediaReaper: '/api/cron/media-reaper',
  reviews: '/api/reviews',
  submissions: '/api/submissions',
  uploadFinalize: '/api/uploads/finalize',
  uploadRelease: '/api/uploads/release',
  uploadSign: '/api/uploads/sign',
  uploadStatus: '/api/uploads/status',
  venueContent: '/api/venue-content',
  venues: '/api/venues',
});

export const MEDIA_ACCEPTANCE_MODE = Object.freeze({
  mode: 'direct-signed-provider',
  assetsCreated: 2,
  attachedAssets: 1,
  abandonedReaperProbeAssets: 1,
});

class AcceptanceError extends Error {
  constructor(phase, code, status = null) {
    super(code);
    this.name = 'AcceptanceError';
    this.phase = String(phase || 'acceptance');
    this.code = SAFE_ERROR_CODE.test(String(code || '')) ? String(code) : 'ACCEPTANCE_FAILED';
    this.status = Number.isInteger(status) ? status : null;
  }
}

function invariant(condition, phase, code, status = null) {
  if (!condition) throw new AcceptanceError(phase, code, status);
}

function instantMilliseconds(value, phase, code = 'CLOCK_INVALID') {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  invariant(Number.isFinite(milliseconds) && Number.isSafeInteger(milliseconds), phase, code);
  return milliseconds;
}

function clockMilliseconds(now, phase) {
  invariant(typeof now === 'function', phase, 'CLOCK_INVALID');
  return instantMilliseconds(now(), phase);
}

function normalizedOrigin(value, phase = 'target') {
  let target;
  try {
    target = new URL(String(value || ''));
  } catch {
    throw new AcceptanceError(phase, 'INVALID_PREVIEW_ORIGIN');
  }
  invariant(target.protocol === 'https:', phase, 'PREVIEW_HTTPS_REQUIRED');
  invariant(!target.username && !target.password, phase, 'PREVIEW_CREDENTIALS_FORBIDDEN');
  invariant(!target.port, phase, 'PREVIEW_NONSTANDARD_PORT_FORBIDDEN');
  invariant(target.pathname === '/' && !target.search && !target.hash, phase, 'PREVIEW_ORIGIN_ONLY');
  const hostname = target.hostname.toLowerCase();
  invariant(hostname !== 'vercel.app' && hostname.endsWith('.vercel.app'), phase, 'VERCEL_PREVIEW_HOST_REQUIRED');
  invariant(
    hostname.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
    phase,
    'INVALID_VERCEL_PREVIEW_HOST',
  );
  return target.origin;
}

export function validatePreviewAcceptanceTarget(value, allowedOrigin, productionOrigin = '') {
  const target = normalizedOrigin(value);
  invariant(target !== PRODUCTION_ORIGIN, 'target', 'PRODUCTION_ALIAS_FORBIDDEN');

  if (String(productionOrigin || '').trim()) {
    const configuredProduction = normalizedOrigin(productionOrigin, 'production-target');
    invariant(target !== configuredProduction, 'target', 'PRODUCTION_ALIAS_FORBIDDEN');
  }

  const allowlisted = normalizedOrigin(allowedOrigin, 'allowlist');
  invariant(target === allowlisted, 'target', 'PREVIEW_ALLOWLIST_MISMATCH');
  return target;
}

export function parsePreviewAcceptanceArguments(args, environment = process.env) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--acknowledge-preview-mutations') {
      invariant(!values.has(option), 'arguments', 'DUPLICATE_ACKNOWLEDGEMENT');
      values.set(option, true);
      continue;
    }
    invariant(
      ['--base-url', '--deployment-id', '--expected-commit-sha'].includes(option),
      'arguments',
      'UNKNOWN_ACCEPTANCE_OPTION',
    );
    const value = args[index + 1];
    invariant(value && !value.startsWith('--'), 'arguments', 'BASE_URL_VALUE_REQUIRED');
    const duplicateCode = {
      '--base-url': 'DUPLICATE_BASE_URL',
      '--deployment-id': 'DUPLICATE_DEPLOYMENT_ID',
      '--expected-commit-sha': 'DUPLICATE_EXPECTED_COMMIT_SHA',
    }[option];
    invariant(!values.has(option), 'arguments', duplicateCode);
    values.set(option, value);
    index += 1;
  }

  invariant(values.has('--acknowledge-preview-mutations'), 'arguments', 'PREVIEW_MUTATION_ACK_REQUIRED');
  invariant(values.has('--base-url'), 'arguments', 'BASE_URL_REQUIRED');
  const deploymentId = String(values.get('--deployment-id') || '');
  invariant(/^dpl_[A-Za-z0-9]{16,}$/.test(deploymentId), 'arguments', 'DEPLOYMENT_ID_REQUIRED');
  let expectedCommitSha;
  try {
    expectedCommitSha = resolveExpectedPreviewCommitSha(values.get('--expected-commit-sha'), environment);
  } catch {
    throw new AcceptanceError('arguments', 'EXPECTED_COMMIT_SHA_INVALID');
  }
  return {
    baseUrl: validatePreviewAcceptanceTarget(
      values.get('--base-url'),
      environment.MESTO_ACCEPTANCE_ALLOWED_PREVIEW_ORIGIN,
      environment.MESTO_ACCEPTANCE_PRODUCTION_ORIGIN,
    ),
    deploymentId,
    expectedCommitSha,
  };
}

function acceptanceCredentials(environment) {
  const adminLogin = String(environment.MESTO_ACCEPTANCE_ADMIN_LOGIN || '').trim();
  const adminPassword = String(environment.MESTO_ACCEPTANCE_ADMIN_PASSWORD || '');
  invariant(adminLogin.length > 0 && adminLogin.length <= 120, 'configuration', 'ADMIN_LOGIN_MISSING');
  invariant(adminPassword.length >= 10, 'configuration', 'ADMIN_PASSWORD_MISSING');
  return {
    adminLogin,
    adminPassword,
    bypassSecret: String(environment.MESTO_PREVIEW_BYPASS_SECRET || ''),
    browserExecutablePath: String(environment.MESTO_ACCEPTANCE_CHROME_EXECUTABLE_PATH || ''),
    cronSecret: validateAcceptanceCronSecret(environment.MESTO_ACCEPTANCE_CRON_SECRET),
  };
}

export function validateAcceptanceCronSecret(value) {
  invariant(
    typeof value === 'string' && value === value.trim() && value.length >= 32,
    'configuration',
    'ACCEPTANCE_CRON_SECRET_INVALID',
  );
  return value;
}

function safeFailure(error) {
  if (error instanceof AcceptanceError) {
    return {
      phase: error.phase,
      code: error.code,
      ...(error.status === null ? {} : { status: error.status }),
    };
  }
  return { phase: 'acceptance', code: 'UNEXPECTED_ACCEPTANCE_FAILURE' };
}

export function redactForReport(value, { sensitiveValues = [] } = {}) {
  const secrets = sensitiveValues
    .map((item) => String(item || ''))
    .filter((item) => item.length >= 3)
    .sort((left, right) => right.length - left.length);

  function redactString(input) {
    let output = String(input);
    for (const secret of secrets) output = output.split(secret).join('[REDACTED]');
    return output;
  }

  function visit(input) {
    if (Array.isArray(input)) return input.map(visit);
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : visit(item),
      ]));
    }
    return typeof input === 'string' ? redactString(input) : input;
  }

  return visit(value);
}

function identifierHash(value, runId) {
  return createHash('sha256').update(`${runId}:${String(value || '')}`).digest('base64url').slice(0, 20);
}

function requireUuid(value, phase, code) {
  const normalized = String(value || '').trim().toLowerCase();
  invariant(UUID_PATTERN.test(normalized), phase, code);
  return normalized;
}

function strongPassword(prefix) {
  return `${prefix}A9!${randomBytes(24).toString('base64url')}`;
}

function generatedIdentity(runId) {
  return {
    customer: {
      displayName: `Acceptance Customer ${runId}`,
      email: `mesto.acceptance+${runId}@example.com`,
      username: `acceptance.${runId}`,
      password: strongPassword('Customer'),
    },
    merchant: {
      displayName: `Acceptance Merchant ${runId}`,
      email: `mesto.merchant+${runId}@example.com`,
      username: `merchant.${runId}`,
      temporaryPassword: strongPassword('MerchantTemp'),
      password: strongPassword('MerchantFinal'),
    },
  };
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  absorb(headers) {
    const setCookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
    for (const setCookie of setCookies) {
      const pair = String(setCookie).split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (!cookieValue || /(?:^|;)\s*max-age=0(?:;|$)/i.test(String(setCookie))) this.cookies.delete(name);
      else this.cookies.set(name, cookieValue);
    }
  }

  header() {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join('; ');
  }

  clone() {
    const copy = new CookieJar();
    copy.cookies = new Map(this.cookies);
    return copy;
  }
}

const NO_COOKIES = Object.freeze({
  absorb() {},
  header() { return ''; },
});

function cacheState(headers) {
  const state = String(headers.get('x-vercel-cache') || '').trim().toUpperCase();
  if (state) return state.slice(0, 24);
  const age = Number(headers.get('age') || 0);
  return Number.isFinite(age) && age > 0 ? 'HIT' : 'UNKNOWN';
}

function explicitCacheState(headers) {
  return String(headers.get('x-vercel-cache') || '').trim().toUpperCase().slice(0, 24);
}

function cachePop(headers) {
  const value = String(headers.get('x-vercel-id') || '').trim().split('::', 1)[0].toLowerCase();
  return /^[a-z0-9-]{2,24}$/.test(value) ? value : '';
}

export async function boundedResponseBody(response, phase, maximumBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => {});
    throw new AcceptanceError(phase, 'RESPONSE_TOO_LARGE', response.status);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new AcceptanceError(phase, 'RESPONSE_TOO_LARGE', response.status);
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function boundedBinaryBody(response, phase, maximumBytes = MAX_MEDIA_RESPONSE_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => {});
    throw new AcceptanceError(phase, 'MEDIA_RESPONSE_TOO_LARGE', response.status);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, length);
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new AcceptanceError(phase, 'MEDIA_RESPONSE_TOO_LARGE', response.status);
    }
    chunks.push(chunk);
  }
}

export function validateSignedUploadReceipt(receipt, {
  customerId,
  expectedSupabaseProjectRef,
  observedAtMs = Date.now(),
  phase = 'media.sign',
} = {}) {
  const mediaId = requireUuid(receipt?.mediaId, phase, 'MEDIA_ID_INVALID');
  const cleanupDeadline = validateSignedUploadExpiry(receipt?.expiresAt, { observedAtMs, phase });
  invariant(Number(receipt?.maxBytes) === MAX_MEDIA_RESPONSE_BYTES, phase, 'MEDIA_MAX_BYTES_MISMATCH');
  const rawUploadUrl = String(receipt?.uploadUrl || '');
  invariant(rawUploadUrl === rawUploadUrl.trim(), phase, 'MEDIA_SIGNED_URL_INVALID');
  let uploadUrl;
  try {
    uploadUrl = new URL(rawUploadUrl);
  } catch {
    throw new AcceptanceError(phase, 'MEDIA_SIGNED_URL_INVALID');
  }
  const expectedProviderHost = `${expectedSupabaseProjectRef}.supabase.co`;
  const rawAuthority = /^https:\/\/([^/?#]+)/.exec(rawUploadUrl)?.[1] || '';
  invariant(
    uploadUrl.protocol === 'https:'
      && uploadUrl.hostname === expectedProviderHost
      && rawAuthority === expectedProviderHost
      && !uploadUrl.username
      && !uploadUrl.password
      && !uploadUrl.port,
    phase,
    'MEDIA_SIGNED_URL_PROVIDER_MISMATCH',
  );
  const expectedPath = `/storage/v1/object/upload/sign/mesto-media-staging/${customerId}/${mediaId}/source.jpg`;
  invariant(uploadUrl.pathname === expectedPath, phase, 'MEDIA_SIGNED_URL_PATH_MISMATCH');
  invariant(!uploadUrl.hash, phase, 'MEDIA_SIGNED_URL_INVALID');
  const queryEntries = [...uploadUrl.searchParams.entries()];
  invariant(
    /^\?token=[^&]+$/.test(uploadUrl.search)
      && queryEntries.length === 1
      && queryEntries[0][0] === 'token'
      && queryEntries[0][1].trim().length > 0,
    phase,
    'MEDIA_SIGNED_URL_TOKEN_INVALID',
  );
  return { mediaId, uploadUrl, storageOrigin: uploadUrl.origin, ...cleanupDeadline };
}

export function validateSignedUploadExpiry(value, {
  observedAtMs = Date.now(),
  phase = 'media.sign',
} = {}) {
  const expiresAt = String(value || '');
  invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt), phase, 'MEDIA_EXPIRES_AT_INVALID');
  const expiresAtMs = Date.parse(expiresAt);
  invariant(Number.isFinite(expiresAtMs) && new Date(expiresAtMs).toISOString() === expiresAt, phase, 'MEDIA_EXPIRES_AT_INVALID');
  const observed = instantMilliseconds(observedAtMs, phase);
  const horizonMs = expiresAtMs - observed;
  invariant(horizonMs >= SIGNED_UPLOAD_MIN_HORIZON_MS, phase, 'MEDIA_EXPIRES_AT_TOO_EARLY');
  invariant(horizonMs <= SIGNED_UPLOAD_MAX_HORIZON_MS, phase, 'MEDIA_EXPIRES_AT_TOO_LATE');
  const notBeforeMs = expiresAtMs + STAGING_TOMBSTONE_GRACE_MS + CLEANUP_CLOCK_BUFFER_MS;
  return {
    expiresAt,
    expiresAtMs,
    horizonMs,
    notBefore: new Date(notBeforeMs).toISOString(),
    notBeforeMs,
  };
}

export function registerSignedUploadReceipt(state, receipt, options = {}) {
  const phase = options.phase || 'media.sign';
  const mediaId = requireUuid(receipt?.mediaId, phase, 'MEDIA_ID_INVALID');
  const mediaIdsField = options.mediaIdsField || 'mediaIds';
  invariant(Array.isArray(state?.[mediaIdsField]), phase, 'MEDIA_CLEANUP_STATE_INVALID');
  if (!state[mediaIdsField].includes(mediaId)) state[mediaIdsField].push(mediaId);
  if (!Array.isArray(state.mediaCleanupDeadlines)) state.mediaCleanupDeadlines = [];
  const observedAtMs = instantMilliseconds(options.observedAtMs ?? Date.now(), phase);
  const rawExpiresAt = String(receipt?.expiresAt || '');
  let retained = state.mediaCleanupDeadlines.find((item) => item?.mediaId === mediaId);
  if (!retained) {
    retained = { mediaId, expiresAt: rawExpiresAt, valid: false };
    state.mediaCleanupDeadlines.push(retained);
  } else {
    invariant(retained.expiresAt === rawExpiresAt, phase, 'MEDIA_CLEANUP_DEADLINE_CHANGED');
  }
  try {
    const deadline = validateSignedUploadExpiry(rawExpiresAt, { observedAtMs, phase });
    Object.assign(retained, deadline, { valid: true });
  } catch (error) {
    retained.failureCode = SAFE_ERROR_CODE.test(String(error?.code || '')) ? error.code : 'MEDIA_EXPIRES_AT_INVALID';
    throw error;
  }
  return validateSignedUploadReceipt(receipt, { ...options, observedAtMs, phase });
}

async function externalRequest(fetchImpl, url, phase, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AcceptanceError(phase, options.method && options.method !== 'GET'
      ? 'AMBIGUOUS_MEDIA_TRANSPORT_FAILURE'
      : 'MEDIA_TRANSPORT_FAILURE');
  }
  invariant(response.status < 300 || response.status >= 400, phase, 'MEDIA_REDIRECT_FORBIDDEN', response.status);
  return response;
}

function assertSupabaseStorageError(response, bytes, phase, expectedErrors) {
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AcceptanceError(phase, 'STORAGE_ERROR_CONTRACT_INVALID', response.status);
  }
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), phase, 'STORAGE_ERROR_CONTRACT_INVALID', response.status);
  const acceptedErrors = Array.isArray(expectedErrors) ? expectedErrors : [expectedErrors];
  invariant(response.status === 400 || response.status === 404, phase, 'STORAGE_ERROR_STATUS_INVALID', response.status);

  const hasCode = Object.hasOwn(payload, 'code');
  const hasError = Object.hasOwn(payload, 'error');
  const hasStatusCode = Object.hasOwn(payload, 'statusCode');
  const bodyStatusValid = !hasStatusCode || payload.statusCode === 404 || payload.statusCode === '404';
  invariant(bodyStatusValid, phase, 'STORAGE_ERROR_BODY_STATUS_INVALID', response.status);
  for (const statusField of ['status', 'httpStatusCode']) {
    if (Object.hasOwn(payload, statusField)) {
      invariant(payload[statusField] === 404 || payload[statusField] === '404', phase, 'STORAGE_ERROR_BODY_STATUS_INVALID', response.status);
    }
  }

  const code = hasCode ? payload.code : payload.error;
  invariant(acceptedErrors.includes(code), phase, 'STORAGE_ERROR_CODE_INVALID', response.status);
  const documentedNew = response.status === 404
    && hasCode
    && typeof payload.message === 'string'
    && (!hasError || payload.error === payload.code);
  const documentedLegacy = response.status === 404
    && hasStatusCode
    && hasError
    && (payload.statusCode === 404 || payload.statusCode === '404')
    && (!hasCode || payload.code === payload.error)
    && (!Object.hasOwn(payload, 'message') || typeof payload.message === 'string');
  const transitionalErrors = {
    NoSuchKey: 'not_found',
    NoSuchBucket: 'Bucket not found',
  };
  const observedTransition = response.status === 400
    && hasStatusCode
    && hasCode
    && hasError
    && (payload.statusCode === 404 || payload.statusCode === '404')
    && payload.error === transitionalErrors[payload.code]
    && typeof payload.message === 'string';
  invariant(documentedNew || documentedLegacy || observedTransition, phase, 'STORAGE_ERROR_CONTRACT_INVALID', response.status);
}

export async function assertPrivateStorageDenied(fetchImpl, url, phase, { allowMissingObject = false } = {}) {
  const response = await externalRequest(fetchImpl, url, phase, { headers: { Accept: '*/*' } });
  const bytes = await boundedBinaryBody(response, phase, 128 * 1024);
  if (response.ok) throw new AcceptanceError(phase, 'PRIVATE_MEDIA_PUBLICLY_READABLE', response.status);
  assertSupabaseStorageError(
    response,
    bytes,
    phase,
    allowMissingObject ? ['NoSuchBucket', 'NoSuchKey'] : 'NoSuchBucket',
  );
  return response.status;
}

async function directSignedUpload(fetchImpl, uploadUrl, bytes, phase) {
  const response = await externalRequest(fetchImpl, uploadUrl, phase, {
    method: 'PUT',
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'image/jpeg',
      'x-upsert': 'false',
    },
    body: bytes,
  });
  await boundedBinaryBody(response, phase, 256 * 1024);
  invariant(response.ok, phase, 'MEDIA_DIRECT_UPLOAD_FAILED', response.status);
}

function privateStorageUrl(storageOrigin, bucket, path) {
  return new URL(`/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, storageOrigin);
}

async function acceptanceImageBytes() {
  const { default: sharp } = await import('sharp');
  return sharp({
    create: { width: 1_200, height: 800, channels: 3, background: '#7f5539' },
  }).jpeg({ quality: 90 }).toBuffer();
}

function validateProcessedMedia(media, mediaId, phase) {
  invariant(media?.id === mediaId && media?.status === 'processed', phase, 'MEDIA_FINALIZE_CONTRACT_FAILED');
  invariant(media.width === 1_200 && media.height === 800, phase, 'MEDIA_ORIGINAL_DIMENSIONS_MISMATCH');
  for (const variant of MEDIA_VARIANTS) {
    const dimensions = media.variants?.[variant];
    invariant(
      Number.isSafeInteger(dimensions?.width)
        && Number.isSafeInteger(dimensions?.height)
        && dimensions.width > 0
        && dimensions.height > 0,
      phase,
      'MEDIA_VARIANT_DIMENSIONS_INVALID',
    );
  }
}

export function validatePublishedMediaEntry(entry, {
  expectedSupabaseProjectRef,
  expectedMediaId,
  expectedVariant,
  expectedVersionId = '',
  seenUrls,
  phase = 'media.public',
} = {}) {
  invariant(entry?.contentType === 'image/webp', phase, 'PUBLIC_MEDIA_MANIFEST_TYPE_MISMATCH');
  const rawUrl = String(entry?.url || '');
  invariant(rawUrl === rawUrl.trim(), phase, 'PUBLIC_MEDIA_URL_INVALID');
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AcceptanceError(phase, 'PUBLIC_MEDIA_URL_INVALID');
  }
  const expectedProviderHost = `${expectedSupabaseProjectRef}.supabase.co`;
  const rawAuthority = /^https:\/\/([^/?#]+)/i.exec(rawUrl)?.[1] || '';
  invariant(
    url.protocol === 'https:'
      && url.hostname === expectedProviderHost
      && rawAuthority.toLowerCase() === expectedProviderHost
      && !url.username
      && !url.password
      && !url.port,
    phase,
    'PUBLIC_MEDIA_PROVIDER_MISMATCH',
  );
  invariant(!rawUrl.includes('?') && !rawUrl.includes('#') && !url.search && !url.hash, phase, 'PUBLIC_MEDIA_URL_INVALID');

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    throw new AcceptanceError(phase, 'PUBLIC_MEDIA_PATH_INVALID');
  }
  const prefix = '/storage/v1/object/public/mesto-media-public/assets/';
  invariant(decodedPath.startsWith(prefix), phase, 'PUBLIC_MEDIA_BUCKET_MISMATCH');
  const pathParts = decodedPath.slice(prefix.length).split('/');
  invariant(pathParts.length === 3, phase, 'PUBLIC_MEDIA_PATH_INVALID');
  const pathMediaId = requireUuid(pathParts[0], phase, 'PUBLIC_MEDIA_PATH_INVALID');
  const versionId = requireUuid(pathParts[1], phase, 'PUBLIC_MEDIA_PATH_INVALID');
  const variantMatch = /^(thumb|card|hero)\.webp$/.exec(pathParts[2]);
  invariant(variantMatch, phase, 'PUBLIC_MEDIA_PATH_INVALID');
  const pathVariant = variantMatch[1];
  invariant(pathMediaId === requireUuid(expectedMediaId, phase, 'PUBLIC_MEDIA_ID_MISMATCH'), phase, 'PUBLIC_MEDIA_ID_MISMATCH');
  invariant(MEDIA_VARIANTS.includes(expectedVariant), phase, 'PUBLIC_MEDIA_VARIANT_MISMATCH');
  invariant(pathVariant === expectedVariant, phase, 'PUBLIC_MEDIA_VARIANT_MISMATCH');
  if (expectedVersionId) {
    invariant(
      versionId === requireUuid(expectedVersionId, phase, 'PUBLIC_MEDIA_VERSION_MISMATCH'),
      phase,
      'PUBLIC_MEDIA_VERSION_MISMATCH',
    );
  }
  invariant(seenUrls instanceof Set, phase, 'PUBLIC_MEDIA_URL_SET_INVALID');
  invariant(!seenUrls.has(url.href), phase, 'PUBLIC_MEDIA_URL_DUPLICATE');
  seenUrls.add(url.href);
  return { url, versionId };
}

export function validateImmutableMediaCacheControl(value, phase = 'media.public') {
  const raw = String(value || '');
  const parts = raw.split(',').map((part) => part.trim());
  invariant(parts.length === 3 && parts.every(Boolean), phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
  const directives = new Map();
  for (const part of parts) {
    const match = /^([a-z][a-z0-9-]*)(?:\s*=\s*([0-9]+))?$/i.exec(part);
    invariant(match, phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
    const name = match[1].toLowerCase();
    invariant(['public', 'immutable', 'max-age'].includes(name), phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
    invariant(!directives.has(name), phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
    const directiveValue = match[2];
    if (name === 'max-age') {
      invariant(directiveValue === '31536000', phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
    } else {
      invariant(directiveValue === undefined, phase, 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH');
    }
    directives.set(name, directiveValue ?? true);
  }
  invariant(
    directives.has('public') && directives.has('immutable') && directives.get('max-age') === '31536000',
    phase,
    'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH',
  );
  return true;
}

export function validatePublishedMediaHeaders(headers, phase = 'media.public') {
  invariant(headers && typeof headers.get === 'function', phase, 'PUBLIC_MEDIA_HEADERS_INVALID');
  const mediaType = String(headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  invariant(mediaType === 'image/webp', phase, 'PUBLIC_MEDIA_TYPE_MISMATCH');
  validateImmutableMediaCacheControl(headers.get('cache-control'), phase);
  return { mediaType, cacheControl: String(headers.get('cache-control') || '') };
}

async function inspectPublishedMedia(fetchImpl, entry, expectations, phase) {
  const validated = validatePublishedMediaEntry(entry, { ...expectations, phase });
  const { url } = validated;
  const response = await externalRequest(fetchImpl, url, phase, { headers: { Accept: 'image/webp' } });
  invariant(response.status === 200, phase, 'PUBLIC_MEDIA_UNAVAILABLE', response.status);
  validatePublishedMediaHeaders(response.headers, phase);
  const bytes = await boundedBinaryBody(response, phase);
  invariant(bytes.length > 0 && bytes.length === Number(entry.bytes), phase, 'PUBLIC_MEDIA_SIZE_MISMATCH');
  const { default: sharp } = await import('sharp');
  const metadata = await sharp(bytes).metadata();
  invariant(
    metadata.format === 'webp'
      && metadata.width === Number(entry.width)
      && metadata.height === Number(entry.height),
    phase,
    'PUBLIC_MEDIA_DIMENSIONS_MISMATCH',
  );
  return { href: url.href, versionId: validated.versionId };
}

export async function waitForPublishedMediaDeletion(fetchImpl, urls, phase, attempts = 13, {
  now = Date.now,
  sleep = sleepMilliseconds,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let remaining = 0;
    for (const value of urls) {
      let exactUrl;
      try {
        exactUrl = new URL(String(value || ''));
      } catch {
        throw new AcceptanceError(phase, 'PUBLIC_MEDIA_URL_INVALID');
      }
      invariant(!exactUrl.search && !exactUrl.hash, phase, 'PUBLIC_MEDIA_URL_INVALID');
      const nonceUrl = new URL(exactUrl.href);
      nonceUrl.searchParams.set('mestoCleanupProbe', `${clockMilliseconds(now, phase)}-${attempt}`);
      let objectStillReachable = false;
      for (const probeUrl of [exactUrl, nonceUrl]) {
        const response = await externalRequest(fetchImpl, probeUrl, phase, {
          headers: { Accept: 'image/webp', 'Cache-Control': 'no-cache' },
        });
        const bytes = await boundedBinaryBody(response, phase);
        if (response.ok) {
          objectStillReachable = true;
        } else {
          assertSupabaseStorageError(response, bytes, phase, 'NoSuchKey');
        }
      }
      if (objectStillReachable) remaining += 1;
    }
    if (remaining === 0) return true;
    if (attempt + 1 < attempts) await sleep(5_000);
  }
  throw new AcceptanceError(phase, 'PUBLIC_MEDIA_CLEANUP_NOT_PROPAGATED');
}

class PreviewClient {
  constructor({ baseUrl, bypassSecret = '', fetchImpl = globalThis.fetch, jar = new CookieJar() }) {
    this.baseUrl = baseUrl;
    this.bypassSecret = bypassSecret;
    this.fetchImpl = fetchImpl;
    this.jar = jar;
  }

  async request({ phase, path, method = 'GET', body, expected = [200], responseType = 'json' }) {
    const upperMethod = String(method).toUpperCase();
    invariant(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'), phase, 'INVALID_REQUEST_PATH');
    const url = new URL(path, this.baseUrl);
    invariant(url.origin === this.baseUrl, phase, 'CROSS_ORIGIN_REQUEST_FORBIDDEN');

    const headers = {
      Accept: responseType === 'text' ? 'text/html,application/xhtml+xml' : 'application/json',
      'User-Agent': 'mesto-preview-acceptance/1',
      ...(this.bypassSecret ? { 'x-vercel-protection-bypass': this.bypassSecret } : {}),
    };
    const cookie = this.jar.header();
    if (cookie) headers.Cookie = cookie;
    if (MUTATION_METHODS.has(upperMethod)) {
      headers.Origin = this.baseUrl;
      headers['Sec-Fetch-Site'] = 'same-origin';
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await this.fetchImpl(url, {
        method: upperMethod,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AcceptanceError(
        phase,
        MUTATION_METHODS.has(upperMethod) ? 'AMBIGUOUS_MUTATION_TRANSPORT_FAILURE' : 'TRANSPORT_FAILURE',
      );
    }
    this.jar.absorb(response.headers);
    invariant(response.status < 300 || response.status >= 400, phase, 'REDIRECT_FORBIDDEN', response.status);
    let text;
    try {
      text = await boundedResponseBody(response, phase);
    } catch (error) {
      if (MUTATION_METHODS.has(upperMethod) && response.ok) {
        throw new AcceptanceError(phase, 'AMBIGUOUS_MUTATION_RESPONSE_FAILURE', response.status);
      }
      throw error;
    }
    if (!expected.includes(response.status)) {
      throw new AcceptanceError(
        phase,
        MUTATION_METHODS.has(upperMethod) && response.ok
          ? 'AMBIGUOUS_MUTATION_RESPONSE_FAILURE'
          : 'UNEXPECTED_HTTP_STATUS',
        response.status,
      );
    }

    let data = null;
    if (responseType === 'json' && text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new AcceptanceError(
          phase,
          MUTATION_METHODS.has(upperMethod) && response.ok
            ? 'AMBIGUOUS_MUTATION_RESPONSE_FAILURE'
            : 'INVALID_JSON_RESPONSE',
          response.status,
        );
      }
    } else if (responseType === 'text') {
      data = text;
    }
    return {
      status: response.status,
      data,
      cache: cacheState(response.headers),
      explicitCache: explicitCacheState(response.headers),
      etag: String(response.headers.get('etag') || '').trim().slice(0, 256),
      bodyDigest: createHash('sha256').update(text).digest('base64url'),
      cachePop: cachePop(response.headers),
      noStore: exactPrivateNoStore(response.headers),
    };
  }
}

function exactObjectKeys(value, expected) {
  return value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function exactPrivateNoStore(headers) {
  const directives = String(headers.get('cache-control') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const expected = new Set(['private', 'no-store', 'max-age=0']);
  return directives.length === expected.size
    && new Set(directives).size === expected.size
    && directives.every((directive) => expected.has(directive));
}

async function readExactMediaReaperJson(response, phase) {
  invariant(response.status < 300 || response.status >= 400, phase, 'MEDIA_REAPER_REDIRECT_FORBIDDEN', response.status);
  invariant(exactPrivateNoStore(response.headers), phase, 'MEDIA_REAPER_NO_STORE_REQUIRED', response.status);
  invariant(
    String(response.headers.get('content-type') || '').toLowerCase().split(';', 1)[0].trim() === 'application/json',
    phase,
    'MEDIA_REAPER_CONTENT_TYPE_INVALID',
    response.status,
  );
  const body = await boundedResponseBody(response, phase, MAX_MEDIA_REAPER_RESPONSE_BYTES);
  try {
    const parsed = JSON.parse(body);
    invariant(parsed && typeof parsed === 'object' && !Array.isArray(parsed), phase, 'MEDIA_REAPER_JSON_INVALID', response.status);
    return parsed;
  } catch (error) {
    if (error instanceof AcceptanceError) throw error;
    throw new AcceptanceError(phase, 'MEDIA_REAPER_JSON_INVALID', response.status);
  }
}

export async function readOwnedMediaStatus(customer, mediaId, phase = 'media.status') {
  const id = requireUuid(mediaId, phase, 'MEDIA_ID_INVALID');
  invariant(customer && typeof customer.request === 'function', phase, 'MEDIA_STATUS_CLIENT_INVALID');
  const response = await customer.request({
    phase,
    path: `${PREVIEW_API.uploadStatus}?mediaId=${encodeURIComponent(id)}`,
    expected: [200],
  });
  invariant(response.noStore === true, phase, 'MEDIA_STATUS_NO_STORE_REQUIRED', response.status);
  invariant(
    exactObjectKeys(response.data, ['exists', 'mediaId'])
      && response.data.mediaId === id
      && typeof response.data.exists === 'boolean',
    phase,
    'MEDIA_STATUS_CONTRACT_INVALID',
    response.status,
  );
  return Object.freeze({ mediaId: id, exists: response.data.exists });
}

export async function provePreviewMediaReaper({
  baseUrl,
  bypassSecret = '',
  cronSecret,
  fetchImpl = fetch,
  providerIdentity,
}) {
  const phase = 'media-reaper.proof';
  const secret = validateAcceptanceCronSecret(cronSecret);
  const target = normalizedOrigin(baseUrl, phase);
  const hostname = new URL(target).hostname;
  invariant(
    providerIdentity
      && typeof providerIdentity === 'object'
      && providerIdentity.environment === 'preview'
      && providerIdentity.deploymentHost === hostname
      && /^[A-Za-z0-9_-]{43}$/.test(String(providerIdentity.fingerprint || '')),
    phase,
    'MEDIA_REAPER_PROVIDER_FINGERPRINT_REQUIRED',
  );
  invariant(typeof fetchImpl === 'function', phase, 'MEDIA_REAPER_FETCH_INVALID');

  const request = async ({ authenticated, expectedStatus, requestPhase }) => {
    let response;
    try {
      response = await fetchImpl(new URL(PREVIEW_API.mediaReaper, target), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
          ...(authenticated ? { Authorization: `Bearer ${secret}` } : {}),
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(MEDIA_REAPER_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AcceptanceError(requestPhase, 'MEDIA_REAPER_TRANSPORT_FAILURE');
    }
    if (response.status !== expectedStatus) {
      await response.body?.cancel().catch(() => {});
      throw new AcceptanceError(requestPhase, 'MEDIA_REAPER_STATUS_INVALID', response.status);
    }
    invariant(response.headers.get('vary') === 'Authorization', requestPhase, 'MEDIA_REAPER_VARY_INVALID', response.status);
    invariant(response.headers.get('x-robots-tag') === 'noindex', requestPhase, 'MEDIA_REAPER_ROBOTS_INVALID', response.status);
    if (!authenticated) {
      invariant(
        response.headers.get('www-authenticate') === 'Bearer',
        requestPhase,
        'MEDIA_REAPER_AUTH_CHALLENGE_INVALID',
        response.status,
      );
    }
    return readExactMediaReaperJson(response, requestPhase);
  };

  const unauthorized = await request({
    authenticated: false,
    expectedStatus: 401,
    requestPhase: 'media-reaper.unauthorized',
  });
  invariant(
    exactObjectKeys(unauthorized, ['code', 'ok'])
      && unauthorized.ok === false
      && unauthorized.code === 'MEDIA_REAPER_UNAUTHORIZED',
    'media-reaper.unauthorized',
    'MEDIA_REAPER_UNAUTHORIZED_CONTRACT_INVALID',
    401,
  );

  const summary = await request({
    authenticated: true,
    expectedStatus: 200,
    requestPhase: 'media-reaper.authenticated',
  });
  invariant(
    exactObjectKeys(summary, MEDIA_REAPER_SUMMARY_KEYS)
      && summary.ok === true
      && Array.isArray(summary.failures)
      && summary.failures.length === 0
      && typeof summary.drained === 'boolean'
      && exactObjectKeys(summary.counts, MEDIA_REAPER_PHASE_KEYS)
      && exactObjectKeys(summary.hasMore, MEDIA_REAPER_PHASE_KEYS),
    'media-reaper.authenticated',
    'MEDIA_REAPER_SUMMARY_INVALID',
    200,
  );
  invariant(
    MEDIA_REAPER_PHASE_KEYS.every((key) => Number.isSafeInteger(summary.counts[key]) && summary.counts[key] >= 0)
      && MEDIA_REAPER_PHASE_KEYS.every((key) => typeof summary.hasMore[key] === 'boolean'),
    'media-reaper.authenticated',
    'MEDIA_REAPER_SUMMARY_INVALID',
    200,
  );
  invariant(
    summary.drained === true && MEDIA_REAPER_PHASE_KEYS.every((key) => summary.hasMore[key] === false),
    'media-reaper.authenticated',
    'MEDIA_REAPER_BACKLOG_REMAINS',
    200,
  );
  invariant(
    MEDIA_REAPER_PHASE_KEYS.every((key) => summary.counts[key] === MEDIA_REAPER_EXPECTED_COUNTS[key]),
    'media-reaper.authenticated',
    'MEDIA_REAPER_ISOLATED_COUNTS_INVALID',
    200,
  );

  return Object.freeze({
    evidenceName: 'preview-media-reaper-handler-auth-provider-reachability-not-production-schedule-proof',
    unauthenticatedStatus: 401,
    authenticatedStatus: 200,
    noStore: true,
    drained: summary.drained,
    counts: Object.freeze({ ...summary.counts }),
    hasMore: Object.freeze({ ...summary.hasMore }),
    failures: Object.freeze([]),
    productionScheduleProven: false,
  });
}

function addCheck(report, segment, name, evidence = {}) {
  let selected = report.segments.find((item) => item.name === segment);
  if (!selected) {
    selected = { name: segment, checks: [] };
    report.segments.push(selected);
  }
  selected.checks.push({ name, passed: true, ...evidence });
}

async function prepareAbandonedMediaReaperProbe({
  customer,
  expectedSupabaseProjectRef,
  fetchImpl,
  image,
  now,
  runId,
  state,
}) {
  const phase = 'media.reaper-probe.sign';
  armMutationIntent(state, phase);
  const signed = await customer.request({
    phase,
    method: 'POST',
    path: PREVIEW_API.uploadSign,
    body: { name: `acceptance-reaper-${runId}.jpg`, type: 'image/jpeg', size: image.length },
    expected: [201],
  });
  const receipt = registerSignedUploadReceipt(state, signed.data, {
    customerId: state.customerId,
    expectedSupabaseProjectRef,
    mediaIdsField: 'abandonedMediaIds',
    observedAtMs: clockMilliseconds(now, phase),
    phase,
  });
  state.abandonedMediaId = receipt.mediaId;
  await directSignedUpload(fetchImpl, receipt.uploadUrl, image, 'media.reaper-probe.direct-upload');
  const before = await readOwnedMediaStatus(customer, receipt.mediaId, 'media.reaper-probe.exists-before');
  invariant(before.exists === true, 'media.reaper-probe.exists-before', 'MEDIA_REAPER_PROBE_NOT_PERSISTED');
  state.abandonedMediaExistenceProven = true;
  acknowledgeMutationIntent(state, phase);
  return { mediaId: receipt.mediaId };
}

export async function prepareMediaSubmission({
  admin,
  customer,
  fetchImpl,
  expectedSupabaseProjectRef,
  identity,
  now,
  runId,
  state,
}) {
  const image = await acceptanceImageBytes();
  armMutationIntent(state, 'media.sign');
  const signed = await customer.request({
    phase: 'media.sign',
    method: 'POST',
    path: PREVIEW_API.uploadSign,
    body: { name: `acceptance-${runId}.jpg`, type: 'image/jpeg', size: image.length },
    expected: [201],
  });
  const receipt = registerSignedUploadReceipt(state, signed.data, {
    customerId: state.customerId,
    expectedSupabaseProjectRef,
    observedAtMs: clockMilliseconds(now, 'media.sign'),
    phase: 'media.sign',
  });
  acknowledgeMutationIntent(state, 'media.sign');

  const stagingPath = `${state.customerId}/${receipt.mediaId}/source.jpg`;
  await assertPrivateStorageDenied(
    fetchImpl,
    privateStorageUrl(receipt.storageOrigin, 'mesto-media-staging', stagingPath),
    'media.staging-private-before-upload',
    { allowMissingObject: true },
  );
  await directSignedUpload(fetchImpl, receipt.uploadUrl, image, 'media.direct-upload');
  await assertPrivateStorageDenied(
    fetchImpl,
    privateStorageUrl(receipt.storageOrigin, 'mesto-media-staging', stagingPath),
    'media.staging-private-after-upload',
  );

  await prepareAbandonedMediaReaperProbe({
    customer,
    expectedSupabaseProjectRef,
    fetchImpl,
    image,
    now,
    runId,
    state,
  });

  armMutationIntent(state, 'media.finalize');
  const finalized = await customer.request({
    phase: 'media.finalize',
    method: 'POST',
    path: PREVIEW_API.uploadFinalize,
    body: { mediaId: receipt.mediaId },
  });
  validateProcessedMedia(finalized.data?.media, receipt.mediaId, 'media.finalize');
  acknowledgeMutationIntent(state, 'media.finalize');
  for (const variant of MEDIA_VARIANTS) {
    const reviewPath = `${state.customerId}/${receipt.mediaId}/v1/${variant}.webp`;
    await assertPrivateStorageDenied(
      fetchImpl,
      privateStorageUrl(receipt.storageOrigin, 'mesto-media-review', reviewPath),
      `media.review-private-${variant}`,
    );
  }

  armMutationIntent(state, 'customer.submission');
  const submission = await customer.request({
    phase: 'customer.submission',
    method: 'POST',
    path: PREVIEW_API.submissions,
    body: {
      contactEmail: identity.customer.email,
      title: expectedSubmissionTitle(runId),
      city: 'Simferopol',
      category: 'Acceptance',
      description: expectedSubmissionDescription(runId),
      mediaIds: [receipt.mediaId],
    },
    expected: [201],
  });
  const submissionCandidateId = retainMutationCandidate(
    state,
    'submissionCandidateId',
    submission.data?.submission?.id,
    'customer.submission',
    'SUBMISSION_ID_INVALID',
  );
  invariant(submission.data?.submission?.status === 'pending', 'customer.submission', 'SUBMISSION_NOT_PENDING');
  const authoritative = await admin.request({
    phase: 'customer.submission.authoritative',
    path: PREVIEW_API.adminDashboard,
  });
  confirmAuthoritativeSubmission(state, authoritative.data?.submissions, submissionCandidateId, {
    runId,
    customerId: state.customerId,
    phase: 'customer.submission.authoritative',
  });
  acknowledgeMutationIntent(state, 'customer.submission');
  return { mediaId: receipt.mediaId, submission };
}

async function approveMediaSubmission({
  admin,
  expectedSupabaseProjectRef,
  fetchImpl,
  runId,
  state,
}) {
  armMutationIntent(state, 'media.approve-submission');
  const approved = await admin.request({
    phase: 'media.approve-submission',
    method: 'PATCH',
    path: PREVIEW_API.adminSubmissions,
    body: {
      id: state.submissionId,
      decision: 'approved',
      note: 'Isolated Preview media acceptance',
    },
  });
  const approvedVenueCandidateId = retainMutationCandidate(
    state,
    'venueCandidateIds',
    approved.data?.result?.venue_id,
    'media.approve-submission',
    'APPROVED_VENUE_ID_INVALID',
    { collection: true },
  );
  invariant(Array.isArray(approved.data?.media) && approved.data.media.length === state.mediaIds.length, 'media.approve-submission', 'PUBLIC_MEDIA_MANIFEST_MISSING');
  const publicUrls = [];
  const seenUrls = new Set();
  for (const asset of approved.data.media) {
    invariant(state.mediaIds.includes(asset?.id), 'media.approve-submission', 'PUBLIC_MEDIA_ID_MISMATCH');
    let expectedVersionId = '';
    const assetUrlCountBefore = seenUrls.size;
    for (const variant of MEDIA_VARIANTS) {
      const inspected = await inspectPublishedMedia(
        fetchImpl,
        asset?.[variant],
        {
          expectedSupabaseProjectRef,
          expectedMediaId: asset.id,
          expectedVariant: variant,
          expectedVersionId,
          seenUrls,
        },
        `media.public-${variant}`,
      );
      if (!expectedVersionId) expectedVersionId = inspected.versionId;
      publicUrls.push(inspected.href);
    }
    invariant(
      seenUrls.size === assetUrlCountBefore + MEDIA_VARIANTS.length,
      'media.approve-submission',
      'PUBLIC_MEDIA_URL_SET_INVALID',
    );
  }
  state.publicMediaUrls = publicUrls;
  const [dashboard, venueList] = await Promise.all([
    admin.request({
      phase: 'media.approve-submission.authoritative-submission',
      path: PREVIEW_API.adminDashboard,
    }),
    admin.request({
      phase: 'media.approve-submission.authoritative-venue',
      path: PREVIEW_API.adminVenues,
    }),
  ]);
  const { venueId: approvedVenueId } = confirmAuthoritativeApprovedVenue(
    state,
    { submissions: dashboard.data?.submissions, venues: venueList.data?.venues },
    approvedVenueCandidateId,
    {
      runId,
      customerId: state.customerId,
      phase: 'media.approve-submission.authoritative',
    },
  );
  acknowledgeMutationIntent(state, 'media.approve-submission');
  return { approvedVenueId, assets: approved.data.media.length, variants: publicUrls.length };
}

function venueDraft(runId, label) {
  const lowerLabel = label.toLowerCase();
  return {
    slug: `acceptance-${runId}-${lowerLabel}`,
    title: `Acceptance Venue ${label} ${runId}`,
    city: 'Simferopol',
    category: 'Acceptance',
    cuisine: '',
    description: `Disposable provider-backed acceptance venue ${label}.`,
    address: '',
    phone: '',
    website: '',
    hours: '',
    averageCheck: '',
    features: ['Disposable acceptance data'],
    photos: [],
    source: 'editorial',
    status: 'published',
  };
}

function expectedReviewBody(runId) {
  return `Disposable acceptance review for run ${runId}; it is long enough for validation.`;
}

function expectedSubmissionTitle(runId) {
  return `Acceptance Submission ${runId}`;
}

function expectedSubmissionDescription(runId) {
  return `Disposable venue submission for provider-backed acceptance run ${runId}.`;
}

function storedXssProbeInput(runId) {
  return `\"><img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1>`;
}

function expectedStoredXssPersistedTitle(runId) {
  return `\" img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1`;
}

function expectedStoredXssDescription(runId, kind) {
  return `Stored-XSS ${kind} probe ${runId}`;
}

function expectedApprovedVenueSlug(runId, submissionId) {
  return `${expectedSubmissionTitle(runId).toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, '-')
    .replace(/^-|-$/g, '')}-${String(submissionId).slice(0, 8)}`;
}

function venueMatchesDraft(venue, draft, expectedId = '') {
  return (!expectedId || venue?.id === expectedId)
    && venue?.slug === draft.slug
    && venue?.title === draft.title;
}

function approvedVenueMatches(venue, { id, submissionId, runId, customerId }) {
  return venue?.id === id
    && venue?.slug === expectedApprovedVenueSlug(runId, submissionId)
    && venue?.title === expectedSubmissionTitle(runId)
    && venue?.description === expectedSubmissionDescription(runId)
    && venue?.source === 'community'
    && venue?.status === 'published'
    && venue?.created_by === customerId;
}

function reviewMatchesRun(review, { id = '', runId, customerId, statuses = ['pending'] }) {
  return (!id || review?.id === id)
    && review?.body === expectedReviewBody(runId)
    && review?.submitted_by === customerId
    && statuses.includes(review?.status);
}

function submissionMatchesRun(submission, {
  id = '', runId, customerId, statuses = ['pending', 'approved'],
}) {
  return (!id || submission?.id === id)
    && submission?.title === expectedSubmissionTitle(runId)
    && submission?.description === expectedSubmissionDescription(runId)
    && submission?.submitted_by === customerId
    && statuses.includes(submission?.status);
}

function merchantMatchesRun(merchant, { id = '', identity }) {
  return (!id || (merchant?.id || merchant?.user_id) === id)
    && merchant?.username === identity?.username
    && merchant?.email === identity?.email
    && merchant?.role === 'merchant';
}

function merchantContentMatchesRun(item, { id = '', kind, runId, venueId }) {
  return (!id || item?.id === id)
    && item?.title === expectedStoredXssPersistedTitle(runId)
    && item?.description === expectedStoredXssDescription(runId, kind)
    && item?.venue_id === venueId;
}

function exactAuthoritativeMatch(rows, predicate, phase, code) {
  invariant(Array.isArray(rows), phase, code);
  const matches = rows.filter(predicate);
  invariant(matches.length === 1, phase, code);
  return matches[0];
}

export function retainMutationCandidate(
  state,
  field,
  value,
  phase,
  code,
  { collection = false } = {},
) {
  const id = requireUuid(value, phase, code);
  if (collection) {
    if (!Array.isArray(state[field])) state[field] = [];
    if (!state[field].includes(id)) state[field].push(id);
  } else {
    state[field] = id;
  }
  return id;
}

export function registerCreatedVenue(state, venue, draft, phase, { authoritative = false } = {}) {
  const venueId = retainMutationCandidate(
    state,
    'venueCandidateIds',
    venue?.id,
    phase,
    'VENUE_ID_INVALID',
    { collection: true },
  );
  invariant(venue && typeof venue === 'object', phase, 'VENUE_CREATE_CONTRACT_FAILED');
  const registered = { ...venue, id: venueId };
  invariant(venueMatchesDraft(registered, draft), phase, 'VENUE_CREATE_CONTRACT_FAILED');
  if (!Array.isArray(state.venueIds)) state.venueIds = [];
  if (authoritative && !state.venueIds.includes(venueId)) state.venueIds.push(venueId);
  return registered;
}

export function confirmAuthoritativeVenue(state, rows, candidateId, draft, phase) {
  const id = requireUuid(candidateId, phase, 'VENUE_ID_INVALID');
  const venue = exactAuthoritativeMatch(
    rows,
    (item) => venueMatchesDraft(item, draft, id),
    phase,
    'VENUE_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  return registerCreatedVenue(state, venue, draft, phase, { authoritative: true });
}

export function confirmAuthoritativeRegistration(state, session, candidateId, identity, phase) {
  const id = requireUuid(candidateId, phase, 'CUSTOMER_ID_INVALID');
  const user = session?.data?.user;
  const authoritativeId = requireUuid(user?.id, phase, 'CUSTOMER_ID_INVALID');
  invariant(
    session?.data?.authenticated === true
      && authoritativeId === id
      && user?.username === identity?.username
      && user?.email === identity?.email,
    phase,
    'CUSTOMER_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  state.customerId = authoritativeId;
  state.customerSessionActive = true;
  return user;
}

export function confirmAuthoritativeReview(state, rows, candidateId, { runId, customerId, phase }) {
  const id = requireUuid(candidateId, phase, 'REVIEW_ID_INVALID');
  const review = exactAuthoritativeMatch(
    rows,
    (item) => reviewMatchesRun(item, { id, runId, customerId, statuses: ['pending'] }),
    phase,
    'REVIEW_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  state.reviewId = requireUuid(review.id, phase, 'REVIEW_ID_INVALID');
  return review;
}

export function confirmAuthoritativeSubmission(state, rows, candidateId, {
  runId,
  customerId,
  phase,
  statuses = ['pending'],
}) {
  const id = requireUuid(candidateId, phase, 'SUBMISSION_ID_INVALID');
  const submission = exactAuthoritativeMatch(
    rows,
    (item) => submissionMatchesRun(item, { id, runId, customerId, statuses }),
    phase,
    'SUBMISSION_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  state.submissionId = requireUuid(submission.id, phase, 'SUBMISSION_ID_INVALID');
  state.mediaAttached = true;
  return submission;
}

export function confirmAuthoritativeMerchant(state, rows, candidateId, identity, phase) {
  const id = requireUuid(candidateId, phase, 'MERCHANT_ID_INVALID');
  const merchant = exactAuthoritativeMatch(
    rows,
    (item) => merchantMatchesRun(item, { id, identity }),
    phase,
    'MERCHANT_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  state.merchantId = requireUuid(merchant.id || merchant.user_id, phase, 'MERCHANT_ID_INVALID');
  return merchant;
}

export function confirmAuthoritativeMerchantContent(state, rows, candidateId, {
  kind,
  runId,
  venueId,
  phase,
}) {
  const isMenu = kind === 'menu';
  invariant(isMenu || kind === 'promotion', phase, 'MERCHANT_CONTENT_KIND_INVALID');
  const id = requireUuid(candidateId, phase, isMenu ? 'MENU_ID_INVALID' : 'PROMOTION_ID_INVALID');
  const item = exactAuthoritativeMatch(
    rows,
    (entry) => merchantContentMatchesRun(entry, { id, kind, runId, venueId }),
    phase,
    isMenu
      ? 'MENU_AUTHORITATIVE_IDENTITY_MISMATCH'
      : 'PROMOTION_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  const destination = isMenu ? state.menuItemIds : state.promotionIds;
  invariant(Array.isArray(destination), phase, 'AUTHORITATIVE_ID_STATE_INVALID');
  if (!destination.includes(id)) destination.push(id);
  return item;
}

function confirmAuthoritativeApprovedVenue(state, { submissions, venues }, candidateId, {
  runId,
  customerId,
  phase,
}) {
  const venueId = requireUuid(candidateId, phase, 'APPROVED_VENUE_ID_INVALID');
  const submission = exactAuthoritativeMatch(
    submissions,
    (item) => submissionMatchesRun(item, {
      id: state.submissionId,
      runId,
      customerId,
      statuses: ['approved'],
    }) && item?.approved_venue_id === venueId,
    phase,
    'APPROVED_SUBMISSION_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  exactAuthoritativeMatch(
    venues,
    (venue) => approvedVenueMatches(venue, {
      id: venueId,
      submissionId: submission.id,
      runId,
      customerId,
    }),
    phase,
    'APPROVED_VENUE_AUTHORITATIVE_IDENTITY_MISMATCH',
  );
  state.submissionApproved = true;
  state.approvedVenueId = venueId;
  if (!Array.isArray(state.venueIds)) state.venueIds = [];
  if (!state.venueIds.includes(venueId)) state.venueIds.push(venueId);
  return { submission, venueId };
}

function armMutationIntent(state, phase) {
  invariant(!state.mutationIntent, phase, 'MUTATION_INTENT_ALREADY_ACTIVE');
  state.mutationIntent = { phase };
}

function acknowledgeMutationIntent(state, phase) {
  invariant(state.mutationIntent?.phase === phase, phase, 'MUTATION_INTENT_MISMATCH');
  state.mutationIntent = null;
}

export function validateVenueDeleteReceipt(receipt, phase) {
  invariant(receipt?.status === 200, phase, 'VENUE_DELETE_STATUS_INVALID', receipt?.status);
  const payload = receipt?.data;
  invariant(
    payload && typeof payload === 'object' && !Array.isArray(payload) && payload.ok === true,
    phase,
    'VENUE_DELETE_CONTRACT_FAILED',
    receipt.status,
  );
  invariant(
    !Object.hasOwn(payload, 'mediaCleanupPending') || typeof payload.mediaCleanupPending === 'boolean',
    phase,
    'VENUE_DELETE_CONTRACT_FAILED',
    receipt.status,
  );
  invariant(payload.mediaCleanupPending !== true, phase, 'VENUE_MEDIA_CLEANUP_PENDING', receipt.status);
  return payload;
}

export function validateSubmissionRejectionReceipt(receipt, phase) {
  invariant(receipt?.status === 200, phase, 'SUBMISSION_REJECT_STATUS_INVALID', receipt?.status);
  const payload = receipt?.data;
  invariant(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    phase,
    'SUBMISSION_REJECT_CONTRACT_FAILED',
    receipt.status,
  );
  invariant(
    Object.hasOwn(payload, 'mediaCleanupPending') && payload.mediaCleanupPending === false,
    phase,
    payload.mediaCleanupPending === true
      ? 'SUBMISSION_MEDIA_CLEANUP_PENDING'
      : 'SUBMISSION_REJECT_CONTRACT_FAILED',
    receipt.status,
  );
  return payload;
}

export async function warmEntityCache(client, path, phase) {
  let lastState = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await client.request({ phase, path });
    lastState = response.explicitCache || response.cache;
    if (response.explicitCache === 'HIT') {
      invariant(response.etag, phase, 'CACHE_ENTITY_TAG_MISSING');
      invariant(response.bodyDigest, phase, 'CACHE_BODY_DIGEST_MISSING');
      invariant(response.cachePop, phase, 'CACHE_POP_MISSING');
      return {
        attempts: attempt + 1,
        state: response.explicitCache,
        etag: response.etag,
        bodyDigest: response.bodyDigest,
        cachePop: response.cachePop,
        warmedAt: Date.now(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new AcceptanceError(phase, 'CACHE_DID_NOT_WARM');
}

export async function observeEntityInvalidation(client, {
  path,
  expectedItemId,
  phase,
  baselineEtag,
  baselineBodyDigest,
  baselineCachePop,
  baselineWarmedAt,
  attempts = 24,
  wait = 500,
  now = Date.now,
}) {
  const startedAt = now();
  invariant(typeof baselineEtag === 'string' && baselineEtag, phase, 'CACHE_BASELINE_ENTITY_TAG_MISSING');
  invariant(typeof baselineBodyDigest === 'string' && baselineBodyDigest,
    phase, 'CACHE_BASELINE_BODY_DIGEST_MISSING');
  invariant(typeof baselineCachePop === 'string' && baselineCachePop,
    phase, 'CACHE_BASELINE_POP_MISSING');
  invariant(Number.isFinite(baselineWarmedAt)
    && baselineWarmedAt <= startedAt
    && startedAt - baselineWarmedAt < CACHE_INVALIDATION_BASELINE_MAX_AGE_MS,
  phase, 'CACHE_INVALIDATION_BASELINE_EXPIRED');
  let requests = 0;
  let observedStale = false;
  let freshResponse = null;
  const allowedStates = new Set(['HIT', 'STALE']);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    invariant(now() - baselineWarmedAt < CACHE_INVALIDATION_BASELINE_MAX_AGE_MS,
      phase, 'CACHE_INVALIDATION_BASELINE_EXPIRED');
    const response = await client.request({ phase, path });
    requests += 1;
    invariant(now() - baselineWarmedAt < CACHE_INVALIDATION_BASELINE_MAX_AGE_MS,
      phase, 'CACHE_INVALIDATION_BASELINE_EXPIRED');
    const observedFresh = Array.isArray(response.data?.menu)
      && response.data.menu.some((item) => item?.id === expectedItemId);
    invariant(response.explicitCache, phase, 'CACHE_STATE_NOT_EXPLICIT');
    invariant(response.cachePop === baselineCachePop, phase, 'CACHE_POP_CHANGED');
    invariant(allowedStates.has(response.explicitCache), phase, 'CACHE_INVALIDATION_STATE_INCONCLUSIVE');
    if (response.explicitCache === 'STALE') {
      observedStale = true;
      if (observedFresh) {
        invariant(response.etag && response.etag !== baselineEtag,
          phase, 'CACHE_STALE_FRESH_ENTITY_NOT_CHANGED');
        invariant(response.bodyDigest && response.bodyDigest !== baselineBodyDigest,
          phase, 'CACHE_STALE_FRESH_BODY_NOT_CHANGED');
      } else {
        invariant(response.etag === baselineEtag, phase, 'CACHE_STALE_ENTITY_CHANGED');
        invariant(response.bodyDigest === baselineBodyDigest, phase, 'CACHE_STALE_BODY_CHANGED');
      }
      // STALE is the explicit invalidation signal, but the body may already be
      // the revalidated representation when several CDN layers converge. It
      // never counts as final freshness. Any STALE response resets the stable
      // candidate; only two consecutive identical fresh HITs prove stability.
      freshResponse = null;
    }
    if (response.explicitCache === 'HIT') {
      if (!observedStale || !observedFresh) {
        invariant(!observedFresh, phase, 'CACHE_FRESH_BEFORE_INVALIDATION');
        invariant(response.etag === baselineEtag
          && response.bodyDigest === baselineBodyDigest,
        phase, observedStale
          ? 'CACHE_REFRESH_OLD_RESPONSE_CHANGED'
          : 'CACHE_BASELINE_CHANGED_BEFORE_INVALIDATION');
        freshResponse = null;
      } else {
        invariant(response.etag && response.etag !== baselineEtag, phase, 'CACHE_FRESH_ENTITY_NOT_CHANGED');
        invariant(response.bodyDigest && response.bodyDigest !== baselineBodyDigest,
          phase, 'CACHE_FRESH_BODY_NOT_CHANGED');
        if (freshResponse) {
          invariant(response.etag === freshResponse.etag
            && response.bodyDigest === freshResponse.bodyDigest,
          phase, 'CACHE_FRESH_CONFIRMATION_CHANGED');
          return {
            requests,
            state: 'STALE',
            freshState: 'HIT',
            observedFresh: true,
          };
        }
        freshResponse = response;
      }
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new AcceptanceError(phase, 'RELEVANT_CACHE_TAG_NOT_INVALIDATED');
}

export function validateUnrelatedEntityCache(response, baseline, phase) {
  invariant(response?.explicitCache === 'HIT', phase, 'UNRELATED_CACHE_TAG_WAS_INVALIDATED');
  invariant(response.etag === baseline?.etag
    && response.bodyDigest === baseline?.bodyDigest
    && response.cachePop === baseline?.cachePop,
  phase, 'UNRELATED_CACHE_ENTITY_CHANGED');
  invariant(Number.isFinite(baseline?.warmedAt)
    && Date.now() - baseline.warmedAt < CACHE_INVALIDATION_BASELINE_MAX_AGE_MS,
  phase, 'CACHE_INVALIDATION_BASELINE_EXPIRED');
  return true;
}

async function waitForPublicContent(client, { path, menuId, promotionId, phase }) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await client.request({ phase, path });
    const hasMenu = response.data?.menu?.some((item) => item?.id === menuId);
    const hasPromotion = response.data?.promotions?.some((item) => item?.id === promotionId);
    if (hasMenu && hasPromotion) return { response, requests: attempt + 1 };
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new AcceptanceError(phase, 'PUBLIC_CONTENT_DID_NOT_REVALIDATE');
}

export function planCleanupActions(state) {
  const actions = [];
  for (const id of [...(state.promotionIds || [])].reverse()) actions.push({ kind: 'promotion.delete', id });
  for (const id of [...(state.menuItemIds || [])].reverse()) actions.push({ kind: 'menu.delete', id });
  if (state.favoriteVenueKey) actions.push({ kind: 'favorite.delete', venueKey: state.favoriteVenueKey });
  if (state.reviewId) actions.push({ kind: 'review.reject', id: state.reviewId });
  if (state.submissionId) actions.push({ kind: 'submission.resolve', id: state.submissionId });
  if (state.mediaIds?.length && !state.mediaAttached) actions.push({ kind: 'media.release', ids: [...state.mediaIds] });
  if (state.merchantId) actions.push({ kind: 'merchant.suspend', id: state.merchantId });
  for (const id of [...(state.venueIds || [])].reverse()) actions.push({ kind: 'venue.delete', id });
  if (state.merchantSessionActive) actions.push({ kind: 'merchant.logout' });
  if (state.customerSessionActive) actions.push({ kind: 'customer.logout' });
  if (state.adminAActive) actions.push({ kind: 'admin-a.logout' });
  if (state.adminBActive) actions.push({ kind: 'admin-b.logout' });
  return actions;
}

function mediaCleanupGateRequired(state) {
  return Boolean(
    state?.approvedVenueId
      || state?.submissionId && state?.submissionApproved
      || state?.mediaIds?.length
      || state?.mediaCleanupDeadlines?.length
      || state?.publicMediaUrls?.length,
  );
}

function initialMediaCleanupGateEvidence(state) {
  const required = mediaCleanupGateRequired(state);
  return {
    required,
    passed: !required,
    deadlineCount: Array.isArray(state?.mediaCleanupDeadlines) ? state.mediaCleanupDeadlines.length : 0,
    expiresAt: null,
    notBefore: null,
    requestedWaitMs: 0,
    waitedMs: 0,
    waitCalls: 0,
  };
}

function attachMediaCleanupGateEvidence(error, evidence) {
  if (error && typeof error === 'object') {
    error.mediaCleanupGate = { ...evidence, passed: false };
  }
  return error;
}

export async function waitForMediaCleanupGate(state, {
  now = Date.now,
  sleep = sleepMilliseconds,
} = {}) {
  const evidence = initialMediaCleanupGateEvidence(state);
  if (!evidence.required) return evidence;

  try {
    invariant(
      Array.isArray(state?.mediaCleanupDeadlines) && state.mediaCleanupDeadlines.length > 0,
      'cleanup.manual-gate',
      'MEDIA_CLEANUP_DEADLINE_MISSING',
    );
    const retainedMediaIds = [
      ...(Array.isArray(state?.mediaIds) ? state.mediaIds : []),
      ...(Array.isArray(state?.abandonedMediaIds) ? state.abandonedMediaIds : []),
    ];
    const mediaIds = new Set(retainedMediaIds.map((mediaId) => requireUuid(
      mediaId,
      'cleanup.manual-gate',
      'MEDIA_CLEANUP_DEADLINE_INVALID',
    )));
    invariant(mediaIds.size === retainedMediaIds.length, 'cleanup.manual-gate', 'MEDIA_CLEANUP_DEADLINE_INVALID');

    let latest = null;
    const seenDeadlines = new Set();
    for (const retained of state.mediaCleanupDeadlines) {
      invariant(retained && typeof retained === 'object' && retained.valid === true, 'cleanup.manual-gate', 'MEDIA_CLEANUP_DEADLINE_INVALID');
      const mediaId = requireUuid(retained.mediaId, 'cleanup.manual-gate', 'MEDIA_CLEANUP_DEADLINE_INVALID');
      invariant(!seenDeadlines.has(mediaId), 'cleanup.manual-gate', 'MEDIA_CLEANUP_DEADLINE_INVALID');
      seenDeadlines.add(mediaId);
      const expiresAt = String(retained.expiresAt || '');
      invariant(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt), 'cleanup.manual-gate', 'MEDIA_CLEANUP_DEADLINE_INVALID');
      const expiresAtMs = Date.parse(expiresAt);
      invariant(
        Number.isSafeInteger(expiresAtMs)
          && new Date(expiresAtMs).toISOString() === expiresAt
          && retained.expiresAtMs === expiresAtMs,
        'cleanup.manual-gate',
        'MEDIA_CLEANUP_DEADLINE_INVALID',
      );
      invariant(
        Number.isSafeInteger(retained.horizonMs)
          && retained.horizonMs >= SIGNED_UPLOAD_MIN_HORIZON_MS
          && retained.horizonMs <= SIGNED_UPLOAD_MAX_HORIZON_MS,
        'cleanup.manual-gate',
        'MEDIA_CLEANUP_DEADLINE_INVALID',
      );
      const notBeforeMs = expiresAtMs + STAGING_TOMBSTONE_GRACE_MS + CLEANUP_CLOCK_BUFFER_MS;
      const notBefore = new Date(notBeforeMs).toISOString();
      invariant(
        retained.notBeforeMs === notBeforeMs && retained.notBefore === notBefore,
        'cleanup.manual-gate',
        'MEDIA_CLEANUP_DEADLINE_INVALID',
      );
      if (!latest || notBeforeMs > latest.notBeforeMs) latest = { expiresAt, notBefore, notBeforeMs };
    }
    invariant(
      [...mediaIds].every((mediaId) => seenDeadlines.has(mediaId)) && latest,
      'cleanup.manual-gate',
      'MEDIA_CLEANUP_DEADLINE_MISSING',
    );
    evidence.expiresAt = latest.expiresAt;
    evidence.notBefore = latest.notBefore;

    invariant(typeof sleep === 'function', 'cleanup.manual-gate', 'MEDIA_CLEANUP_WAIT_INVALID');
    const startedAtMs = clockMilliseconds(now, 'cleanup.manual-gate');
    let currentMs = startedAtMs;
    for (let wake = 0; wake < 8 && currentMs < latest.notBeforeMs; wake += 1) {
      const remainingMs = latest.notBeforeMs - currentMs;
      evidence.requestedWaitMs += remainingMs;
      evidence.waitCalls += 1;
      try {
        await sleep(remainingMs);
      } catch {
        throw new AcceptanceError('cleanup.manual-gate', 'MEDIA_CLEANUP_WAIT_ABORTED');
      }
      const nextMs = clockMilliseconds(now, 'cleanup.manual-gate');
      invariant(nextMs >= currentMs, 'cleanup.manual-gate', 'MEDIA_CLEANUP_CLOCK_REVERSED');
      currentMs = nextMs;
    }
    evidence.waitedMs = currentMs - startedAtMs;
    invariant(currentMs >= latest.notBeforeMs, 'cleanup.manual-gate', 'MEDIA_CLEANUP_WAIT_EARLY');
    evidence.passed = true;
    return evidence;
  } catch (error) {
    throw attachMediaCleanupGateEvidence(error, evidence);
  }
}

function exactUniqueReconciliation(rows, predicate, phase) {
  invariant(Array.isArray(rows), phase, 'AMBIGUOUS_RECONCILIATION_CONTRACT_INVALID');
  const matches = rows.filter(predicate);
  invariant(matches.length <= 1, phase, 'AMBIGUOUS_RECONCILIATION_NOT_UNIQUE');
  return { match: matches[0] || null, count: matches.length };
}

export async function cleanupArtifacts(state, context) {
  const failures = [];
  const completed = [];
  let actions = [];
  let cleanupAdmin = null;
  let mediaCleanupGate = initialMediaCleanupGateEvidence(state);
  let mediaCleanupGateAttempted = false;
  let mediaCleanupGatePromise = null;
  const mediaReaperProof = {
    required: Boolean(context?.mediaReaper),
    attempted: false,
    completed: false,
    evidence: null,
  };
  const ambiguousPhase = String(state?.mutationIntent?.phase || state?.ambiguousMutation?.phase || '');
  const ambiguousReconciliation = {
    required: Boolean(ambiguousPhase),
    phase: ambiguousPhase || null,
    completed: !ambiguousPhase,
    artifact: null,
    matches: 0,
  };

  async function ensureMediaCleanupGate() {
    mediaCleanupGateAttempted = true;
    if (!mediaCleanupGatePromise) {
      mediaCleanupGatePromise = waitForMediaCleanupGate(state, { now: context.now, sleep: context.sleep });
    }
    try {
      mediaCleanupGate = await mediaCleanupGatePromise;
    } catch (error) {
      if (error?.mediaCleanupGate) mediaCleanupGate = error.mediaCleanupGate;
      throw error;
    }
  }

  async function adminClient() {
    if (cleanupAdmin) return cleanupAdmin;
    for (const candidate of [context.adminB, context.adminA]) {
      if (!candidate) continue;
      try {
        const session = await candidate.request({ phase: 'cleanup.admin-session', path: PREVIEW_API.adminSession, expected: [200, 401] });
        if (session.status === 200 && session.data?.authenticated === true) {
          cleanupAdmin = candidate;
          return cleanupAdmin;
        }
      } catch {
        // A fresh, isolated cleanup session is attempted below.
      }
    }
    cleanupAdmin = new PreviewClient({
      baseUrl: context.baseUrl,
      bypassSecret: context.bypassSecret,
      fetchImpl: context.fetchImpl,
    });
    const login = await cleanupAdmin.request({
      phase: 'cleanup.admin-login',
      method: 'POST',
      path: PREVIEW_API.adminLogin,
      body: { login: context.adminLogin, password: context.adminPassword },
    });
    invariant(login.data?.user?.role === 'admin', 'cleanup.admin-login', 'CLEANUP_ADMIN_LOGIN_FAILED');
    return cleanupAdmin;
  }

  async function readOnlyAdminClient() {
    if (cleanupAdmin) return cleanupAdmin;
    for (const candidate of [context.adminB, context.adminA]) {
      if (!candidate) continue;
      let session;
      try {
        session = await candidate.request({
          phase: 'cleanup.reconcile.admin-session',
          path: PREVIEW_API.adminSession,
          expected: [200, 401],
        });
      } catch {
        continue;
      }
      if (session.status === 200 && session.data?.authenticated === true) {
        cleanupAdmin = candidate;
        return cleanupAdmin;
      }
    }
    throw new AcceptanceError('cleanup.reconcile', 'AMBIGUOUS_RECONCILIATION_ADMIN_UNAVAILABLE');
  }

  async function reconcileAmbiguousMutation() {
    if (!ambiguousPhase) return;
    const reconciliationPhase = 'cleanup.reconcile';
    const note = (artifact, count) => {
      ambiguousReconciliation.artifact = artifact;
      ambiguousReconciliation.matches = count;
      ambiguousReconciliation.completed = true;
      state.mutationIntent = null;
    };

    const adminLoginMatch = /^admin\.([ab])\.login$/.exec(ambiguousPhase);
    if (adminLoginMatch) {
      const label = adminLoginMatch[1].toUpperCase();
      const candidate = label === 'A' ? context.adminA : context.adminB;
      invariant(candidate, reconciliationPhase, 'AMBIGUOUS_RECONCILIATION_ADMIN_UNAVAILABLE');
      const session = await candidate.request({
        phase: 'cleanup.reconcile.admin-session',
        path: PREVIEW_API.adminSession,
        expected: [200, 401],
      });
      if (session.status === 200 && session.data?.authenticated === true) {
        state[`admin${label}Active`] = true;
        note('admin-session', 1);
      } else {
        note('admin-session', 0);
      }
      return;
    }

    const venueMatch = /^admin\.venue-([12])\.create$/.exec(ambiguousPhase);
    if (venueMatch) {
      const label = venueMatch[1] === '1' ? 'A' : 'B';
      const draft = venueDraft(context.runId, label);
      const client = await readOnlyAdminClient();
      const response = await client.request({ phase: 'cleanup.reconcile.venue', path: PREVIEW_API.adminVenues });
      const { match, count } = exactUniqueReconciliation(
        response.data?.venues,
        (venue) => venue?.title === draft.title && venue?.slug === draft.slug,
        reconciliationPhase,
      );
      if (match) registerCreatedVenue(state, match, draft, reconciliationPhase, { authoritative: true });
      note('venue', count);
      return;
    }

    if (ambiguousPhase === 'customer.register') {
      let session = await context.customer.request({
        phase: 'cleanup.reconcile.customer-session',
        path: PREVIEW_API.authSession,
        expected: [200],
      });
      if (session.data?.authenticated !== true) {
        const login = await context.customer.request({
          phase: 'cleanup.reconcile.customer-login',
          method: 'POST',
          path: PREVIEW_API.authLogin,
          body: {
            login: context.identity.customer.username,
            password: context.identity.customer.password,
          },
          expected: [200, 401],
        });
        if (login.status === 401) {
          note('customer-account', 0);
          return;
        }
        session = await context.customer.request({
          phase: 'cleanup.reconcile.customer-session-verified',
          path: PREVIEW_API.authSession,
          expected: [200],
        });
      }
      invariant(session.data?.authenticated === true, reconciliationPhase, 'AMBIGUOUS_CUSTOMER_REGISTRATION_UNRESOLVED');
      invariant(
        session.data?.user?.username === context.identity.customer.username
          && session.data?.user?.email === context.identity.customer.email,
        reconciliationPhase,
        'AMBIGUOUS_RECONCILIATION_IDENTITY_MISMATCH',
      );
      state.customerId = requireUuid(session.data.user.id, reconciliationPhase, 'CUSTOMER_ID_INVALID');
      state.customerSessionActive = true;
      note('customer-session', 1);
      return;
    }

    if (ambiguousPhase === 'customer.review') {
      const client = await readOnlyAdminClient();
      const dashboard = await client.request({ phase: 'cleanup.reconcile.review', path: PREVIEW_API.adminDashboard });
      const { match, count } = exactUniqueReconciliation(
        dashboard.data?.reviews,
        (review) => reviewMatchesRun(review, {
          runId: context.runId,
          customerId: state.customerId,
          statuses: ['pending'],
        }),
        reconciliationPhase,
      );
      if (match) state.reviewId = requireUuid(match.id, reconciliationPhase, 'REVIEW_ID_INVALID');
      note('review', count);
      return;
    }

    if (ambiguousPhase === 'customer.submission' || ambiguousPhase === 'media.approve-submission') {
      const client = await readOnlyAdminClient();
      const dashboard = await client.request({ phase: 'cleanup.reconcile.submission', path: PREVIEW_API.adminDashboard });
      const { match, count } = exactUniqueReconciliation(
        dashboard.data?.submissions,
        (submission) => submissionMatchesRun(submission, {
          id: ambiguousPhase === 'media.approve-submission' ? state.submissionId : '',
          runId: context.runId,
          customerId: state.customerId,
          statuses: ambiguousPhase === 'media.approve-submission'
            ? ['pending', 'approved']
            : ['pending'],
        }),
        reconciliationPhase,
      );
      if (ambiguousPhase === 'media.approve-submission') {
        invariant(match, reconciliationPhase, 'AMBIGUOUS_SUBMISSION_RECONCILIATION_MISSING');
      }
      if (match) {
        state.submissionId = requireUuid(match.id, reconciliationPhase, 'SUBMISSION_ID_INVALID');
        state.mediaAttached = true;
        state.submissionApproved = match.status === 'approved';
        if (state.submissionApproved) {
          const approvedVenueId = requireUuid(
            match.approved_venue_id,
            reconciliationPhase,
            'APPROVED_VENUE_ID_INVALID',
          );
          const venues = await client.request({
            phase: 'cleanup.reconcile.approved-venue',
            path: PREVIEW_API.adminVenues,
          });
          confirmAuthoritativeApprovedVenue(
            state,
            { submissions: dashboard.data?.submissions, venues: venues.data?.venues },
            approvedVenueId,
            {
              runId: context.runId,
              customerId: state.customerId,
              phase: reconciliationPhase,
            },
          );
        }
      } else if (ambiguousPhase === 'customer.submission') {
        // The exact authoritative dashboard query proved that the POST did not commit.
        state.mediaAttached = false;
      }
      note('submission', count);
      return;
    }

    if (ambiguousPhase === 'admin.merchant-create') {
      const client = await readOnlyAdminClient();
      const response = await client.request({ phase: 'cleanup.reconcile.merchant', path: PREVIEW_API.adminMerchants });
      const { match, count } = exactUniqueReconciliation(
        response.data?.merchants,
        (merchant) => merchantMatchesRun(merchant, { identity: context.identity.merchant }),
        reconciliationPhase,
      );
      if (match) state.merchantId = requireUuid(match.id || match.user_id, reconciliationPhase, 'MERCHANT_ID_INVALID');
      note('merchant', count);
      return;
    }

    if (ambiguousPhase === 'merchant.menu-create' || ambiguousPhase === 'merchant.promotion-create') {
      const dashboard = await context.merchant.request({
        phase: 'cleanup.reconcile.merchant-dashboard',
        path: PREVIEW_API.merchantDashboard,
      });
      const isMenu = ambiguousPhase === 'merchant.menu-create';
      const rows = isMenu ? dashboard.data?.menu : dashboard.data?.promotions;
      const { match, count } = exactUniqueReconciliation(
        rows,
        (item) => merchantContentMatchesRun(item, {
          kind: isMenu ? 'menu' : 'promotion',
          runId: context.runId,
          venueId: state.venueIds?.[0],
        }),
        reconciliationPhase,
      );
      if (match) {
        const id = requireUuid(match.id, reconciliationPhase, isMenu ? 'MENU_ID_INVALID' : 'PROMOTION_ID_INVALID');
        const destination = isMenu ? state.menuItemIds : state.promotionIds;
        invariant(Array.isArray(destination), reconciliationPhase, 'AMBIGUOUS_RECONCILIATION_STATE_INVALID');
        if (!destination.includes(id)) destination.push(id);
      }
      note(isMenu ? 'menu' : 'promotion', count);
      return;
    }

    if (ambiguousPhase === 'customer.login') {
      const session = await context.customer.request({
        phase: 'cleanup.reconcile.customer-session',
        path: PREVIEW_API.authSession,
        expected: [200],
      });
      if (session.data?.authenticated === true) {
        invariant(session.data?.user?.id === state.customerId, reconciliationPhase, 'AMBIGUOUS_RECONCILIATION_IDENTITY_MISMATCH');
        state.customerSessionActive = true;
        note('customer-session', 1);
      } else {
        note('customer-session', 0);
      }
      return;
    }

    if (ambiguousPhase === 'media.sign' || ambiguousPhase === 'media.reaper-probe.sign') {
      const retainedIds = ambiguousPhase === 'media.sign' ? state.mediaIds : state.abandonedMediaIds;
      invariant(
        Array.isArray(retainedIds)
          && retainedIds.length > 0
          && Array.isArray(state.mediaCleanupDeadlines)
          && state.mediaCleanupDeadlines.length > 0,
        reconciliationPhase,
        'AMBIGUOUS_SIGN_RECEIPT_UNRESOLVED',
      );
      if (ambiguousPhase === 'media.reaper-probe.sign') state.abandonedMediaId = retainedIds[0];
      note(ambiguousPhase === 'media.sign' ? 'signed-media' : 'abandoned-signed-media', retainedIds.length);
      return;
    }

    if (ambiguousPhase === 'merchant.login' || ambiguousPhase === 'merchant.password-change') {
      const session = await context.merchant.request({
        phase: 'cleanup.reconcile.merchant-session',
        path: PREVIEW_API.authSession,
        expected: [200],
      });
      if (session.data?.authenticated === true) {
        invariant(session.data?.user?.id === state.merchantId, reconciliationPhase, 'AMBIGUOUS_RECONCILIATION_IDENTITY_MISMATCH');
        state.merchantSessionActive = true;
        if (ambiguousPhase === 'merchant.password-change' && session.data?.user?.mustChangePassword === false) {
          state.currentMerchantPassword = context.identity.merchant.password;
        }
        note('merchant-session', 1);
      } else {
        note('merchant-session', 0);
      }
      return;
    }

    if (['customer.favorite-create', 'media.finalize', 'merchant.venue-update'].includes(ambiguousPhase)) {
      note('known-id-mutation', 1);
      return;
    }

    throw new AcceptanceError(reconciliationPhase, 'AMBIGUOUS_MUTATION_RECONCILIATION_UNSUPPORTED');
  }

  if (ambiguousPhase === 'customer.submission' && !state.submissionId) {
    // Until the GET-only reconciliation proves otherwise, a committed attachment is possible.
    state.mediaAttached = true;
  }
  try {
    await reconcileAmbiguousMutation();
    if (ambiguousReconciliation.required) completed.push('ambiguous.reconcile');
  } catch (error) {
    failures.push({ kind: 'ambiguous.reconcile', failure: safeFailure(error) });
  }
  actions = planCleanupActions(state);

  function assertCleanupSessionIdentity(session, kind, phase) {
    const expected = context.identity?.[kind];
    const user = session?.data?.user;
    const expectedId = kind === 'customer' ? state.customerId : state.merchantId;
    invariant(
      session?.data?.authenticated === true
        && user
        && typeof user === 'object'
        && user.id === expectedId
        && user.username === expected?.username
        && user.email === expected?.email
        && user.role === kind,
      phase,
      `${kind.toUpperCase()}_SESSION_IDENTITY_MISMATCH`,
      session?.status,
    );
  }

  async function customerClient() {
    const session = await context.customer.request({ phase: 'cleanup.customer-session', path: PREVIEW_API.authSession, expected: [200] });
    if (session.data?.authenticated === true) {
      assertCleanupSessionIdentity(session, 'customer', 'cleanup.customer-session');
      return context.customer;
    }
    await context.customer.request({
      phase: 'cleanup.customer-login',
      method: 'POST',
      path: PREVIEW_API.authLogin,
      body: { login: context.identity.customer.username, password: context.identity.customer.password },
    });
    const verified = await context.customer.request({
      phase: 'cleanup.customer-login.verify',
      path: PREVIEW_API.authSession,
      expected: [200],
    });
    assertCleanupSessionIdentity(verified, 'customer', 'cleanup.customer-login.verify');
    state.customerSessionActive = true;
    return context.customer;
  }

  async function merchantClient() {
    const session = await context.merchant.request({ phase: 'cleanup.merchant-session', path: PREVIEW_API.authSession, expected: [200] });
    if (session.data?.authenticated === true) {
      assertCleanupSessionIdentity(session, 'merchant', 'cleanup.merchant-session');
      return context.merchant;
    }
    await context.merchant.request({
      phase: 'cleanup.merchant-login',
      method: 'POST',
      path: PREVIEW_API.authLogin,
      body: { login: context.identity.merchant.username, password: state.currentMerchantPassword },
    });
    const verified = await context.merchant.request({
      phase: 'cleanup.merchant-login.verify',
      path: PREVIEW_API.authSession,
      expected: [200],
    });
    assertCleanupSessionIdentity(verified, 'merchant', 'cleanup.merchant-login.verify');
    state.merchantSessionActive = true;
    return context.merchant;
  }

  async function execute(action) {
    switch (action.kind) {
      case 'promotion.delete':
        {
          const client = await merchantClient();
          await client.request({ phase: 'cleanup.promotion', method: 'DELETE', path: PREVIEW_API.merchantPromotions, body: { id: action.id } });
          const dashboard = await client.request({ phase: 'cleanup.promotion.verify', path: PREVIEW_API.merchantDashboard });
          invariant(Array.isArray(dashboard.data?.promotions) && !dashboard.data.promotions.some((item) => item?.id === action.id), 'cleanup.promotion.verify', 'PROMOTION_CLEANUP_NOT_PERSISTED');
        }
        break;
      case 'menu.delete':
        {
          const client = await merchantClient();
          await client.request({ phase: 'cleanup.menu', method: 'DELETE', path: PREVIEW_API.merchantMenu, body: { id: action.id } });
          const dashboard = await client.request({ phase: 'cleanup.menu.verify', path: PREVIEW_API.merchantDashboard });
          invariant(Array.isArray(dashboard.data?.menu) && !dashboard.data.menu.some((item) => item?.id === action.id), 'cleanup.menu.verify', 'MENU_CLEANUP_NOT_PERSISTED');
        }
        break;
      case 'favorite.delete':
        {
          const client = await customerClient();
          await client.request({ phase: 'cleanup.favorite', method: 'DELETE', path: PREVIEW_API.favorites, body: { venueKey: action.venueKey } });
          const favorites = await client.request({ phase: 'cleanup.favorite.verify', path: PREVIEW_API.favorites });
          invariant(Array.isArray(favorites.data?.favorites) && !favorites.data.favorites.some((item) => item?.venue_key === action.venueKey), 'cleanup.favorite.verify', 'FAVORITE_CLEANUP_NOT_PERSISTED');
        }
        break;
      case 'review.reject':
        {
          const client = await adminClient();
          await client.request({ phase: 'cleanup.review', method: 'PATCH', path: PREVIEW_API.adminReviews, body: { id: action.id, decision: 'rejected', note: 'Isolated acceptance cleanup' } });
          const dashboard = await client.request({ phase: 'cleanup.review.verify', path: PREVIEW_API.adminDashboard });
          invariant(Array.isArray(dashboard.data?.reviews) && dashboard.data.reviews.some((item) => item?.id === action.id && item?.status === 'rejected'), 'cleanup.review.verify', 'REVIEW_CLEANUP_NOT_PERSISTED');
        }
        break;
      case 'submission.resolve':
        {
          const client = await adminClient();
          let dashboard = await client.request({ phase: 'cleanup.submission.inspect', path: PREVIEW_API.adminDashboard });
          let submission = dashboard.data?.submissions?.find((item) => item?.id === action.id);
          invariant(submission, 'cleanup.submission.inspect', 'SUBMISSION_CLEANUP_TARGET_MISSING');
          if (submission.status === 'pending') {
            const rejectionReceipt = await client.request({ phase: 'cleanup.submission', method: 'PATCH', path: PREVIEW_API.adminSubmissions, body: { id: action.id, decision: 'rejected', note: 'Isolated acceptance cleanup' } });
            validateSubmissionRejectionReceipt(rejectionReceipt, 'cleanup.submission');
            dashboard = await client.request({ phase: 'cleanup.submission.verify', path: PREVIEW_API.adminDashboard });
            submission = dashboard.data?.submissions?.find((item) => item?.id === action.id);
          }
          if (submission?.status === 'approved') {
            invariant(
              submissionMatchesRun(submission, {
                id: action.id,
                runId: context.runId,
                customerId: state.customerId,
                statuses: ['approved'],
              }),
              'cleanup.submission.verify',
              'APPROVED_SUBMISSION_IDENTITY_MISMATCH',
            );
            const approvedVenueId = requireUuid(
              submission.approved_venue_id,
              'cleanup.submission.verify',
              'APPROVED_VENUE_ID_INVALID',
            );
            if (!state.venueIds.includes(approvedVenueId)) {
              const authoritativeVenues = await client.request({
                phase: 'cleanup.approved-venue.inspect',
                path: PREVIEW_API.adminVenues,
              });
              exactAuthoritativeMatch(
                authoritativeVenues.data?.venues,
                (venue) => approvedVenueMatches(venue, {
                  id: approvedVenueId,
                  submissionId: action.id,
                  runId: context.runId,
                  customerId: state.customerId,
                }),
                'cleanup.approved-venue.inspect',
                'APPROVED_VENUE_AUTHORITATIVE_IDENTITY_MISMATCH',
              );
              const deletionReceipt = await client.request({ phase: 'cleanup.approved-venue', method: 'DELETE', path: PREVIEW_API.adminVenues, body: { id: approvedVenueId } });
              const venues = await client.request({ phase: 'cleanup.approved-venue.verify', path: PREVIEW_API.adminVenues });
              invariant(Array.isArray(venues.data?.venues) && !venues.data.venues.some((item) => item?.id === approvedVenueId), 'cleanup.approved-venue.verify', 'VENUE_CLEANUP_NOT_PERSISTED');
              if (state.publicMediaUrls?.length) {
                await waitForPublishedMediaDeletion(
                  context.fetchImpl,
                  state.publicMediaUrls,
                  'cleanup.public-media',
                  13,
                  { now: context.now, sleep: context.sleep },
                );
              }
              validateVenueDeleteReceipt(deletionReceipt, 'cleanup.approved-venue');
            }
          } else {
            invariant(submission?.status === 'rejected', 'cleanup.submission.verify', 'SUBMISSION_CLEANUP_NOT_PERSISTED');
          }
        }
        break;
      case 'media.release':
        {
          const client = await customerClient();
          let releaseIds = action.ids;
          if (context.mediaReaper) {
            const statuses = await Promise.all(action.ids.map((id) => readOwnedMediaStatus(
              client,
              id,
              'cleanup.media-release.inspect',
            )));
            releaseIds = statuses.filter((status) => status.exists).map((status) => status.mediaId);
            if (!releaseIds.length) break;
          }
          const released = await client.request({
            phase: 'cleanup.media-release',
            method: 'POST',
            path: PREVIEW_API.uploadRelease,
            body: { mediaIds: releaseIds },
          });
          invariant(Array.isArray(released.data?.released), 'cleanup.media-release', 'MEDIA_RELEASE_CONTRACT_FAILED');
          if (!state.mediaAttached) {
            invariant(
              released.data.released.length === releaseIds.length
                && releaseIds.every((id) => released.data.released.includes(id)),
              'cleanup.media-release',
              'MEDIA_RELEASE_INCOMPLETE',
            );
          }
        }
        break;
      case 'merchant.logout':
        await context.merchant.request({ phase: 'cleanup.merchant-logout', method: 'POST', path: PREVIEW_API.authLogout });
        {
          const session = await context.merchant.request({ phase: 'cleanup.merchant-logout.verify', path: PREVIEW_API.authSession });
          invariant(session.data?.authenticated === false, 'cleanup.merchant-logout.verify', 'MERCHANT_LOGOUT_NOT_PERSISTED');
        }
        state.merchantSessionActive = false;
        break;
      case 'merchant.suspend':
        {
          const client = await adminClient();
          await client.request({ phase: 'cleanup.merchant-suspend', method: 'PATCH', path: PREVIEW_API.adminMerchants, body: { userId: action.id, status: 'suspended' } });
          const merchants = await client.request({ phase: 'cleanup.merchant-suspend.verify', path: PREVIEW_API.adminMerchants });
          invariant(Array.isArray(merchants.data?.merchants) && merchants.data.merchants.some((item) => (item?.id || item?.user_id) === action.id && item?.status === 'suspended'), 'cleanup.merchant-suspend.verify', 'MERCHANT_SUSPEND_NOT_PERSISTED');
        }
        break;
      case 'venue.delete':
        {
          const client = await adminClient();
          const deletionReceipt = await client.request({ phase: 'cleanup.venue', method: 'DELETE', path: PREVIEW_API.adminVenues, body: { id: action.id } });
          const venues = await client.request({ phase: 'cleanup.venue.verify', path: PREVIEW_API.adminVenues });
          invariant(Array.isArray(venues.data?.venues) && !venues.data.venues.some((item) => item?.id === action.id), 'cleanup.venue.verify', 'VENUE_CLEANUP_NOT_PERSISTED');
          if (action.id === state.approvedVenueId && state.publicMediaUrls?.length) {
            await waitForPublishedMediaDeletion(
              context.fetchImpl,
              state.publicMediaUrls,
              'cleanup.public-media',
              13,
              { now: context.now, sleep: context.sleep },
            );
          }
          validateVenueDeleteReceipt(deletionReceipt, 'cleanup.venue');
        }
        break;
      case 'customer.logout':
        await context.customer.request({ phase: 'cleanup.customer-logout', method: 'POST', path: PREVIEW_API.authLogout });
        {
          const session = await context.customer.request({ phase: 'cleanup.customer-logout.verify', path: PREVIEW_API.authSession });
          invariant(session.data?.authenticated === false, 'cleanup.customer-logout.verify', 'CUSTOMER_LOGOUT_NOT_PERSISTED');
        }
        state.customerSessionActive = false;
        break;
      case 'admin-a.logout':
        await context.adminA.request({ phase: 'cleanup.admin-a-logout', method: 'POST', path: PREVIEW_API.adminLogout });
        await context.adminA.request({ phase: 'cleanup.admin-a-logout.verify', path: PREVIEW_API.adminSession, expected: [401] });
        state.adminAActive = false;
        break;
      case 'admin-b.logout':
        await context.adminB.request({ phase: 'cleanup.admin-b-logout', method: 'POST', path: PREVIEW_API.adminLogout });
        await context.adminB.request({ phase: 'cleanup.admin-b-logout.verify', path: PREVIEW_API.adminSession, expected: [401] });
        state.adminBActive = false;
        break;
      default:
        throw new AcceptanceError('cleanup', 'UNKNOWN_CLEANUP_ACTION');
    }
  }

  async function executeActions(selectedActions) {
    for (const action of selectedActions) {
      try {
        if (MEDIA_CLEANUP_ACTIONS.has(action.kind)) await ensureMediaCleanupGate();
        await execute(action);
        completed.push(action.kind);
      } catch (error) {
        failures.push({ kind: action.kind, failure: safeFailure(error) });
      }
    }
  }

  const ordinaryActions = actions.filter((action) => !SESSION_LOGOUT_ACTIONS.has(action.kind));
  const logoutActions = actions.filter((action) => SESSION_LOGOUT_ACTIONS.has(action.kind));
  await executeActions(ordinaryActions);

  if (mediaReaperProof.required) {
    mediaReaperProof.attempted = true;
    try {
      await ensureMediaCleanupGate();
      invariant(failures.length === 0, 'media-reaper.isolation', 'MEDIA_REAPER_PRECONDITION_CLEANUP_FAILED');
      invariant(
        state.abandonedMediaId
          && state.abandonedMediaExistenceProven === true
          && Array.isArray(state.abandonedMediaIds)
          && state.abandonedMediaIds.length === 1
          && state.abandonedMediaIds[0] === state.abandonedMediaId,
        'media-reaper.probe',
        'MEDIA_REAPER_PROBE_EXISTENCE_NOT_PROVEN',
      );
      const ownerBefore = await customerClient();
      const immediatelyBefore = await readOwnedMediaStatus(
        ownerBefore,
        state.abandonedMediaId,
        'media-reaper.probe.exists-before-invoke',
      );
      invariant(
        immediatelyBefore.exists === true,
        'media-reaper.probe.exists-before-invoke',
        'MEDIA_REAPER_PROBE_NOT_PERSISTED',
      );
      const handlerEvidence = await provePreviewMediaReaper(context.mediaReaper);
      const ownerAfter = await customerClient();
      const after = await readOwnedMediaStatus(
        ownerAfter,
        state.abandonedMediaId,
        'media-reaper.probe.absent-after',
      );
      invariant(after.exists === false, 'media-reaper.probe.absent-after', 'MEDIA_REAPER_PROBE_NOT_REAPED');
      mediaReaperProof.evidence = Object.freeze({
        ...handlerEvidence,
        abandonedMediaAbsenceProof: Object.freeze({
          proven: true,
          existedBefore: true,
          existsImmediatelyBeforeInvoke: true,
          existsAfter: false,
        }),
      });
      mediaReaperProof.completed = true;
      completed.push('media-reaper.proof');
    } catch (error) {
      failures.push({ kind: 'media-reaper.proof', failure: safeFailure(error) });
      if (state.abandonedMediaId && mediaCleanupGate.passed) {
        try {
          const client = await customerClient();
          const exists = (await readOwnedMediaStatus(
            client,
            state.abandonedMediaId,
            'cleanup.media-reaper-probe.inspect',
          )).exists;
          if (exists) {
            const released = await client.request({
              phase: 'cleanup.media-reaper-probe.release',
              method: 'POST',
              path: PREVIEW_API.uploadRelease,
              body: { mediaIds: [state.abandonedMediaId] },
            });
            invariant(
              exactObjectKeys(released.data, ['released'])
                && Array.isArray(released.data.released)
                && released.data.released.length === 1
                && released.data.released[0] === state.abandonedMediaId,
              'cleanup.media-reaper-probe.release',
              'MEDIA_REAPER_PROBE_FALLBACK_RELEASE_INVALID',
            );
            const afterFallback = await readOwnedMediaStatus(
              client,
              state.abandonedMediaId,
              'cleanup.media-reaper-probe.verify',
            );
            invariant(
              afterFallback.exists === false,
              'cleanup.media-reaper-probe.verify',
              'MEDIA_REAPER_PROBE_FALLBACK_RELEASE_INCOMPLETE',
            );
          }
          completed.push('media-reaper-probe.fallback-cleanup');
        } catch (fallbackError) {
          failures.push({ kind: 'media-reaper-probe.fallback-cleanup', failure: safeFailure(fallbackError) });
        }
      }
    }
  }

  await executeActions(logoutActions);

  if (mediaCleanupGate.required && !mediaCleanupGateAttempted) {
    failures.push({
      kind: 'media.cleanup-gate',
      failure: { phase: 'cleanup.manual-gate', code: 'MEDIA_CLEANUP_ACTION_MISSING' },
    });
  }

  if (cleanupAdmin && cleanupAdmin !== context.adminA && cleanupAdmin !== context.adminB) {
    try {
      await cleanupAdmin.request({ phase: 'cleanup.recovery-admin-logout', method: 'POST', path: PREVIEW_API.adminLogout });
      completed.push('recovery-admin.logout');
    } catch (error) {
      failures.push({ kind: 'recovery-admin.logout', failure: safeFailure(error) });
    }
  }

  const unavoidableResiduals = [];
  if (state.customerId) unavoidableResiduals.push({ kind: 'customer-account', idHash: identifierHash(state.customerId, context.runId), disposition: 'NO_DELETE_API' });
  if (state.merchantId) unavoidableResiduals.push({ kind: 'suspended-merchant-account', idHash: identifierHash(state.merchantId, context.runId), disposition: 'SUSPENDED_NO_DELETE_API' });
  if (state.reviewId) unavoidableResiduals.push({ kind: 'rejected-review-record', idHash: identifierHash(state.reviewId, context.runId), disposition: 'AUDIT_RETENTION' });
  if (state.submissionId) unavoidableResiduals.push({ kind: 'rejected-submission-record', idHash: identifierHash(state.submissionId, context.runId), disposition: 'AUDIT_RETENTION' });

  return {
    complete: failures.length === 0,
    supportedCleanupComplete: failures.length === 0,
    attempted: actions.length,
    completed: completed.length,
    failures,
    ambiguousReconciliation,
    mediaCleanupGate,
    mediaReaperProof,
    unavoidableResiduals,
  };
}

export async function runPreviewAcceptance({
  baseUrl,
  deploymentId,
  expectedCommitSha,
  projectId,
  teamId,
  vercelToken,
  deploymentFetch,
  appFetch = fetch,
  expectedSupabaseProjectRef,
  forbiddenProductionSupabaseProjectRef,
  expectedRedisNamespace = 'preview',
  expectedRedisProvidersFingerprint,
  forbiddenProductionRedisProvidersFingerprint,
  adminLogin,
  adminPassword,
  bypassSecret = '',
  browserExecutablePath,
  cronSecret,
  now = Date.now,
  sleep = sleepMilliseconds,
}) {
  const startedAt = Date.now();
  let normalizedExpectedCommitSha;
  try {
    normalizedExpectedCommitSha = resolveExpectedPreviewCommitSha(expectedCommitSha, {});
  } catch {
    throw new AcceptanceError('configuration', 'EXPECTED_COMMIT_SHA_INVALID');
  }
  const validatedCronSecret = validateAcceptanceCronSecret(cronSecret);
  let deployment;
  try {
    deployment = await verifyPreviewDeployment({
      baseUrl,
      deploymentId,
      expectedCommitSha: normalizedExpectedCommitSha,
      projectId,
      teamId,
      token: vercelToken,
      fetchImpl: deploymentFetch || fetch,
    });
  } catch (error) {
    if (error?.message === 'Vercel deployment commit does not match expected Preview commit SHA') {
      throw new AcceptanceError('deployment', 'DEPLOYMENT_COMMIT_MISMATCH');
    }
    if (String(error?.message || '').includes('commit proof')) {
      throw new AcceptanceError('deployment', 'DEPLOYMENT_COMMIT_PROOF_FAILED');
    }
    throw error;
  }
  const providerIdentity = await verifyPreviewReleaseFingerprint({
    baseUrl,
    expectedDeploymentId: deployment.deploymentId,
    expectedProjectId: deployment.projectId,
    expectedSupabaseProjectRef,
    forbiddenProductionSupabaseProjectRef,
    expectedRedisNamespace,
    expectedRedisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint,
    bypassSecret,
    fetchImpl: appFetch,
  });
  invariant(
    typeof browserExecutablePath === 'string'
      && isAbsolute(browserExecutablePath)
      && existsSync(browserExecutablePath),
    'configuration',
    'CHROME_EXECUTABLE_UNAVAILABLE',
  );
  const runId = randomBytes(8).toString('hex');
  const identity = generatedIdentity(runId);
  const publicClient = new PreviewClient({ baseUrl, bypassSecret, jar: NO_COOKIES, fetchImpl: appFetch });
  const adminA = new PreviewClient({ baseUrl, bypassSecret, fetchImpl: appFetch });
  const adminB = new PreviewClient({ baseUrl, bypassSecret, fetchImpl: appFetch });
  const customer = new PreviewClient({ baseUrl, bypassSecret, fetchImpl: appFetch });
  const merchant = new PreviewClient({ baseUrl, bypassSecret, fetchImpl: appFetch });
  const report = {
    schemaVersion: 1,
    kind: 'mesto.preview.acceptance',
    runId,
    target: baseUrl,
    passed: false,
    evidenceManifest: {
      deploymentId: deployment.deploymentId,
      projectId: deployment.projectId,
      commitSha: deployment.commitSha,
      expectedCommitSha: deployment.expectedCommitSha,
      actualCommitSha: deployment.actualCommitSha,
    },
    segments: [],
    media: { ...MEDIA_ACCEPTANCE_MODE },
  };
  const state = {
    adminAActive: false,
    adminBActive: false,
    customerId: '',
    customerSessionActive: false,
    favoriteVenueKey: '',
    customerCandidateId: '',
    merchantId: '',
    merchantCandidateId: '',
    merchantSessionActive: false,
    currentMerchantPassword: identity.merchant.temporaryPassword,
    menuItemIds: [],
    menuItemCandidateIds: [],
    promotionIds: [],
    promotionCandidateIds: [],
    reviewId: '',
    reviewCandidateId: '',
    submissionId: '',
    submissionCandidateId: '',
    submissionApproved: false,
    approvedVenueId: '',
    abandonedMediaId: '',
    abandonedMediaIds: [],
    abandonedMediaExistenceProven: false,
    mediaIds: [],
    mediaCleanupDeadlines: [],
    mediaAttached: false,
    publicMediaUrls: [],
    venueIds: [],
    venueCandidateIds: [],
    mutationIntent: null,
    ambiguousMutation: null,
  };
  const context = {
    adminA,
    adminB,
    adminLogin,
    adminPassword,
    baseUrl,
    bypassSecret,
    fetchImpl: appFetch,
    customer,
    identity,
    merchant,
    mediaReaper: {
      baseUrl,
      bypassSecret,
      cronSecret: validatedCronSecret,
      fetchImpl: appFetch,
      providerIdentity,
    },
    now,
    runId,
    sleep,
  };
  let workflowFailure = null;

  try {
    const providers = await publicClient.request({ phase: 'preflight.providers', path: PREVIEW_API.authProviders });
    const summary = await publicClient.request({ phase: 'preflight.database', path: `${PREVIEW_API.venues}?summary=1` });
    invariant(providers.data?.email === true, 'preflight.providers', 'EMAIL_PROVIDER_DISABLED');
    invariant(summary.data?.databaseConfigured === true && summary.data?.source === 'database', 'preflight.database', 'PREVIEW_DATABASE_NOT_CONFIGURED');
    addCheck(report, 'preflight', 'provider-backed-preview', { httpStatuses: [providers.status, summary.status] });

    for (const [label, client] of [['a', adminA], ['b', adminB]]) {
      const loginPhase = `admin.${label}.login`;
      armMutationIntent(state, loginPhase);
      const login = await client.request({
        phase: loginPhase,
        method: 'POST',
        path: PREVIEW_API.adminLogin,
        body: { login: adminLogin, password: adminPassword },
      });
      invariant(login.data?.user?.role === 'admin', loginPhase, 'ADMIN_LOGIN_FAILED');
      state[`admin${label.toUpperCase()}Active`] = true;
      acknowledgeMutationIntent(state, loginPhase);
      const session = await client.request({ phase: `admin.${label}.session`, path: PREVIEW_API.adminSession });
      invariant(session.data?.authenticated === true, `admin.${label}.session`, 'ADMIN_SESSION_NOT_ACTIVE');
    }
    const revokedAdminA = new PreviewClient({
      baseUrl,
      bypassSecret,
      jar: adminA.jar.clone(),
    });
    await adminA.request({ phase: 'admin.revocation.logout', method: 'POST', path: PREVIEW_API.adminLogout });
    state.adminAActive = false;
    const revoked = await revokedAdminA.request({ phase: 'admin.revocation.revoked-session', path: PREVIEW_API.adminSession, expected: [401] });
    const independent = await adminB.request({ phase: 'admin.revocation.independent-session', path: PREVIEW_API.adminSession });
    invariant(revoked.data?.authenticated === false, 'admin.revocation.revoked-session', 'ADMIN_SESSION_REVOCATION_FAILED');
    invariant(independent.data?.authenticated === true, 'admin.revocation.independent-session', 'ADMIN_SESSION_REVOCATION_BLAST_RADIUS');
    addCheck(report, 'admin-sessions', 'two-session-selective-revocation', { statuses: [200, 200, 401, 200] });

    const drafts = [venueDraft(runId, 'A'), venueDraft(runId, 'B')];
    const venues = [];
    for (const [index, draft] of drafts.entries()) {
      const createPhase = `admin.venue-${index + 1}.create`;
      armMutationIntent(state, createPhase);
      const response = await adminB.request({
        phase: createPhase,
        method: 'POST',
        path: PREVIEW_API.adminVenues,
        body: draft,
        expected: [201],
      });
      const candidate = registerCreatedVenue(
        state,
        response.data?.venue,
        draft,
        createPhase,
      );
      const authoritative = await adminB.request({
        phase: `${createPhase}.authoritative`,
        path: PREVIEW_API.adminVenues,
      });
      venues.push(confirmAuthoritativeVenue(
        state,
        authoritative.data?.venues,
        candidate.id,
        draft,
        `${createPhase}.authoritative`,
      ));
      acknowledgeMutationIntent(state, createPhase);
    }
    addCheck(report, 'admin-content', 'two-disposable-published-venues', { created: venues.length });

    armMutationIntent(state, 'customer.register');
    const registration = await customer.request({
      phase: 'customer.register',
      method: 'POST',
      path: PREVIEW_API.authRegister,
      body: {
        name: identity.customer.displayName,
        username: identity.customer.username,
        email: identity.customer.email,
        password: identity.customer.password,
      },
      expected: [201],
    });
    const customerCandidateId = retainMutationCandidate(
      state,
      'customerCandidateId',
      registration.data?.user?.id,
      'customer.register',
      'CUSTOMER_ID_INVALID',
    );
    const registeredSession = await customer.request({ phase: 'customer.registered-session', path: PREVIEW_API.authSession });
    confirmAuthoritativeRegistration(
      state,
      registeredSession,
      customerCandidateId,
      identity.customer,
      'customer.registered-session',
    );
    acknowledgeMutationIntent(state, 'customer.register');
    await customer.request({ phase: 'customer.initial-logout', method: 'POST', path: PREVIEW_API.authLogout });
    state.customerSessionActive = false;
    const anonymous = await customer.request({ phase: 'customer.anonymous-session', path: PREVIEW_API.authSession });
    invariant(anonymous.data?.authenticated === false, 'customer.anonymous-session', 'CUSTOMER_LOGOUT_FAILED');
    armMutationIntent(state, 'customer.login');
    const customerLogin = await customer.request({
      phase: 'customer.login',
      method: 'POST',
      path: PREVIEW_API.authLogin,
      body: { login: identity.customer.username, password: identity.customer.password },
    });
    invariant(customerLogin.data?.user?.id === state.customerId, 'customer.login', 'CUSTOMER_LOGIN_IDENTITY_MISMATCH');
    const loggedIn = await customer.request({ phase: 'customer.logged-in-session', path: PREVIEW_API.authSession });
    invariant(
      loggedIn.data?.authenticated === true
        && loggedIn.data?.user?.id === state.customerId
        && loggedIn.data?.user?.username === identity.customer.username
        && loggedIn.data?.user?.email === identity.customer.email,
      'customer.logged-in-session',
      'CUSTOMER_LOGIN_FAILED',
    );
    state.customerSessionActive = true;
    acknowledgeMutationIntent(state, 'customer.login');

    state.favoriteVenueKey = `mesto-${venues[0].id}`;
    armMutationIntent(state, 'customer.favorite-create');
    await customer.request({
      phase: 'customer.favorite-create',
      method: 'POST',
      path: PREVIEW_API.favorites,
      body: {
        venueKey: state.favoriteVenueKey,
        venueId: venues[0].id,
        snapshot: { slug: venues[0].slug, title: drafts[0].title, type: drafts[0].category, text: 'Disposable acceptance favorite' },
      },
      expected: [201],
    });
    const favorites = await customer.request({ phase: 'customer.favorite-list', path: PREVIEW_API.favorites });
    invariant(Array.isArray(favorites.data?.favorites) && favorites.data.favorites.some((item) => item?.venue_key === state.favoriteVenueKey), 'customer.favorite-list', 'FAVORITE_NOT_PERSISTED');
    acknowledgeMutationIntent(state, 'customer.favorite-create');

    armMutationIntent(state, 'customer.review');
    const review = await customer.request({
      phase: 'customer.review',
      method: 'POST',
      path: PREVIEW_API.reviews,
      body: {
        venueId: venues[0].id,
        venueTitle: drafts[0].title,
        rating: 5,
        review: expectedReviewBody(runId),
      },
      expected: [201],
    });
    const reviewCandidateId = retainMutationCandidate(
      state,
      'reviewCandidateId',
      review.data?.review?.id,
      'customer.review',
      'REVIEW_ID_INVALID',
    );
    invariant(review.data?.review?.status === 'pending', 'customer.review', 'REVIEW_NOT_PENDING');
    const authoritativeReview = await adminB.request({
      phase: 'customer.review.authoritative',
      path: PREVIEW_API.adminDashboard,
    });
    confirmAuthoritativeReview(state, authoritativeReview.data?.reviews, reviewCandidateId, {
      runId,
      customerId: state.customerId,
      phase: 'customer.review.authoritative',
    });
    acknowledgeMutationIntent(state, 'customer.review');

    await prepareMediaSubmission({
      admin: adminB,
      customer,
      fetchImpl: appFetch,
      expectedSupabaseProjectRef,
      identity,
      now,
      runId,
      state,
    });
    addCheck(report, 'customer', 'register-login-session-favorite-review-submission', { operations: 10 });

    const adminDashboard = await adminB.request({ phase: 'admin.dashboard', path: PREVIEW_API.adminDashboard });
    invariant(adminDashboard.data?.databaseConfigured === true, 'admin.dashboard', 'ADMIN_DATABASE_NOT_CONFIGURED');
    invariant(adminDashboard.data?.reviews?.some((item) => item?.id === state.reviewId && item?.status === 'pending'), 'admin.dashboard', 'PENDING_REVIEW_NOT_VISIBLE');
    invariant(adminDashboard.data?.submissions?.some((item) => item?.id === state.submissionId && item?.status === 'pending'), 'admin.dashboard', 'PENDING_SUBMISSION_NOT_VISIBLE');
    addCheck(report, 'admin-content', 'pending-moderation-visible', { pendingRecords: 2 });

    const mediaEvidence = await approveMediaSubmission({
      admin: adminB,
      expectedSupabaseProjectRef,
      fetchImpl: appFetch,
      runId,
      state,
    });
    report.media = { ...MEDIA_ACCEPTANCE_MODE, ...mediaEvidence };
    addCheck(report, 'media', 'signed-private-finalized-published-immutable', mediaEvidence);

    armMutationIntent(state, 'admin.merchant-create');
    const merchantCreated = await adminB.request({
      phase: 'admin.merchant-create',
      method: 'POST',
      path: PREVIEW_API.adminMerchants,
      body: {
        displayName: identity.merchant.displayName,
        username: identity.merchant.username,
        email: identity.merchant.email,
        password: identity.merchant.temporaryPassword,
        venueIds: [venues[0].id],
        membershipRole: 'owner',
      },
      expected: [201],
    });
    const merchantCandidateId = retainMutationCandidate(
      state,
      'merchantCandidateId',
      merchantCreated.data?.merchant?.id,
      'admin.merchant-create',
      'MERCHANT_ID_INVALID',
    );
    invariant(merchantCreated.data?.credentials?.login === identity.merchant.username, 'admin.merchant-create', 'MERCHANT_CREDENTIAL_CONTRACT_FAILED');
    const authoritativeMerchants = await adminB.request({
      phase: 'admin.merchant-create.authoritative',
      path: PREVIEW_API.adminMerchants,
    });
    confirmAuthoritativeMerchant(
      state,
      authoritativeMerchants.data?.merchants,
      merchantCandidateId,
      identity.merchant,
      'admin.merchant-create.authoritative',
    );
    acknowledgeMutationIntent(state, 'admin.merchant-create');

    armMutationIntent(state, 'merchant.login');
    const merchantLogin = await merchant.request({
      phase: 'merchant.login',
      method: 'POST',
      path: PREVIEW_API.authLogin,
      body: { login: identity.merchant.username, password: identity.merchant.temporaryPassword },
    });
    invariant(merchantLogin.data?.user?.role === 'merchant' && merchantLogin.data?.user?.mustChangePassword === true, 'merchant.login', 'MERCHANT_TEMPORARY_LOGIN_FAILED');
    const merchantLoginSession = await merchant.request({ phase: 'merchant.login-session', path: PREVIEW_API.authSession });
    invariant(
      merchantLoginSession.data?.authenticated === true
        && merchantLoginSession.data?.user?.id === state.merchantId
        && merchantLoginSession.data?.user?.role === 'merchant',
      'merchant.login-session',
      'MERCHANT_SESSION_IDENTITY_MISMATCH',
    );
    state.merchantSessionActive = true;
    acknowledgeMutationIntent(state, 'merchant.login');
    armMutationIntent(state, 'merchant.password-change');
    const changed = await merchant.request({
      phase: 'merchant.password-change',
      method: 'POST',
      path: PREVIEW_API.authPassword,
      body: { password: identity.merchant.password },
    });
    invariant(changed.data?.user?.mustChangePassword === false, 'merchant.password-change', 'MERCHANT_PASSWORD_CHANGE_FAILED');
    const merchantSession = await merchant.request({ phase: 'merchant.session', path: PREVIEW_API.authSession });
    invariant(
      merchantSession.data?.authenticated === true
        && merchantSession.data?.user?.id === state.merchantId
        && merchantSession.data?.user?.role === 'merchant'
        && merchantSession.data?.user?.mustChangePassword === false,
      'merchant.session',
      'MERCHANT_SESSION_NOT_ACTIVE',
    );
    state.currentMerchantPassword = identity.merchant.password;
    acknowledgeMutationIntent(state, 'merchant.password-change');
    const workspace = await merchant.request({ phase: 'merchant.dashboard', path: PREVIEW_API.merchantDashboard });
    invariant(workspace.data?.venues?.some((item) => item?.id === venues[0].id), 'merchant.dashboard', 'MERCHANT_ASSIGNMENT_MISSING');
    addCheck(report, 'merchant', 'assignment-login-password-change-dashboard', { operations: 5 });

    const contentPathA = `${PREVIEW_API.venueContent}?venueId=${encodeURIComponent(venues[0].id)}`;
    const contentPathB = `${PREVIEW_API.venueContent}?venueId=${encodeURIComponent(venues[1].id)}`;
    const warmA = await warmEntityCache(publicClient, contentPathA, 'cache.warm-a');
    const warmB = await warmEntityCache(publicClient, contentPathB, 'cache.warm-b');
    invariant(warmA.cachePop === warmB.cachePop, 'cache.warm', 'CACHE_BASELINE_POP_MISMATCH');

    const xssProbeInput = storedXssProbeInput(runId);
    const expectedPersistedXssTitle = expectedStoredXssPersistedTitle(runId);
    armMutationIntent(state, 'merchant.menu-create');
    const menu = await merchant.request({
      phase: 'merchant.menu-create',
      method: 'POST',
      path: PREVIEW_API.merchantMenu,
      body: {
        venueId: venues[0].id,
        section: 'Acceptance',
        title: xssProbeInput,
        description: expectedStoredXssDescription(runId, 'menu'),
        price: 1,
        isAvailable: true,
        sortOrder: 1,
      },
      expected: [201],
    });
    const menuId = retainMutationCandidate(
      state,
      'menuItemCandidateIds',
      menu.data?.item?.id,
      'merchant.menu-create',
      'MENU_ID_INVALID',
      { collection: true },
    );
    const authoritativeMenu = await merchant.request({
      phase: 'merchant.menu-create.authoritative',
      path: PREVIEW_API.merchantDashboard,
    });
    confirmAuthoritativeMerchantContent(state, authoritativeMenu.data?.menu, menuId, {
      kind: 'menu',
      runId,
      venueId: venues[0].id,
      phase: 'merchant.menu-create.authoritative',
    });
    acknowledgeMutationIntent(state, 'merchant.menu-create');

    const bAfterMutation = await publicClient.request({ phase: 'cache.unrelated-b', path: contentPathB });
    validateUnrelatedEntityCache(bAfterMutation, warmB, 'cache.unrelated-b');
    const invalidation = await observeEntityInvalidation(publicClient, {
      path: contentPathA,
      expectedItemId: menuId,
      phase: 'cache.relevant-a',
      baselineEtag: warmA.etag,
      baselineBodyDigest: warmA.bodyDigest,
      baselineCachePop: warmA.cachePop,
      baselineWarmedAt: warmA.warmedAt,
    });
    const bAfterRevalidation = await publicClient.request({ phase: 'cache.unrelated-b-confirm', path: contentPathB });
    validateUnrelatedEntityCache(bAfterRevalidation, warmB, 'cache.unrelated-b-confirm');
    addCheck(report, 'cache', 'entity-tag-purge-isolation', {
      warmAttempts: warmA.attempts + warmB.attempts,
      unrelatedState: bAfterMutation.cache,
      revalidationRequests: invalidation.requests,
      invalidationState: invalidation.state,
      freshState: invalidation.freshState,
      unrelatedConfirmationState: bAfterRevalidation.explicitCache,
    });

    armMutationIntent(state, 'merchant.promotion-create');
    const promotion = await merchant.request({
      phase: 'merchant.promotion-create',
      method: 'POST',
      path: PREVIEW_API.merchantPromotions,
      body: {
        venueId: venues[0].id,
        title: xssProbeInput,
        description: expectedStoredXssDescription(runId, 'promotion'),
        status: 'active',
      },
      expected: [201],
    });
    const promotionId = retainMutationCandidate(
      state,
      'promotionCandidateIds',
      promotion.data?.promotion?.id,
      'merchant.promotion-create',
      'PROMOTION_ID_INVALID',
      { collection: true },
    );
    const authoritativePromotion = await merchant.request({
      phase: 'merchant.promotion-create.authoritative',
      path: PREVIEW_API.merchantDashboard,
    });
    confirmAuthoritativeMerchantContent(state, authoritativePromotion.data?.promotions, promotionId, {
      kind: 'promotion',
      runId,
      venueId: venues[0].id,
      phase: 'merchant.promotion-create.authoritative',
    });
    acknowledgeMutationIntent(state, 'merchant.promotion-create');

    armMutationIntent(state, 'merchant.venue-update');
    const venueUpdated = await merchant.request({
      phase: 'merchant.venue-update',
      method: 'PATCH',
      path: PREVIEW_API.merchantVenue,
      body: { id: venues[0].id, description: `Merchant-owned acceptance mutation ${runId}.` },
    });
    invariant(venueUpdated.data?.venue?.description === `Merchant-owned acceptance mutation ${runId}.`, 'merchant.venue-update', 'MERCHANT_VENUE_UPDATE_FAILED');

    const reloadedWorkspace = await merchant.request({ phase: 'merchant.dashboard-reload', path: PREVIEW_API.merchantDashboard });
    const storedMenu = reloadedWorkspace.data?.menu?.find((item) => item?.id === menuId);
    const storedPromotion = reloadedWorkspace.data?.promotions?.find((item) => item?.id === promotionId);
    invariant(
      reloadedWorkspace.data?.venues?.some((item) => item?.id === venues[0].id
        && item?.description === `Merchant-owned acceptance mutation ${runId}.`),
      'merchant.dashboard-reload',
      'MERCHANT_VENUE_UPDATE_NOT_PERSISTED',
    );
    acknowledgeMutationIntent(state, 'merchant.venue-update');
    invariant(
      storedMenu && storedMenu.title === expectedPersistedXssTitle,
      'merchant.dashboard-reload',
      'MENU_PAYLOAD_NOT_PERSISTED',
    );
    invariant(
      storedPromotion && storedPromotion.title === expectedPersistedXssTitle,
      'merchant.dashboard-reload',
      'PROMOTION_PAYLOAD_NOT_PERSISTED',
    );

    const publicContent = await waitForPublicContent(publicClient, {
      path: contentPathA,
      menuId,
      promotionId,
      phase: 'xss.public-api-reload',
    });

    for (let reload = 0; reload < 2; reload += 1) {
      const document = await publicClient.request({
        phase: `xss.document-reload-${reload + 1}`,
        path: `/venue/${encodeURIComponent(venues[0].slug)}`,
        responseType: 'text',
      });
      const executableProbe = new RegExp(`<img[^>]*data-mesto-acceptance=["']?${runId}`, 'i');
      invariant(!executableProbe.test(document.data), `xss.document-reload-${reload + 1}`, 'STORED_XSS_EXECUTABLE_MARKUP');
    }
    let browserOracle;
    try {
      browserOracle = await verifyStoredXssBrowser({
        baseUrl,
        venueSlug: venues[0].slug,
        expectedTitle: drafts[0].title,
        probeToken: runId,
        bypassSecret,
        executablePath: browserExecutablePath,
      });
    } catch (error) {
      throw new AcceptanceError(
        'xss.browser',
        SAFE_ERROR_CODE.test(String(error?.code || '')) ? error.code : 'BROWSER_XSS_ORACLE_FAILED',
      );
    }
    addCheck(report, 'stored-xss', 'merchant-menu-promotion-api-and-document-reload', {
      reloads: publicContent.requests + 2 + browserOracle.reloads,
      browserObservations: browserOracle.observations,
      executableMarkup: false,
    });
  } catch (error) {
    workflowFailure = safeFailure(error);
    const armedPhase = String(state.mutationIntent?.phase || '');
    if (armedPhase || workflowFailure.code.startsWith('AMBIGUOUS_MUTATION_')) {
      state.ambiguousMutation = {
        ...workflowFailure,
        phase: armedPhase || workflowFailure.phase,
        observedFailurePhase: workflowFailure.phase,
      };
    }
  } finally {
    report.cleanup = await cleanupArtifacts(state, context);
  }

  if (report.cleanup.mediaReaperProof?.completed) {
    const evidence = report.cleanup.mediaReaperProof.evidence;
    addCheck(report, 'media-reaper', evidence.evidenceName, {
      unauthenticatedStatus: evidence.unauthenticatedStatus,
      authenticatedStatus: evidence.authenticatedStatus,
      noStore: evidence.noStore,
      drained: evidence.drained,
      counts: evidence.counts,
      hasMore: evidence.hasMore,
      productionScheduleProven: evidence.productionScheduleProven,
      abandonedMediaAbsenceProof: evidence.abandonedMediaAbsenceProof,
    });
  }

  if (workflowFailure) report.failure = workflowFailure;
  if (!report.cleanup.complete && !report.failure) {
    report.failure = { phase: 'cleanup', code: 'CLEANUP_INCOMPLETE' };
  }
  report.passed = !report.failure && report.cleanup.complete;
  report.durationMs = Date.now() - startedAt;
  return {
    report,
    sensitiveValues: [
      adminLogin,
      adminPassword,
      bypassSecret,
      validatedCronSecret,
      identity.customer.displayName,
      identity.customer.email,
      identity.customer.username,
      identity.customer.password,
      identity.merchant.displayName,
      identity.merchant.email,
      identity.merchant.username,
      identity.merchant.temporaryPassword,
      identity.merchant.password,
    ],
  };
}

async function main() {
  const startedAt = Date.now();
  try {
    const options = parsePreviewAcceptanceArguments(process.argv.slice(2));
    const credentials = acceptanceCredentials(process.env);
    const linked = linkedVercelProject();
    const expectation = previewProviderExpectation(process.env);
    const configuredTeamId = String(process.env.MESTO_ACCEPTANCE_VERCEL_TEAM_ID || '').trim();
    const result = await runPreviewAcceptance({
      ...options,
      ...credentials,
      projectId: linked.projectId,
      teamId: configuredTeamId || linked.teamId,
      vercelToken: process.env.VERCEL_TOKEN,
      expectedSupabaseProjectRef: expectation.supabaseProjectRef,
      forbiddenProductionSupabaseProjectRef: expectation.forbiddenProductionSupabaseProjectRef,
      expectedRedisNamespace: expectation.redisNamespace,
      expectedRedisProvidersFingerprint: expectation.redisProvidersFingerprint,
      forbiddenProductionRedisProvidersFingerprint: expectation.forbiddenProductionRedisProvidersFingerprint,
    });
    console.log(JSON.stringify(redactForReport(result.report, { sensitiveValues: result.sensitiveValues }), null, 2));
    if (!result.report.passed) process.exitCode = 1;
  } catch (error) {
    const report = {
      schemaVersion: 1,
      kind: 'mesto.preview.acceptance',
      passed: false,
      failure: safeFailure(error),
      durationMs: Date.now() - startedAt,
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
