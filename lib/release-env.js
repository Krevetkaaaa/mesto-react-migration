const { createHash } = require('node:crypto');

const { configuration: adminRevocationConfiguration } = require('./admin-session-revocation');
const { configuration: rateLimitConfiguration } = require('./rate-limit');
const { validateAdminSessionSecret } = require('./security');

class ReleaseEnvironmentError extends Error {
  constructor(failures) {
    super(`Release environment preflight failed: ${failures.join('; ')}`);
    this.name = 'ReleaseEnvironmentError';
    this.code = 'RELEASE_ENV_INVALID';
    this.failures = Object.freeze([...failures]);
  }
}

function text(environment, name) {
  return String(environment[name] || '').trim();
}

function required(environment, name, failures, minimumLength = 1) {
  const value = text(environment, name);
  if (value.length < minimumLength) failures.push(`${name} is missing or too short`);
  return value;
}

function httpsOrigin(value, name, failures, { supabase = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    failures.push(`${name} must be a valid HTTPS origin`);
    return null;
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    failures.push(`${name} must be a credential-free HTTPS origin`);
    return null;
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    failures.push(`${name} must not target loopback`);
  }
  if (supabase && !url.hostname.endsWith('.supabase.co')) {
    failures.push(`${name} must target a Supabase project origin`);
  }
  return url;
}

function canonicalBase64Url(value, bytes) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value;
}

function validAdminPasswordHash(value) {
  const [algorithm, salt, digest, extra] = value.split('$');
  return extra === undefined
    && algorithm === 'scrypt'
    && canonicalBase64Url(salt || '', 16)
    && canonicalBase64Url(digest || '', 64);
}

function validSupabaseProjectRef(value) {
  return /^[a-z0-9]{8,40}$/.test(value);
}

function redisProvidersFingerprint(rateLimitConfig, adminRevocationConfig) {
  return createHash('sha256')
    .update(JSON.stringify([
      String(rateLimitConfig?.endpoint || ''),
      String(adminRevocationConfig?.endpoint || '')
    ]))
    .digest('base64url');
}

function releaseProviderIdentity(
  environment,
  selectedTarget,
  supabaseOrigin,
  rateLimitConfig,
  adminRevocationConfig
) {
  const supabaseProjectRef = supabaseOrigin?.hostname.split('.')[0] || '';
  return Object.freeze({
    deploymentHost: text(environment, 'VERCEL_URL'),
    deploymentId: text(environment, 'VERCEL_DEPLOYMENT_ID'),
    environment: selectedTarget,
    projectId: text(environment, 'VERCEL_PROJECT_ID'),
    redisNamespace: text(environment, 'MESTO_REDIS_NAMESPACE'),
    redisProvidersFingerprint: redisProvidersFingerprint(rateLimitConfig, adminRevocationConfig),
    supabaseProjectRef
  });
}

