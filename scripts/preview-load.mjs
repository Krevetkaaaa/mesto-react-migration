import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const PRODUCTION_ORIGIN = 'https://mesto-city-guide.vercel.app';
const DEPLOYMENT_ID_PATTERN = /^dpl_[A-Za-z0-9]{16,}$/;
const PROJECT_ID_PATTERN = /^prj_[A-Za-z0-9]+$/;
const TEAM_ID_PATTERN = /^team_[A-Za-z0-9]+$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{8,40}$/;
const LOAD_ERROR_CATEGORIES = Object.freeze(['timeout', 'aborted', 'transport', 'response-validation']);
const MAX_ERROR_CAUSE_DEPTH = 3;
const MAX_ERROR_NODES = 8;
const MAX_AGGREGATE_ERRORS = 3;
const SAFE_TRANSPORT_ERROR_CODES = new Set([
  'ECONNRESET',
  'EADDRNOTAVAIL',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENOBUFS',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_OVERFLOW'
]);
const SAFE_RESPONSE_VALIDATION_CODES = new Set(['BODY_CAP', 'DOCUMENT']);
const SAFE_LOAD_ERROR_CODES = new Set([
  'REQUEST_TIMEOUT',
  'REQUEST_ABORTED',
  'NETWORK_FAILURE',
  'RESPONSE_VALIDATION_FAILURE',
  ...SAFE_TRANSPORT_ERROR_CODES,
  ...[...SAFE_RESPONSE_VALIDATION_CODES].map((code) => `RESPONSE_${code}`)
]);

class PreviewLoadResponseValidationError extends Error {
  constructor(code, message = 'Preview response validation failed') {
    super(message);
    this.name = 'PreviewLoadResponseValidationError';
    this.code = code;
  }
}

export const PREVIEW_LOAD_STAGES = Object.freeze({
  expected: Object.freeze({
    virtualUsers: 100,
    cycles: 5,
    thinkTimeMs: 500,
    minimumThroughputRps: 40,
    latency: Object.freeze({ p95: 1_000, p99: 2_500 })
  }),
  burst: Object.freeze({
    virtualUsers: 300,
    cycles: 1,
    thinkTimeMs: 0,
    minimumThroughputRps: 40,
    latency: Object.freeze({ p95: 2_000, p99: 5_000 })
  }),
  soak: Object.freeze({
    virtualUsers: 100,
    cycles: 60,
    thinkTimeMs: 10_000,
    minimumThroughputRps: 8,
    latency: Object.freeze({ p95: 1_000, p99: 2_500 })
  })
});

export const EDGE_DOCUMENT_PATHS = Object.freeze([
  '/',
  '/catalog',
  '/catalog?city=%D0%A1%D0%B8%D0%BC%D1%84%D0%B5%D1%80%D0%BE%D0%BF%D0%BE%D0%BB%D1%8C',
  '/venue/barkas'
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)].toFixed(2));
}

function normalizedVercelOrigin(value, label) {
  let target;
  try {
    target = new URL(String(value || ''));
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  invariant(target.protocol === 'https:', `${label} must use HTTPS`);
  invariant(!target.username && !target.password, `${label} must not contain credentials`);
  invariant(!target.port, `${label} must not use a nonstandard port`);
  invariant(target.pathname === '/' && !target.search && !target.hash, `${label} must be an origin`);
  const hostname = target.hostname.toLowerCase();
  invariant(hostname !== 'vercel.app' && hostname.endsWith('.vercel.app'), `${label} must be a Vercel Preview origin`);
  invariant(
    hostname.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)),
    `${label} has an invalid hostname`
  );
  return target.origin;
}

export function validatePreviewLoadTarget(value, allowedOrigin) {
  const target = normalizedVercelOrigin(value, 'Preview load target');
  invariant(target !== PRODUCTION_ORIGIN, 'Production load is forbidden');
  const allowlisted = normalizedVercelOrigin(allowedOrigin, 'Preview load allowlist');
  invariant(allowlisted !== PRODUCTION_ORIGIN, 'Production load allowlist is forbidden');
  invariant(allowlisted === target, 'Preview load target must exactly match MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN');
  return target;
}

