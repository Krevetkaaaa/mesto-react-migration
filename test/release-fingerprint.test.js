const assert = require('node:assert/strict');
const { test } = require('node:test');

const { hashPassword } = require('../lib/security');
const handler = require('../handlers/release-fingerprint');

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
  };
}

function environment() {
  return {
    VERCEL_ENV: 'preview',
    MESTO_RELEASE_TARGET: 'preview',
    VERCEL_DEPLOYMENT_ID: 'dpl_1234567890abcdef',
    VERCEL_PROJECT_ID: 'prj_1234567890abcdef',
    VERCEL_URL: 'immutable-preview.vercel.app',
    VERCEL_BRANCH_URL: 'immutable-preview.vercel.app',
    SUPABASE_URL: 'https://previewproject.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-longer-than-thirty-two-characters',
    MESTO_SUPABASE_PROJECT_REF: 'previewproject',
    MESTO_USER_SESSION_SECRET: 'customer-session-secret-longer-than-thirty-two',
    MESTO_ADMIN_SESSION_SECRET: 'admin-session-secret-longer-than-thirty-two-characters',
    MESTO_ADMIN_LOGIN: 'release-admin',
    MESTO_ADMIN_PASSWORD_HASH: hashPassword('Strong-Admin-Password-7'),
    MESTO_PUBLIC_ORIGIN: 'https://immutable-preview.vercel.app',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    MESTO_RATE_LIMIT_REDIS_URL: 'https://preview-redis.upstash.io',
    MESTO_RATE_LIMIT_REDIS_TOKEN: 'preview-token',
    MESTO_REDIS_NAMESPACE: 'preview',
    MESTO_ADMIN_SESSION_REVOCATION_PROVIDER: 'upstash-redis',
    MESTO_CACHE_PURGE_PROVIDER: 'vercel',
    CRON_SECRET: 'cron-fingerprint-secret-longer-than-thirty-two-characters',
  };
}

test('release fingerprint exposes only the bound provider identity', async () => {
  const before = process.env;
  process.env = { ...before, ...environment() };
  try {
    const res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['cache-control'], 'private, no-store, max-age=0');
    const body = JSON.parse(res.body);
    assert.deepEqual(
      {
        deploymentHost: body.deploymentHost,
        deploymentId: body.deploymentId,
        environment: body.environment,
        projectId: body.projectId,
        redisNamespace: body.redisNamespace,
        redisProvidersFingerprint: body.redisProvidersFingerprint,
        supabaseProjectRef: body.supabaseProjectRef,
      },
      {
        deploymentHost: 'immutable-preview.vercel.app',
        deploymentId: 'dpl_1234567890abcdef',
        environment: 'preview',
        projectId: 'prj_1234567890abcdef',
        redisNamespace: 'preview',
        redisProvidersFingerprint: body.redisProvidersFingerprint,
        supabaseProjectRef: 'previewproject',
      }
    );
    assert.match(body.fingerprint, /^[A-Za-z0-9_-]{43}$/);
    assert.match(body.redisProvidersFingerprint, /^[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(res.body, /service-role|session-secret|preview-token/);
  } finally {
    process.env = before;
  }
});

test('release fingerprint fails closed when the configured project ref does not match', async () => {
  const before = process.env;
  process.env = { ...before, ...environment(), MESTO_SUPABASE_PROJECT_REF: 'wrongproject' };
  try {
    const res = response();
    await handler({ method: 'GET' }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).code, 'RELEASE_ENV_INVALID');
  } finally {
    process.env = before;
  }
});
