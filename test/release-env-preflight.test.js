const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const { hashPassword } = require('../lib/security');
const packageManifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const vercelConfig = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8'));
const environmentExample = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
const apiRouter = readFileSync(join(__dirname, '..', 'api', 'router.js'), 'utf8');
const mediaReaperHandler = readFileSync(join(__dirname, '..', 'handlers', 'cron', 'media-reaper.js'), 'utf8');
const {
  ReleaseEnvironmentError,
  validAdminPasswordHash,
  validateReleaseEnvironment
} = require('../lib/release-env');

function validEnvironment() {
  return {
    VERCEL_ENV: 'preview',
    MESTO_RELEASE_TARGET: 'preview',
    VERCEL_DEPLOYMENT_ID: 'dpl_1234567890abcdef',
    VERCEL_PROJECT_ID: 'prj_1234567890abcdef',
    VERCEL_URL: 'immutable-preview.vercel.app',
    VERCEL_BRANCH_URL: 'preview.example.test',
    SUPABASE_URL: 'https://exampleproject.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-that-is-longer-than-thirty-two-characters',
    MESTO_SUPABASE_PROJECT_REF: 'exampleproject',
    CRON_SECRET: 'cron-secret-that-is-longer-than-thirty-two-characters',
    MESTO_USER_SESSION_SECRET: 'user-session-secret-that-is-longer-than-thirty-two',
    MESTO_ADMIN_SESSION_SECRET: 'admin-session-secret-that-is-longer-than-thirty-two',
    MESTO_ADMIN_LOGIN: 'release-admin',
    MESTO_ADMIN_PASSWORD_HASH: hashPassword('Strong-Admin-Password-7'),
    MESTO_PUBLIC_ORIGIN: 'https://preview.example.test',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    MESTO_RATE_LIMIT_REDIS_URL: 'https://example-redis.upstash.io',
    MESTO_RATE_LIMIT_REDIS_TOKEN: 'upstash-token',
    MESTO_REDIS_NAMESPACE: 'preview',
    MESTO_ADMIN_SESSION_REVOCATION_PROVIDER: 'upstash-redis',
    MESTO_CACHE_PURGE_PROVIDER: 'vercel',
    YANDEX_OAUTH_CLIENT_ID: 'yandex-client',
    YANDEX_OAUTH_CLIENT_SECRET: 'yandex-secret'
  };
}

test('release environment preflight accepts a complete redacted Preview contract', () => {
  const result = validateReleaseEnvironment(validEnvironment(), { target: 'preview' });
  assert.equal(result.target, 'preview');
  assert.equal(result.checks.length, 10);
  assert.match(result.providerIdentity.redisProvidersFingerprint, /^[A-Za-z0-9_-]{43}$/);
});

test('release provider identity changes when either Redis endpoint changes', () => {
  const first = validateReleaseEnvironment(validEnvironment(), { target: 'preview' });
  const changedEnvironment = validEnvironment();
  changedEnvironment.MESTO_ADMIN_SESSION_REDIS_URL = 'https://dedicated-admin-redis.upstash.io';
  changedEnvironment.MESTO_ADMIN_SESSION_REDIS_TOKEN = 'dedicated-admin-token';
  const second = validateReleaseEnvironment(changedEnvironment, { target: 'preview' });
  assert.notEqual(
    first.providerIdentity.redisProvidersFingerprint,
    second.providerIdentity.redisProvidersFingerprint,
  );
});

test('release environment preflight rejects missing shared providers and reused secrets', () => {
  const environment = validEnvironment();
  environment.MESTO_ADMIN_SESSION_SECRET = environment.MESTO_USER_SESSION_SECRET;
  environment.MESTO_RATE_LIMIT_PROVIDER = 'memory';
  environment.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER = 'memory';
  environment.MESTO_REDIS_NAMESPACE = 'preview';
  environment.MESTO_CACHE_PURGE_PROVIDER = 'none';
  assert.throws(
    () => validateReleaseEnvironment(environment, { target: 'production' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('SECRET_REUSED'))
      && error.failures.some((failure) => failure.includes('RATE_LIMIT_PROVIDER'))
      && error.failures.some((failure) => failure.includes('CACHE_PURGE_PROVIDER'))
  );
});

test('release environment preflight isolates the cron bearer from privileged credentials', () => {
  for (const reusedName of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'MESTO_USER_SESSION_SECRET',
    'MESTO_ADMIN_SESSION_SECRET',
    'MESTO_RATE_LIMIT_REDIS_TOKEN'
  ]) {
    const environment = validEnvironment();
    environment.CRON_SECRET = environment[reusedName];
    assert.throws(
      () => validateReleaseEnvironment(environment, { target: 'preview' }),
      (error) => error instanceof ReleaseEnvironmentError
        && error.failures.includes(`CRON_SECRET must differ from ${reusedName}`)
    );
  }
});

test('release environment preflight rejects whitespace-normalized cron secrets', () => {
  const canonical = validEnvironment().CRON_SECRET;
  for (const secret of [` ${canonical}`, `${canonical} `, `${canonical}\n`]) {
    const environment = validEnvironment();
    environment.CRON_SECRET = secret;
    assert.throws(
      () => validateReleaseEnvironment(environment, { target: 'preview' }),
      (error) => error instanceof ReleaseEnvironmentError
        && error.failures.includes('CRON_SECRET must be trimmed')
    );
  }
});