export function resolveExpectedPreviewCommitSha(value, environment = process.env) {
  const commandLineValue = String(value || '').trim();
  const environmentValue = String(environment.MESTO_EXPECTED_PREVIEW_COMMIT_SHA || '').trim();
  invariant(
    !commandLineValue
      || !environmentValue
      || commandLineValue.toLowerCase() === environmentValue.toLowerCase(),
    '--expected-commit-sha must match MESTO_EXPECTED_PREVIEW_COMMIT_SHA when both are set'
  );
  const commitSha = commandLineValue || environmentValue;
  invariant(
    COMMIT_SHA_PATTERN.test(commitSha),
    '--expected-commit-sha or MESTO_EXPECTED_PREVIEW_COMMIT_SHA must be exactly 40 hexadecimal characters'
  );
  return commitSha.toLowerCase();
}

export function previewProviderExpectation(environment = process.env) {
  const supabaseProjectRef = String(
    environment.MESTO_EXPECTED_PREVIEW_SUPABASE_PROJECT_REF || ''
  ).trim();
  const forbiddenProductionSupabaseProjectRef = String(
    environment.MESTO_FORBIDDEN_PRODUCTION_SUPABASE_PROJECT_REF || ''
  ).trim();
  const redisNamespace = String(environment.MESTO_LOAD_EXPECTED_REDIS_NAMESPACE || 'preview').trim();
  const redisProvidersFingerprint = String(
    environment.MESTO_EXPECTED_PREVIEW_REDIS_PROVIDERS_FINGERPRINT || ''
  ).trim();
  const forbiddenProductionRedisProvidersFingerprint = String(
    environment.MESTO_FORBIDDEN_PRODUCTION_REDIS_PROVIDERS_FINGERPRINT || ''
  ).trim();
  invariant(
    SUPABASE_PROJECT_REF_PATTERN.test(supabaseProjectRef),
    'MESTO_EXPECTED_PREVIEW_SUPABASE_PROJECT_REF must be a canonical project ref'
  );
  invariant(
    SUPABASE_PROJECT_REF_PATTERN.test(forbiddenProductionSupabaseProjectRef),
    'MESTO_FORBIDDEN_PRODUCTION_SUPABASE_PROJECT_REF must be a canonical project ref'
  );
  invariant(
    supabaseProjectRef !== forbiddenProductionSupabaseProjectRef,
    'Preview and Production Supabase project refs must differ'
  );
  invariant(redisNamespace === 'preview', 'MESTO_LOAD_EXPECTED_REDIS_NAMESPACE must be preview');
  invariant(
    /^[A-Za-z0-9_-]{43}$/.test(redisProvidersFingerprint),
    'MESTO_EXPECTED_PREVIEW_REDIS_PROVIDERS_FINGERPRINT must be a SHA-256 base64url digest'
  );
  invariant(
    /^[A-Za-z0-9_-]{43}$/.test(forbiddenProductionRedisProvidersFingerprint),
    'MESTO_FORBIDDEN_PRODUCTION_REDIS_PROVIDERS_FINGERPRINT must be a SHA-256 base64url digest'
  );
  invariant(
    redisProvidersFingerprint !== forbiddenProductionRedisProvidersFingerprint,
    'Preview and Production Redis provider fingerprints must differ'
  );
  return {
    supabaseProjectRef,
    forbiddenProductionSupabaseProjectRef,
    redisNamespace,
    redisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint
  };
}