function validateReleaseEnvironment(environment = process.env, { target } = {}) {
  const failures = [];
  const selectedTarget = String(
    target || environment.VERCEL_ENV || environment.MESTO_RELEASE_TARGET || ''
  ).trim().toLowerCase();
  if (!['preview', 'production'].includes(selectedTarget)) {
    failures.push('target must be preview or production');
  }
  const configuredReleaseTarget = required(environment, 'MESTO_RELEASE_TARGET', failures);
  if (configuredReleaseTarget && configuredReleaseTarget !== selectedTarget) {
    failures.push('MESTO_RELEASE_TARGET must match the selected release target');
  }
  const actualVercelEnvironment = required(environment, 'VERCEL_ENV', failures);
  if (actualVercelEnvironment && actualVercelEnvironment !== selectedTarget) {
    failures.push('VERCEL_ENV must match the selected release target');
  }
  const deploymentId = required(environment, 'VERCEL_DEPLOYMENT_ID', failures);
  if (deploymentId && !/^dpl_[A-Za-z0-9]{16,}$/.test(deploymentId)) {
    failures.push('VERCEL_DEPLOYMENT_ID must be canonical');
  }
  const projectId = required(environment, 'VERCEL_PROJECT_ID', failures);
  if (projectId && !/^prj_[A-Za-z0-9]{16,}$/.test(projectId)) {
    failures.push('VERCEL_PROJECT_ID must be canonical');
  }
  const deploymentHost = required(environment, 'VERCEL_URL', failures);
  if (deploymentHost) {
    const deploymentOrigin = httpsOrigin(`https://${deploymentHost}`, 'VERCEL_URL', failures);
    if (deploymentOrigin && !deploymentOrigin.hostname.endsWith('.vercel.app')) {
      failures.push('VERCEL_URL must target an immutable Vercel deployment');
    }
  }

  const supabaseUrl = required(environment, 'SUPABASE_URL', failures);
  const supabaseOrigin = httpsOrigin(supabaseUrl, 'SUPABASE_URL', failures, { supabase: true });
  const expectedSupabaseProjectRef = required(environment, 'MESTO_SUPABASE_PROJECT_REF', failures);
  if (!validSupabaseProjectRef(expectedSupabaseProjectRef)) {
    failures.push('MESTO_SUPABASE_PROJECT_REF must be a canonical project ref');
  } else if (supabaseOrigin?.hostname !== `${expectedSupabaseProjectRef}.supabase.co`) {
    failures.push('SUPABASE_URL must match MESTO_SUPABASE_PROJECT_REF');
  }
  const serviceRoleKey = required(environment, 'SUPABASE_SERVICE_ROLE_KEY', failures, 32);
  for (const publicKeyName of [
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'MESTO_PUBLIC_SUPABASE_ANON_KEY',
    'MESTO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  ]) {
    if (serviceRoleKey && serviceRoleKey === text(environment, publicKeyName)) {
      failures.push(`SUPABASE_SERVICE_ROLE_KEY must differ from ${publicKeyName}`);
    }
  }

  // The production-only Vercel Cron authenticates with this bearer token.
  // Preview uses the same protected endpoint for explicit acceptance runs.
  const cronSecret = required(environment, 'CRON_SECRET', failures, 32);
  if (cronSecret && cronSecret !== String(environment.CRON_SECRET || '')) {
    failures.push('CRON_SECRET must be trimmed');
  }

  const userSecret = required(environment, 'MESTO_USER_SESSION_SECRET', failures, 32);
  const adminSecret = required(environment, 'MESTO_ADMIN_SESSION_SECRET', failures, 32);
  try {
    validateAdminSessionSecret(adminSecret, userSecret);
  } catch (error) {
    failures.push(error?.code || 'MESTO_ADMIN_SESSION_SECRET is invalid');
  }
  for (const [name, value] of [
    ['SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey],
    ['MESTO_USER_SESSION_SECRET', userSecret],
    ['MESTO_ADMIN_SESSION_SECRET', adminSecret]
  ]) {
    if (cronSecret && cronSecret === value) {
      failures.push(`CRON_SECRET must differ from ${name}`);
    }
  }

  const adminLogin = required(environment, 'MESTO_ADMIN_LOGIN', failures);
  if (adminLogin.length > 120 || adminLogin !== String(environment.MESTO_ADMIN_LOGIN || '')) {
    failures.push('MESTO_ADMIN_LOGIN must be trimmed and at most 120 characters');
  }
  const adminPasswordHash = required(environment, 'MESTO_ADMIN_PASSWORD_HASH', failures);
  if (adminPasswordHash && !validAdminPasswordHash(adminPasswordHash)) {
    failures.push('MESTO_ADMIN_PASSWORD_HASH must be a canonical scrypt hash');
  }

  const publicOrigin = required(environment, 'MESTO_PUBLIC_ORIGIN', failures);
  httpsOrigin(publicOrigin, 'MESTO_PUBLIC_ORIGIN', failures);
  if (selectedTarget === 'production') {
    const platformHostname = required(environment, 'VERCEL_PROJECT_PRODUCTION_URL', failures);
    if (platformHostname && publicOrigin !== `https://${platformHostname}`) {
      failures.push('MESTO_PUBLIC_ORIGIN must match VERCEL_PROJECT_PRODUCTION_URL');
    }
  } else if (selectedTarget === 'preview') {
    const branchHostname = required(environment, 'VERCEL_BRANCH_URL', failures);
    if (branchHostname && publicOrigin !== `https://${branchHostname}`) {
      failures.push('MESTO_PUBLIC_ORIGIN must match VERCEL_BRANCH_URL for Preview');
    }
  }

  if (text(environment, 'MESTO_RATE_LIMIT_PROVIDER') !== 'upstash-redis') {
    failures.push('MESTO_RATE_LIMIT_PROVIDER must be upstash-redis');
  }
  if (text(environment, 'MESTO_ADMIN_SESSION_REVOCATION_PROVIDER') !== 'upstash-redis') {
    failures.push('MESTO_ADMIN_SESSION_REVOCATION_PROVIDER must be upstash-redis');
  }
  if (text(environment, 'MESTO_REDIS_NAMESPACE') !== selectedTarget) {
    failures.push(`MESTO_REDIS_NAMESPACE must be ${selectedTarget}`);
  }
  let rateLimitConfig;
  try {
    rateLimitConfig = rateLimitConfiguration({ ...environment, VERCEL_ENV: selectedTarget });
  } catch (error) {
    failures.push(error?.code || 'distributed rate limiting is invalid');
  }
  let adminRevocationConfig;
  try {
    adminRevocationConfig = adminRevocationConfiguration({ ...environment, VERCEL_ENV: selectedTarget });
  } catch (error) {
    failures.push(error?.code || 'admin session revocation is invalid');
  }
  for (const [name, value] of [
    ['MESTO_RATE_LIMIT_REDIS_TOKEN', rateLimitConfig?.token],
    ['MESTO_ADMIN_SESSION_REDIS_TOKEN', adminRevocationConfig?.token]
  ]) {
    if (cronSecret && cronSecret === value) {
      failures.push(`CRON_SECRET must differ from ${name}`);
    }
  }

  if (text(environment, 'MESTO_CACHE_PURGE_PROVIDER') !== 'vercel') {
    failures.push('MESTO_CACHE_PURGE_PROVIDER must be vercel');
  }

  const yandexId = text(environment, 'YANDEX_OAUTH_CLIENT_ID');
  const yandexSecret = text(environment, 'YANDEX_OAUTH_CLIENT_SECRET');
  if (Boolean(yandexId) !== Boolean(yandexSecret)) {
    failures.push('YANDEX_OAUTH_CLIENT_ID and YANDEX_OAUTH_CLIENT_SECRET must be configured together');
  }

  if (failures.length) throw new ReleaseEnvironmentError(failures);
  return Object.freeze({
    target: selectedTarget,
    providerIdentity: releaseProviderIdentity(
      environment,
      selectedTarget,
      supabaseOrigin,
      rateLimitConfig,
      adminRevocationConfig
    ),
    checks: Object.freeze([
      'vercel-deployment-identity',
      'supabase',
      'media-reaper-secret',
      'session-secrets',
      'admin-credentials',
      'public-origin',
      'distributed-rate-limit',
      'shared-admin-revocation',
      'cache-purge',
      'oauth-pairs'
    ])
  });
}

module.exports = {
  ReleaseEnvironmentError,
  redisProvidersFingerprint,
  releaseProviderIdentity,
  validAdminPasswordHash,
  validSupabaseProjectRef,
  validateReleaseEnvironment
};