test('release environment preflight rejects malformed origins, admin hashes, and OAuth pairs', () => {
  const environment = validEnvironment();
  environment.SUPABASE_URL = 'http://localhost:54321/rest/v1';
  environment.MESTO_PUBLIC_ORIGIN = 'https://example.test/path?secret=value';
  environment.MESTO_ADMIN_PASSWORD_HASH = 'scrypt$invalid$invalid';
  delete environment.YANDEX_OAUTH_CLIENT_SECRET;
  assert.throws(
    () => validateReleaseEnvironment(environment, { target: 'preview' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('SUPABASE_URL'))
      && error.failures.some((failure) => failure.includes('MESTO_PUBLIC_ORIGIN'))
      && error.failures.some((failure) => failure.includes('MESTO_ADMIN_PASSWORD_HASH'))
      && error.failures.some((failure) => failure.includes('YANDEX_OAUTH'))
  );
});

test('release environment preflight binds the configured Supabase project and rejects public keys', () => {
  const environment = validEnvironment();
  environment.MESTO_SUPABASE_PROJECT_REF = 'differentproject';
  environment.SUPABASE_ANON_KEY = environment.SUPABASE_SERVICE_ROLE_KEY;
  assert.throws(
    () => validateReleaseEnvironment(environment, { target: 'preview' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('SUPABASE_URL must match'))
      && error.failures.some((failure) => failure.includes('must differ from SUPABASE_ANON_KEY'))
  );
});

test('production preflight binds the canonical origin to the Vercel production domain', () => {
  const environment = validEnvironment();
  environment.MESTO_PUBLIC_ORIGIN = 'https://mesto-city-guide.vercel.app';
  environment.MESTO_REDIS_NAMESPACE = 'production';
  environment.VERCEL_ENV = 'production';
  environment.MESTO_RELEASE_TARGET = 'production';
  environment.VERCEL_URL = 'mesto-city-guide-production-abc.vercel.app';
  environment.VERCEL_PROJECT_PRODUCTION_URL = 'mesto-city-guide.vercel.app';
  assert.equal(validateReleaseEnvironment(environment, { target: 'production' }).target, 'production');
  environment.MESTO_PUBLIC_ORIGIN = 'https://lookalike.vercel.app';
  assert.throws(
    () => validateReleaseEnvironment(environment, { target: 'production' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('VERCEL_PROJECT_PRODUCTION_URL'))
  );
});

test('preview preflight binds the public origin to the Vercel branch origin', () => {
  const environment = validEnvironment();
  assert.equal(validateReleaseEnvironment(environment, { target: 'preview' }).target, 'preview');
  environment.MESTO_PUBLIC_ORIGIN = 'https://mesto-city-guide.vercel.app';
  assert.throws(
    () => validateReleaseEnvironment(environment, { target: 'preview' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('VERCEL_BRANCH_URL')),
  );
});

test('admin password preflight accepts only canonical scrypt hashes', () => {
  assert.equal(validAdminPasswordHash(hashPassword('Strong-Admin-Password-7')), true);
  assert.equal(validAdminPasswordHash('scrypt$c2FsdA$ZGlnZXN0'), false);
  assert.equal(validAdminPasswordHash('argon2$example$example'), false);
});

test('release CLI skips only outside a deploy and validates an explicit deploy target', async () => {
  const { runReleaseEnvironmentPreflight } = await import('../scripts/check-release-env.mjs');
  assert.deepEqual(
    runReleaseEnvironmentPreflight(['--if-deploy'], {}),
    { skipped: true, target: 'local' }
  );
  const result = runReleaseEnvironmentPreflight(['--if-deploy', '--target', 'preview'], validEnvironment());
  assert.equal(result.skipped, false);
  assert.equal(result.target, 'preview');
  assert.throws(
    () => runReleaseEnvironmentPreflight(['--if-deploy'], { VERCEL: '1' }),
    /VERCEL_ENV must identify preview or production/,
  );
  assert.throws(
    () => runReleaseEnvironmentPreflight(['--if-deploy'], { MESTO_RELEASE_TARGET: 'preview' }),
    (error) => error instanceof ReleaseEnvironmentError
      && error.failures.some((failure) => failure.includes('VERCEL_ENV')),
  );
});

test('Vercel is pinned to the release-gated package build while local verification stays explicit', () => {
  assert.equal(vercelConfig.buildCommand, 'npm run build');
  assert.match(packageManifest.scripts.build, /^node scripts\/check-release-env\.mjs && npm run build:local$/);
  assert.match(packageManifest.scripts.smoke, /^npm run build:local &&/);
  assert.match(packageManifest.scripts['test:load:local'], /^npm run build:local &&/);
});

test('scheduled media reaper is statically coupled to routing, secret preflight and redacted configuration', () => {
  assert.deepEqual(vercelConfig.crons, [{
    path: '/api/cron/media-reaper',
    schedule: '17 3 * * *'
  }]);
  assert.match(apiRouter, /\['cron\/media-reaper', require\('\.\.\/handlers\/cron\/media-reaper'\)\]/);
  assert.match(mediaReaperHandler, /MINIMUM_CRON_SECRET_LENGTH = 32/);
  assert.match(mediaReaperHandler, /env\.CRON_SECRET/);
  assert.match(environmentExample, /^CRON_SECRET=$/m);
  assert.doesNotMatch(environmentExample, /^CRON_SECRET=.+$/m);

  for (const invalid of ['', 'x'.repeat(31)]) {
    const environment = validEnvironment();
    environment.CRON_SECRET = invalid;
    assert.throws(
      () => validateReleaseEnvironment(environment, { target: 'preview' }),
      (error) => error instanceof ReleaseEnvironmentError
        && error.failures.some((failure) => failure.includes('CRON_SECRET'))
    );
  }
});