export function linkedVercelProject(projectFile = new URL('../.vercel/project.json', import.meta.url)) {
  let project;
  try {
    project = JSON.parse(readFileSync(projectFile, 'utf8'));
  } catch {
    throw new Error('The linked Vercel project configuration is unavailable');
  }
  invariant(PROJECT_ID_PATTERN.test(String(project?.projectId || '')), 'The linked Vercel project ID is invalid');
  invariant(TEAM_ID_PATTERN.test(String(project?.orgId || '')), 'The linked Vercel team ID is invalid');
  return { projectId: project.projectId, teamId: project.orgId };
}

export function parsePreviewLoadArguments(args, environment = process.env) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === '--acknowledge-preview-load') {
      invariant(!values.has(option), `Duplicate Preview load option: ${option}`);
      values.set(option, true);
      continue;
    }
    invariant(
      ['--base-url', '--deployment-id', '--expected-commit-sha', '--stage'].includes(option),
      `Unknown Preview load option: ${option}`
    );
    const value = args[index + 1];
    invariant(value && !value.startsWith('--'), `${option} requires a value`);
    invariant(!values.has(option), `Duplicate Preview load option: ${option}`);
    values.set(option, value);
    index += 1;
  }
  invariant(values.has('--acknowledge-preview-load'), '--acknowledge-preview-load is required');
  const deploymentId = String(values.get('--deployment-id') || '');
  invariant(DEPLOYMENT_ID_PATTERN.test(deploymentId), '--deployment-id must be an exact Vercel deployment ID');
  const stageName = String(values.get('--stage') || '');
  invariant(Object.hasOwn(PREVIEW_LOAD_STAGES, stageName), 'Preview load stage must be expected, burst, or soak');
  return {
    baseUrl: validatePreviewLoadTarget(values.get('--base-url'), environment.MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN),
    deploymentId,
    expectedCommitSha: resolveExpectedPreviewCommitSha(values.get('--expected-commit-sha'), environment),
    stageName
  };
}

function deploymentCommitSha(payload) {
  const commitSha = String(payload?.meta?.githubCommitSha || payload?.meta?.gitCommitSha || '').trim();
  invariant(COMMIT_SHA_PATTERN.test(commitSha), 'Vercel deployment commit proof failed');
  return commitSha.toLowerCase();
}

export async function verifyPreviewDeployment({
  baseUrl,
  deploymentId,
  projectId,
  expectedCommitSha,
  teamId,
  token,
  fetchImpl = fetch
}) {
  const target = normalizedVercelOrigin(baseUrl, 'Preview load target');
  invariant(target !== PRODUCTION_ORIGIN, 'Production load is forbidden');
  invariant(DEPLOYMENT_ID_PATTERN.test(String(deploymentId || '')), 'Exact Vercel deployment ID is required');
  const normalizedExpectedCommitSha = resolveExpectedPreviewCommitSha(expectedCommitSha, {});
  const linked = projectId ? null : linkedVercelProject();
  const expectedProjectId = String(projectId || linked?.projectId || '');
  invariant(PROJECT_ID_PATTERN.test(expectedProjectId), 'Exact Vercel project ID is required');
  invariant(TEAM_ID_PATTERN.test(String(teamId || '')), 'Vercel team ID is required');
  invariant(String(token || '').trim(), 'VERCEL_TOKEN is required to prove the deployment environment');

  const endpoint = new URL(`https://api.vercel.com/v13/deployments/${deploymentId}`);
  endpoint.searchParams.set('teamId', teamId);
  const response = await fetchImpl(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(5_000)
  });
  const payload = await response.json().catch(() => null);
  invariant(response.ok && payload?.id === deploymentId, 'Vercel deployment proof failed');
  invariant(payload.projectId === expectedProjectId, 'Vercel deployment belongs to a different project');
  invariant(payload.target === null, 'Only an immutable Preview deployment may be load-tested');
  invariant(payload.readyState === 'READY', 'Preview deployment must be READY');
  invariant(payload.url === new URL(target).hostname, 'Load target must be the immutable URL of the proven Preview deployment');
  const actualCommitSha = deploymentCommitSha(payload);
  invariant(
    actualCommitSha === normalizedExpectedCommitSha,
    'Vercel deployment commit does not match expected Preview commit SHA'
  );

  return {
    deploymentId,
    projectId: expectedProjectId,
    commitSha: actualCommitSha,
    expectedCommitSha: normalizedExpectedCommitSha,
    actualCommitSha,
    readyState: payload.readyState,
    target: 'preview'
  };
}

async function boundedBytes(response, maximumBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    await response.body?.cancel().catch(() => {});
    throw new PreviewLoadResponseValidationError('BODY_CAP', 'Preview response exceeded the byte cap');
  }
  if (!response.body) return { bytes: 0, buffer: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return { bytes: total, buffer: Buffer.concat(chunks, total) };
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel().catch(() => {});
      throw new PreviewLoadResponseValidationError('BODY_CAP', 'Preview response exceeded the byte cap');
    }
    chunks.push(Buffer.from(value));
  }
}

export async function boundedBody(response, maximumBytes = MAX_RESPONSE_BYTES) {
  return (await boundedBytes(response, maximumBytes)).bytes;
}

async function boundedText(response, maximumBytes = MAX_RESPONSE_BYTES) {
  const body = await boundedBytes(response, maximumBytes);
  return { bytes: body.bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(body.buffer) };
}

export function edgeDocumentCacheHit(headers) {
  const explicitState = headers.get('x-vercel-cache');
  if (explicitState !== null) {
    return String(explicitState).trim().toUpperCase() === 'HIT';
  }
  return Number(headers.get('age') || 0) > 0;
}

function documentMarkers(url) {
  if (url.pathname === '/') return ['data-react-route="home"', 'id="guide"'];
  if (url.pathname === '/catalog') return ['data-react-route="catalog"', 'id="catalog-view"'];
  if (url.pathname === '/venue/barkas') return ['data-react-route="catalog"', 'id="venue-dialog"'];
  throw new Error(`No stable app marker is declared for ${url.pathname}`);
}

export function validateEdgeDocumentResponse({ url, response, body }) {
  invariant(response.status === 200, `Preview document failed for ${url.pathname}: HTTP ${response.status}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  invariant(contentType.split(';', 1)[0].trim() === 'text/html', `Preview document is not HTML for ${url.pathname}`);
  invariant(/<!doctype\s+html/i.test(body) && /<main(?:\s|>)/i.test(body), `Preview app shell marker is missing for ${url.pathname}`);
  for (const marker of documentMarkers(url)) {
    invariant(body.includes(marker), `Preview route marker is missing for ${url.pathname}`);
  }
  return true;
}

export async function verifyPreviewReleaseFingerprint({
  baseUrl,
  expectedDeploymentId,
  expectedProjectId,
  expectedSupabaseProjectRef,
  forbiddenProductionSupabaseProjectRef,
  expectedRedisNamespace = 'preview',
  expectedRedisProvidersFingerprint,
  forbiddenProductionRedisProvidersFingerprint,
  bypassSecret = '',
  fetchImpl = fetch
}) {
  invariant(
    SUPABASE_PROJECT_REF_PATTERN.test(String(expectedSupabaseProjectRef || '')),
    'Expected Preview Supabase project ref is required'
  );
  invariant(expectedRedisNamespace === 'preview', 'Expected Redis namespace must be preview');
  invariant(
    /^[A-Za-z0-9_-]{43}$/.test(String(expectedRedisProvidersFingerprint || '')),
    'Expected Preview Redis providers fingerprint is required'
  );
  invariant(
    SUPABASE_PROJECT_REF_PATTERN.test(String(forbiddenProductionSupabaseProjectRef || '')),
    'Forbidden Production Supabase project ref is required'
  );
  invariant(
    /^[A-Za-z0-9_-]{43}$/.test(String(forbiddenProductionRedisProvidersFingerprint || '')),
    'Forbidden Production Redis providers fingerprint is required'
  );
  invariant(
    DEPLOYMENT_ID_PATTERN.test(String(expectedDeploymentId || '')),
    'Expected Vercel deployment ID is required'
  );
  invariant(
    PROJECT_ID_PATTERN.test(String(expectedProjectId || '')),
    'Expected Vercel project ID is required'
  );
  const expectedDeploymentHost = new URL(baseUrl).hostname;
  const headers = {
    Accept: 'application/json',
    ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {})
  };
  const response = await fetchImpl(new URL('/api/release-fingerprint', baseUrl), {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  invariant(response.status === 200, `Preview release fingerprint failed: HTTP ${response.status}`);
  invariant(
    String(response.headers.get('content-type') || '').toLowerCase().split(';', 1)[0].trim() === 'application/json',
    'Preview release fingerprint did not return JSON'
  );
  const { text } = await boundedText(response);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Preview release fingerprint returned invalid JSON');
  }
  invariant(payload?.kind === 'mesto.release-provider-identity', 'Preview release fingerprint kind is invalid');
  invariant(payload.environment !== 'production', 'Production runtime fingerprint is forbidden');
  invariant(payload.redisNamespace !== 'production', 'Production Redis namespace is forbidden');
  invariant(
    payload.supabaseProjectRef !== forbiddenProductionSupabaseProjectRef,
    'Production Supabase provider is forbidden'
  );
  invariant(
    payload.redisProvidersFingerprint !== forbiddenProductionRedisProvidersFingerprint,
    'Production Redis providers are forbidden'
  );
  invariant(payload.environment === 'preview', 'Runtime fingerprint environment must be preview');
  invariant(payload.deploymentId === expectedDeploymentId, 'Runtime deployment ID does not match Preview');
  invariant(payload.projectId === expectedProjectId, 'Runtime project ID does not match Preview');
  invariant(payload.deploymentHost === expectedDeploymentHost, 'Runtime deployment host does not match Preview');
  invariant(payload.redisNamespace === expectedRedisNamespace, 'Runtime Redis namespace does not match Preview');
  invariant(
    payload.redisProvidersFingerprint === expectedRedisProvidersFingerprint,
    'Runtime Redis providers do not match the isolated Preview resources'
  );
  invariant(payload.supabaseProjectRef === expectedSupabaseProjectRef, 'Runtime Supabase project ref does not match Preview');
  invariant(/^[A-Za-z0-9_-]{43}$/.test(String(payload.fingerprint || '')), 'Runtime provider fingerprint digest is invalid');
  const expectedFingerprint = createHash('sha256')
    .update(JSON.stringify([
      payload.environment,
      payload.deploymentId,
      payload.projectId,
      payload.deploymentHost,
      payload.redisNamespace,
      payload.redisProvidersFingerprint,
      payload.supabaseProjectRef
    ]))
    .digest('base64url');
  invariant(payload.fingerprint === expectedFingerprint, 'Runtime provider fingerprint digest does not match its identity');
  return Object.freeze({
    environment: payload.environment,
    deploymentId: payload.deploymentId,
    projectId: payload.projectId,
    deploymentHost: payload.deploymentHost,
    redisNamespace: payload.redisNamespace,
    redisProvidersFingerprint: payload.redisProvidersFingerprint,
    supabaseProjectRef: payload.supabaseProjectRef,
    fingerprint: payload.fingerprint
  });
}

async function requestDocument(url, headers = {}, fetchImpl = fetch, now = () => performance.now(), startedAt = now()) {
  const response = await fetchImpl(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const body = await boundedBytes(response);
  if (response.status === 200) {
    try {
      validateEdgeDocumentResponse({
        url,
        response,
        body: new TextDecoder('utf-8', { fatal: true }).decode(body.buffer)
      });
    } catch {
      throw new PreviewLoadResponseValidationError('DOCUMENT');
    }
  }
  return {
    bytes: body.bytes,
    edgeDocumentCacheHit: edgeDocumentCacheHit(response.headers),
    latencyMs: now() - startedAt,
    status: response.status
  };
}

function safeErrorProperty(error, property) {
  try {
    return error?.[property];
  } catch {
    return undefined;
  }
}

function safeErrorCode(error) {
  const code = safeErrorProperty(error, 'code');
  return typeof code === 'string' ? code : '';
}

function safeAggregateEntries(errors) {
  try {
    if (!Array.isArray(errors)) return [];
    const length = Number.isSafeInteger(errors.length) ? Math.min(errors.length, MAX_AGGREGATE_ERRORS) : 0;
    const entries = [];
    for (let index = 0; index < length; index += 1) entries.push(errors[index]);
    return entries;
  } catch {
    return [];
  }
}

function isResponseValidationError(error) {
  try {
    return error instanceof PreviewLoadResponseValidationError;
  } catch {
    return false;
  }
}

function errorNodes(error) {
  const nodes = [];
  const queue = [{ error, depth: 0 }];
  const seen = new Set();
  while (queue.length && nodes.length < MAX_ERROR_NODES) {
    const { error: current, depth } = queue.shift();
    if ((!current || (typeof current !== 'object' && typeof current !== 'function')) || seen.has(current)) continue;
    seen.add(current);
    nodes.push(current);
    if (depth >= MAX_ERROR_CAUSE_DEPTH) continue;
    const cause = safeErrorProperty(current, 'cause');
    if (cause && (typeof cause === 'object' || typeof cause === 'function')) {
      queue.push({ error: cause, depth: depth + 1 });
    }
    for (const nested of safeAggregateEntries(safeErrorProperty(current, 'errors'))) {
      queue.push({ error: nested, depth: depth + 1 });
    }
  }
  return nodes;
}

function errorMetadata(error) {
  if (isResponseValidationError(error)) {
    const responseCode = safeErrorCode(error);
    return {
      category: 'response-validation',
      code: SAFE_RESPONSE_VALIDATION_CODES.has(responseCode)
        ? `RESPONSE_${responseCode}`
        : 'RESPONSE_VALIDATION_FAILURE'
    };
  }
  const name = safeErrorProperty(error, 'name');
  const code = safeErrorCode(error);
  if (name === 'TimeoutError') return { category: 'timeout', code: 'REQUEST_TIMEOUT' };
  if (name === 'AbortError' || code === 'ABORT_ERR') return { category: 'aborted', code: 'REQUEST_ABORTED' };
  for (const current of errorNodes(error)) {
    const nestedCode = safeErrorCode(current);
    if (SAFE_TRANSPORT_ERROR_CODES.has(nestedCode)) {
      return { category: 'transport', code: nestedCode };
    }
  }
  return { category: 'transport', code: 'NETWORK_FAILURE' };
}

function measuredLatency(elapsedMs, category) {
  if (category === 'timeout' || category === 'aborted') return REQUEST_TIMEOUT_MS;
  const numericElapsed = Number(elapsedMs);
  return Number.isFinite(numericElapsed) && numericElapsed >= 0
    ? Number(numericElapsed.toFixed(2))
    : 0;
}

export async function collectPreviewLoadSample({
  url,
  headers = {},
  fetchImpl = fetch,
  now = () => performance.now()
}) {
  const startedAt = now();
  try {
    return await requestDocument(url, headers, fetchImpl, now, startedAt);
  } catch (error) {
    const failure = errorMetadata(error);
    return {
      bytes: 0,
      edgeDocumentCacheHit: false,
      latencyMs: measuredLatency(now() - startedAt, failure.category),
      status: 0,
      transportError: failure.category !== 'response-validation',
      responseValidationError: failure.category === 'response-validation',
      errorCategory: failure.category,
      errorCode: failure.code
    };
  }
}

export async function warmPreviewCache(baseUrl, { bypassSecret = '', fetchImpl = fetch } = {}) {
  const headers = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
  for (const pathname of EDGE_DOCUMENT_PATHS) {
    let warmed = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await requestDocument(new URL(pathname, baseUrl), headers, fetchImpl);
      invariant(response.status === 200, `Preview warmup failed for ${pathname}: HTTP ${response.status}`);
      if (response.edgeDocumentCacheHit) {
        warmed = true;
        break;
      }
      await delay(250);
    }
    invariant(warmed, `Preview edge document cache did not report HIT/Age for ${pathname}`);
  }
}

export function summarizePreviewLoad(samples, elapsedMs) {
  const latencies = samples.map((sample) => sample.latencyMs).sort((left, right) => left - right);
  const statuses = {};
  let edgeDocumentCacheHits = 0;
  let bytes = 0;
  let transportErrors = 0;
  let responseValidationErrors = 0;
  const errorCategories = Object.fromEntries(LOAD_ERROR_CATEGORIES.map((category) => [category, 0]));
  const errorCodes = {};
  for (const sample of samples) {
    if (sample.transportError) transportErrors += 1;
    if (sample.responseValidationError) responseValidationErrors += 1;
    if (LOAD_ERROR_CATEGORIES.includes(sample.errorCategory)) {
      errorCategories[sample.errorCategory] += 1;
    }
    if (SAFE_LOAD_ERROR_CODES.has(sample.errorCode)) {
      errorCodes[sample.errorCode] = (errorCodes[sample.errorCode] || 0) + 1;
    }
    if (sample.status) statuses[sample.status] = (statuses[sample.status] || 0) + 1;
    if (sample.edgeDocumentCacheHit) edgeDocumentCacheHits += 1;
    bytes += sample.bytes || 0;
  }
  return {
    profile: 'edge-document-cache',
    requests: samples.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    throughputRps: Number((samples.length / (elapsedMs / 1000)).toFixed(2)),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99)
    },
    statuses,
    transportErrors,
    responseValidationErrors,
    errorCategories,
    errorCodes,
    responseBytes: bytes,
    edgeDocumentCacheHits,
    edgeDocumentCacheHitRatio: Number((edgeDocumentCacheHits / Math.max(1, samples.length)).toFixed(4))
  };
}

export function evaluatePreviewLoad(summary, stage) {
  const failures = [];
  const expectedRequests = stage.virtualUsers * stage.cycles;
  const unexpectedStatuses = Object.entries(summary.statuses)
    .filter(([status]) => Number(status) !== 200)
    .reduce((total, [, count]) => total + count, 0);
  if (summary.transportErrors) failures.push(`${summary.transportErrors} transport errors`);
  if (summary.responseValidationErrors) failures.push(`${summary.responseValidationErrors} response validation errors`);
  if (summary.requests !== expectedRequests) failures.push(`${summary.requests} requests completed, expected ${expectedRequests}`);
  if (unexpectedStatuses) failures.push(`${unexpectedStatuses} non-200 responses`);
  if (summary.latencyMs.p95 === null || summary.latencyMs.p95 > stage.latency.p95) {
    failures.push(`p95 ${summary.latencyMs.p95}ms > ${stage.latency.p95}ms`);
  }
  if (summary.latencyMs.p99 === null || summary.latencyMs.p99 > stage.latency.p99) {
    failures.push(`p99 ${summary.latencyMs.p99}ms > ${stage.latency.p99}ms`);
  }
  if (summary.edgeDocumentCacheHitRatio < 0.9) {
    failures.push(`edge document cache hit ratio ${summary.edgeDocumentCacheHitRatio} < 0.9`);
  }
  if (summary.throughputRps < stage.minimumThroughputRps) {
    failures.push(`throughput ${summary.throughputRps}rps < ${stage.minimumThroughputRps}rps`);
  }
  return { passed: failures.length === 0, failures };
}

export async function runPreviewLoad({
  baseUrl,
  allowedOrigin,
  deploymentId,
  expectedCommitSha,
  projectId,
  stageName,
  expectedSupabaseProjectRef,
  forbiddenProductionSupabaseProjectRef,
  expectedRedisNamespace = 'preview',
  expectedRedisProvidersFingerprint,
  forbiddenProductionRedisProvidersFingerprint,
  bypassSecret = '',
  teamId,
  vercelToken,
  deploymentFetch,
  appFetch = fetch,
  now = () => new Date()
}) {
  const target = validatePreviewLoadTarget(baseUrl, allowedOrigin);
  const stage = PREVIEW_LOAD_STAGES[stageName];
  invariant(stage, `Unknown Preview load stage: ${stageName}`);
  const startedAt = now().toISOString();
  const deployment = await verifyPreviewDeployment({
    baseUrl: target,
    deploymentId,
    projectId,
    expectedCommitSha,
    teamId,
    token: vercelToken,
    fetchImpl: deploymentFetch || fetch
  });
  const providerIdentity = await verifyPreviewReleaseFingerprint({
    baseUrl: target,
    expectedDeploymentId: deployment.deploymentId,
    expectedProjectId: deployment.projectId,
    expectedSupabaseProjectRef,
    forbiddenProductionSupabaseProjectRef,
    expectedRedisNamespace,
    expectedRedisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint,
    bypassSecret,
    fetchImpl: appFetch
  });

  await warmPreviewCache(target, { bypassSecret, fetchImpl: appFetch });
  const headers = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
  const samples = [];
  let sequence = 0;
  const loadStartedAt = performance.now();

  async function worker(workerIndex) {
    for (let cycle = 0; cycle < stage.cycles; cycle += 1) {
      const pathname = stageName === 'burst'
        ? '/venue/barkas'
        : EDGE_DOCUMENT_PATHS[(sequence++) % EDGE_DOCUMENT_PATHS.length];
      samples.push(await collectPreviewLoadSample({
        url: new URL(pathname, target),
        headers,
        fetchImpl: appFetch
      }));
      if (cycle + 1 < stage.cycles) {
        const jitter = (workerIndex * 37 + cycle * 17) % 251;
        await delay(stage.thinkTimeMs + jitter);
      }
    }
  }

  await Promise.all(Array.from({ length: stage.virtualUsers }, (_, index) => worker(index)));
  const summary = summarizePreviewLoad(samples, performance.now() - loadStartedAt);
  const slo = evaluatePreviewLoad(summary, stage);
  return {
    schemaVersion: 1,
    kind: 'mesto.preview.edge-document-load',
    target,
    stage: stageName,
    configuration: stage,
    evidenceManifest: {
      deploymentId: deployment.deploymentId,
      projectId: deployment.projectId,
      commitSha: deployment.commitSha,
      expectedCommitSha: deployment.expectedCommitSha,
      actualCommitSha: deployment.actualCommitSha,
      startedAt,
      completedAt: now().toISOString(),
      providerIdentity
    },
    summary,
    slo
  };
}

async function main() {
  const options = parsePreviewLoadArguments(process.argv.slice(2));
  const linked = linkedVercelProject();
  const configuredTeamId = String(process.env.MESTO_LOAD_VERCEL_TEAM_ID || '').trim();
  const expectation = previewProviderExpectation(process.env);
  const result = await runPreviewLoad({
    ...options,
    allowedOrigin: process.env.MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN,
    bypassSecret: process.env.MESTO_PREVIEW_BYPASS_SECRET || '',
    projectId: linked.projectId,
    teamId: configuredTeamId || linked.teamId,
    vercelToken: process.env.VERCEL_TOKEN,
    expectedSupabaseProjectRef: expectation.supabaseProjectRef,
    forbiddenProductionSupabaseProjectRef: expectation.forbiddenProductionSupabaseProjectRef,
    expectedRedisNamespace: expectation.redisNamespace,
    expectedRedisProvidersFingerprint: expectation.redisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint: expectation.forbiddenProductionRedisProvidersFingerprint
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.slo.passed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || 'Preview load failed');
    process.exitCode = 1;
  });
}
