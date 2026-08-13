const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { text: canonicalizeHttpText } = require('../lib/http');

async function moduleUnderTest() {
  return import('../scripts/preview-acceptance.mjs');
}

const SIGNED_UPLOAD_OBSERVED_AT_MS = Date.parse('2026-08-11T10:00:00.000Z');
const SIGNED_UPLOAD_EXPIRES_AT = '2026-08-11T12:00:00.000Z';

function retainedCleanupDeadline(mediaId) {
  const expiresAtMs = Date.parse(SIGNED_UPLOAD_EXPIRES_AT);
  const notBeforeMs = expiresAtMs + 5 * 60 * 1_000 + 30 * 1_000;
  return {
    mediaId,
    expiresAt: SIGNED_UPLOAD_EXPIRES_AT,
    expiresAtMs,
    horizonMs: expiresAtMs - SIGNED_UPLOAD_OBSERVED_AT_MS,
    notBefore: new Date(notBeforeMs).toISOString(),
    notBeforeMs,
    valid: true,
  };
}

function noSuchKeyResponse() {
  return new Response(JSON.stringify({
    statusCode: '404',
    error: 'NoSuchKey',
    message: 'The specified key does not exist',
  }), { status: 404 });
}

function transitionalStorageResponse(code) {
  return new Response(JSON.stringify({
    statusCode: '404',
    code,
    error: code === 'NoSuchKey' ? 'not_found' : 'Bucket not found',
    message: code === 'NoSuchKey' ? 'The resource was not found' : 'Bucket not found',
  }), { status: 400 });
}

function mediaReaperResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'content-type': 'application/json; charset=utf-8',
      vary: 'Authorization',
      'x-robots-tag': 'noindex',
      ...(status === 401 ? { 'www-authenticate': 'Bearer' } : {}),
      ...headers,
    },
  });
}

function mediaReaperSummary(overrides = {}) {
  const phases = ['recovered', 'public', 'staging', 'review', 'expired'];
  return {
    ok: true,
    drained: true,
    counts: { recovered: 0, public: 0, staging: 1, review: 0, expired: 1 },
    hasMore: Object.fromEntries(phases.map((phase) => [phase, false])),
    failures: [],
    ...overrides,
  };
}

function previewProviderIdentity(preview) {
  return Object.freeze({
    environment: 'preview',
    deploymentHost: new URL(preview).hostname,
    fingerprint: 'f'.repeat(43),
  });
}

test('preview acceptance target is exact, HTTPS, Vercel-hosted, and never Production', async () => {
  const { validatePreviewAcceptanceTarget } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';

  assert.equal(validatePreviewAcceptanceTarget(preview, preview), preview);
  assert.throws(
    () => validatePreviewAcceptanceTarget('https://mesto-city-guide.vercel.app', 'https://mesto-city-guide.vercel.app'),
    { code: 'PRODUCTION_ALIAS_FORBIDDEN' },
  );
  assert.throws(() => validatePreviewAcceptanceTarget('http://mesto-preview.vercel.app', 'http://mesto-preview.vercel.app'), {
    code: 'PREVIEW_HTTPS_REQUIRED',
  });
  assert.throws(() => validatePreviewAcceptanceTarget(`${preview}/catalog`, preview), { code: 'PREVIEW_ORIGIN_ONLY' });
  assert.throws(() => validatePreviewAcceptanceTarget('https://example.com', 'https://example.com'), {
    code: 'VERCEL_PREVIEW_HOST_REQUIRED',
  });
  assert.throws(() => validatePreviewAcceptanceTarget(preview, 'https://other-preview.vercel.app'), {
    code: 'PREVIEW_ALLOWLIST_MISMATCH',
  });
  assert.throws(
    () => validatePreviewAcceptanceTarget(preview, preview, preview),
    { code: 'PRODUCTION_ALIAS_FORBIDDEN' },
  );
});

test('preview acceptance arguments require an explicit destructive Preview acknowledgement', async () => {
  const { parsePreviewAcceptanceArguments } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  const environment = { MESTO_ACCEPTANCE_ALLOWED_PREVIEW_ORIGIN: preview };

  assert.deepEqual(parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--expected-commit-sha', commitSha,
    '--acknowledge-preview-mutations',
  ], environment), { baseUrl: preview, deploymentId: 'dpl_1234567890abcdef', expectedCommitSha: commitSha });
  assert.throws(() => parsePreviewAcceptanceArguments(['--base-url', preview, '--deployment-id', 'dpl_1234567890abcdef'], environment), {
    code: 'PREVIEW_MUTATION_ACK_REQUIRED',
  });
  assert.throws(() => parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--expected-commit-sha', commitSha,
    '--base-url', preview,
    '--acknowledge-preview-mutations',
  ], environment), { code: 'DUPLICATE_BASE_URL' });
  assert.throws(() => parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--expected-commit-sha', commitSha,
    '--admin-password', 'must-never-be-an-argument',
    '--acknowledge-preview-mutations',
  ], environment), { code: 'UNKNOWN_ACCEPTANCE_OPTION' });
  assert.throws(() => parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--expected-commit-sha', commitSha,
    '--acknowledge-preview-mutations',
  ], environment), { code: 'DEPLOYMENT_ID_REQUIRED' });
  assert.throws(() => parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--acknowledge-preview-mutations',
  ], environment), { code: 'EXPECTED_COMMIT_SHA_INVALID' });
  assert.equal(parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--acknowledge-preview-mutations',
  ], { ...environment, MESTO_EXPECTED_PREVIEW_COMMIT_SHA: commitSha }).expectedCommitSha, commitSha);
});

test('Preview operator examples expose the same exact commit-SHA gate as the CLI', () => {
  const envExample = readFileSync(join(__dirname, '..', '.env.example'), 'utf8');
  const runbook = readFileSync(join(__dirname, '..', 'docs', 'PHASE12_PREVIEW_ACCEPTANCE_RUNBOOK.md'), 'utf8');
  assert.match(envExample, /^MESTO_EXPECTED_PREVIEW_COMMIT_SHA=$/m);
  assert.match(runbook, /--expected-commit-sha [0-9a-f]{40} --acknowledge-preview-mutations/);
});

test('preview acceptance rejects missing or mismatched expected commit before any app request', async () => {
  const { runPreviewAcceptance } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const actualCommitSha = '0123456789abcdef0123456789abcdef01234567';
  let deploymentRequests = 0;
  let appRequests = 0;
  const baseOptions = {
    baseUrl: preview,
    deploymentId: 'dpl_1234567890abcdef',
    projectId: 'prj_1234567890abcdef',
    teamId: 'team_example',
    vercelToken: 'token',
    cronSecret: 'acceptance-cron-secret-32-characters-minimum',
    deploymentFetch: async () => {
      deploymentRequests += 1;
      return Response.json({
        id: 'dpl_1234567890abcdef',
        projectId: 'prj_1234567890abcdef',
        target: null,
        readyState: 'READY',
        url: new URL(preview).hostname,
        meta: { githubCommitSha: actualCommitSha },
      });
    },
    appFetch: async () => {
      appRequests += 1;
      throw new Error('app request must not happen');
    },
  };

  await assert.rejects(runPreviewAcceptance(baseOptions), { code: 'EXPECTED_COMMIT_SHA_INVALID' });
  assert.equal(deploymentRequests, 0);
  assert.equal(appRequests, 0);
  await assert.rejects(runPreviewAcceptance({
    ...baseOptions,
    expectedCommitSha: 'f'.repeat(40),
  }), { code: 'DEPLOYMENT_COMMIT_MISMATCH' });
  assert.equal(deploymentRequests, 1);
  assert.equal(appRequests, 0);
});

test('report redaction removes sensitive fields and embedded secret values', async () => {
  const { redactForReport } = await moduleUnderTest();
  const secret = 'private-admin-value';
  const input = {
    target: 'https://preview.vercel.app',
    evidenceManifest: {
      expectedCommitSha: 'a'.repeat(40),
      actualCommitSha: 'a'.repeat(40),
    },
    password: secret,
    nested: {
      cookie: `mesto_admin=${secret}`,
      payload: { harmless: false },
      message: `provider rejected ${secret}`,
    },
  };

  const redacted = redactForReport(input, { sensitiveValues: [secret] });
  assert.equal(redacted.target, input.target);
  assert.deepEqual(redacted.evidenceManifest, input.evidenceManifest);
  assert.equal(redacted.password, '[REDACTED]');
  assert.equal(redacted.nested.cookie, '[REDACTED]');
  assert.equal(redacted.nested.payload, '[REDACTED]');
  assert.equal(redacted.nested.message, 'provider rejected [REDACTED]');
  assert.doesNotMatch(JSON.stringify(redacted), new RegExp(secret));
});

test('media reaper secret is environment-only, exact, and rejects missing or whitespace values before requests', async () => {
  const {
    parsePreviewAcceptanceArguments,
    provePreviewMediaReaper,
    validateAcceptanceCronSecret,
  } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const invalidSecrets = [undefined, '', ' '.repeat(40), ` ${'x'.repeat(32)}`, `${'x'.repeat(32)} `];

  for (const cronSecret of invalidSecrets) {
    let requests = 0;
    assert.throws(() => validateAcceptanceCronSecret(cronSecret), { code: 'ACCEPTANCE_CRON_SECRET_INVALID' });
    await assert.rejects(provePreviewMediaReaper({
      baseUrl: preview,
      cronSecret,
      fetchImpl: async () => {
        requests += 1;
        throw new Error('must not request');
      },
      providerIdentity: previewProviderIdentity(preview),
    }), { code: 'ACCEPTANCE_CRON_SECRET_INVALID' });
    assert.equal(requests, 0);
  }

  assert.throws(() => parsePreviewAcceptanceArguments([
    '--base-url', preview,
    '--deployment-id', 'dpl_1234567890abcdef',
    '--expected-commit-sha', 'a'.repeat(40),
    '--cron-secret', 'x'.repeat(32),
    '--acknowledge-preview-mutations',
  ], { MESTO_ACCEPTANCE_ALLOWED_PREVIEW_ORIGIN: preview }), { code: 'UNKNOWN_ACCEPTANCE_OPTION' });
});

test('media reaper requires the exact runtime Preview provider fingerprint before any request', async () => {
  const { provePreviewMediaReaper } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  let requests = 0;
  await assert.rejects(provePreviewMediaReaper({
    baseUrl: preview,
    cronSecret: 'acceptance-cron-secret-32-characters-minimum',
    fetchImpl: async () => {
      requests += 1;
      throw new Error('must not request');
    },
    providerIdentity: { ...previewProviderIdentity(preview), environment: 'production' },
  }), { code: 'MEDIA_REAPER_PROVIDER_FINGERPRINT_REQUIRED' });
  assert.equal(requests, 0);
});

test('media reaper proves unauthenticated then authenticated handler reachability without leaking its secret', async () => {
  const { provePreviewMediaReaper } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const secret = 'acceptance-cron-secret-32-characters-minimum';
  const calls = [];
  const evidence = await provePreviewMediaReaper({
    baseUrl: preview,
    cronSecret: secret,
    providerIdentity: previewProviderIdentity(preview),
    fetchImpl: async (url, options) => {
      const headers = new Headers(options.headers);
      const authorization = headers.get('authorization');
      calls.push({
        authorizationPresent: authorization !== null,
        authorizationMatches: authorization === `Bearer ${secret}`,
        cacheControl: headers.get('cache-control'),
        cookiePresent: headers.has('cookie'),
        method: options.method,
        path: new URL(url).pathname,
        redirect: options.redirect,
        signalAborted: options.signal.aborted,
      });
      return calls.length === 1
        ? mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401)
        : mediaReaperResponse(mediaReaperSummary());
    },
  });

  assert.deepEqual(calls, [
    {
      authorizationPresent: false,
      authorizationMatches: false,
      cacheControl: 'no-store',
      cookiePresent: false,
      method: 'GET',
      path: '/api/cron/media-reaper',
      redirect: 'manual',
      signalAborted: false,
    },
    {
      authorizationPresent: true,
      authorizationMatches: true,
      cacheControl: 'no-store',
      cookiePresent: false,
      method: 'GET',
      path: '/api/cron/media-reaper',
      redirect: 'manual',
      signalAborted: false,
    },
  ]);
  assert.equal(evidence.evidenceName, 'preview-media-reaper-handler-auth-provider-reachability-not-production-schedule-proof');
  assert.deepEqual(evidence.counts, { recovered: 0, public: 0, staging: 1, review: 0, expired: 1 });
  assert.equal(evidence.productionScheduleProven, false);
  assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secret));
});

test('media reaper requires exact auth, cache, vary, and robot headers', async () => {
  const { provePreviewMediaReaper } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const base = {
    baseUrl: preview,
    cronSecret: 'acceptance-cron-secret-32-characters-minimum',
    providerIdentity: previewProviderIdentity(preview),
  };
  const cases = [
    [{ 'www-authenticate': 'Basic' }, 'MEDIA_REAPER_AUTH_CHALLENGE_INVALID'],
    [{ vary: 'Accept' }, 'MEDIA_REAPER_VARY_INVALID'],
    [{ 'x-robots-tag': 'noindex, nofollow' }, 'MEDIA_REAPER_ROBOTS_INVALID'],
    [{ 'cache-control': 'no-store' }, 'MEDIA_REAPER_NO_STORE_REQUIRED'],
  ];

  for (const [headers, code] of cases) {
    let requests = 0;
    await assert.rejects(provePreviewMediaReaper({
      ...base,
      fetchImpl: async () => {
        requests += 1;
        return mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401, headers);
      },
    }), { code });
    assert.equal(requests, 1);
  }
});

test('media reaper rejects malformed, unavailable, failed, backlogged, and all-zero summaries without secret disclosure', async () => {
  const { provePreviewMediaReaper } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const secret = 'acceptance-cron-secret-32-characters-minimum';
  const exactHeaders = {
    'cache-control': 'private, no-store, max-age=0',
    'content-type': 'application/json',
    vary: 'Authorization',
    'x-robots-tag': 'noindex',
  };
  const cases = [
    [() => mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_FAILED' }, 503), 'MEDIA_REAPER_STATUS_INVALID'],
    [() => new Response(`not-json-${secret}`, { status: 200, headers: exactHeaders }), 'MEDIA_REAPER_JSON_INVALID'],
    [() => mediaReaperResponse(mediaReaperSummary({ failures: [{ phase: 'expired', code: 'FAIL' }] })), 'MEDIA_REAPER_SUMMARY_INVALID'],
    [() => mediaReaperResponse(mediaReaperSummary({
      drained: false,
      hasMore: { recovered: false, public: false, staging: true, review: false, expired: false },
    })), 'MEDIA_REAPER_BACKLOG_REMAINS'],
    [() => mediaReaperResponse(mediaReaperSummary({
      counts: { recovered: 0, public: 0, staging: 0, review: 0, expired: 0 },
    })), 'MEDIA_REAPER_ISOLATED_COUNTS_INVALID'],
  ];

  for (const [authenticatedResponse, code] of cases) {
    let requests = 0;
    let failure;
    try {
      await provePreviewMediaReaper({
        baseUrl: preview,
        cronSecret: secret,
        providerIdentity: previewProviderIdentity(preview),
        fetchImpl: async () => {
          requests += 1;
          return requests === 1
            ? mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401)
            : authenticatedResponse();
        },
      });
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, code);
    assert.equal(requests, 2);
    assert.doesNotMatch(JSON.stringify({
      name: failure?.name,
      message: failure?.message,
      phase: failure?.phase,
      code: failure?.code,
      status: failure?.status,
    }), new RegExp(secret));
  }
});

test('media reaper dedicated timeout permits a handler response after the generic 15 second bound', { timeout: 25_000 }, async () => {
  const { MEDIA_REAPER_REQUEST_TIMEOUT_MS, provePreviewMediaReaper } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  let requests = 0;
  assert.equal(MEDIA_REAPER_REQUEST_TIMEOUT_MS > 120_000, true);
  assert.equal(MEDIA_REAPER_REQUEST_TIMEOUT_MS < 300_000, true);

  await provePreviewMediaReaper({
    baseUrl: preview,
    cronSecret: 'acceptance-cron-secret-32-characters-minimum',
    providerIdentity: previewProviderIdentity(preview),
    fetchImpl: async (_url, options) => {
      requests += 1;
      if (requests === 1) return mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401);
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(options.signal.reason);
        };
        const timer = setTimeout(() => {
          options.signal.removeEventListener('abort', onAbort);
          resolve();
        }, 15_100);
        options.signal.addEventListener('abort', onAbort, { once: true });
      });
      return mediaReaperResponse(mediaReaperSummary());
    },
  });
  assert.equal(requests, 2);
});

test('cleanup plan removes child content before moderation, account suspension, and venues', async () => {
  const { planCleanupActions } = await moduleUnderTest();
  const actions = planCleanupActions({
    promotionIds: ['promotion-1'],
    menuItemIds: ['menu-1'],
    favoriteVenueKey: 'favorite-1',
    reviewId: 'review-1',
    submissionId: 'submission-1',
    merchantSessionActive: true,
    merchantId: 'merchant-1',
    venueIds: ['venue-a', 'venue-b'],
    customerSessionActive: true,
    adminAActive: false,
    adminBActive: true,
  });

  assert.deepEqual(actions.map((action) => action.kind), [
    'promotion.delete',
    'menu.delete',
    'favorite.delete',
    'review.reject',
    'submission.resolve',
    'merchant.suspend',
    'venue.delete',
    'venue.delete',
    'merchant.logout',
    'customer.logout',
    'admin-b.logout',
  ]);
  assert.deepEqual(actions.filter((action) => action.kind === 'venue.delete').map((action) => action.id), [
    'venue-b',
    'venue-a',
  ]);

  const mediaId = '11111111-1111-4111-8111-111111111111';
  assert.equal(planCleanupActions({ mediaIds: [mediaId], mediaAttached: false }).some((action) => action.kind === 'media.release'), true);
  assert.equal(planCleanupActions({ mediaIds: [mediaId], mediaAttached: true }).some((action) => action.kind === 'media.release'), false);
});

test('signed media receipt is bound to the expected Preview Supabase project, owner, and media id', async () => {
  const { validateSignedUploadReceipt } = await moduleUnderTest();
  const customerId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const uploadUrl = `https://previewproject.supabase.co/storage/v1/object/upload/sign/mesto-media-staging/${customerId}/${mediaId}/source.jpg?token=opaque`;
  assert.equal(validateSignedUploadReceipt({ mediaId, uploadUrl, maxBytes: 6 * 1024 * 1024, expiresAt: SIGNED_UPLOAD_EXPIRES_AT }, {
    customerId,
    expectedSupabaseProjectRef: 'previewproject',
    observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS,
  }).mediaId, mediaId);
  assert.throws(() => validateSignedUploadReceipt({ mediaId, uploadUrl, maxBytes: 6 * 1024 * 1024, expiresAt: SIGNED_UPLOAD_EXPIRES_AT }, {
    customerId,
    expectedSupabaseProjectRef: 'productionproject',
    observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS,
  }), { code: 'MEDIA_SIGNED_URL_PROVIDER_MISMATCH' });
  assert.throws(() => validateSignedUploadReceipt({
    mediaId,
    uploadUrl: uploadUrl.replace(customerId, '33333333-3333-4333-8333-333333333333'),
    maxBytes: 6 * 1024 * 1024,
    expiresAt: SIGNED_UPLOAD_EXPIRES_AT,
  }, {
    customerId,
    expectedSupabaseProjectRef: 'previewproject',
    observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS,
  }), { code: 'MEDIA_SIGNED_URL_PATH_MISMATCH' });
});

test('signed media expiry is exact ISO, near the provider two-hour TTL, and retains a fail-closed cleanup deadline', async () => {
  const { registerSignedUploadReceipt, validateSignedUploadExpiry } = await moduleUnderTest();
  const customerId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const uploadUrl = `https://previewproject.supabase.co/storage/v1/object/upload/sign/mesto-media-staging/${customerId}/${mediaId}/source.jpg?token=opaque`;
  const valid = validateSignedUploadExpiry(SIGNED_UPLOAD_EXPIRES_AT, { observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS });
  assert.equal(valid.horizonMs, 2 * 60 * 60 * 1_000);
  assert.equal(valid.notBefore, '2026-08-11T12:05:30.000Z');

  for (const [expiresAt, code] of [
    ['', 'MEDIA_EXPIRES_AT_INVALID'],
    ['2026-08-11T12:00:00Z', 'MEDIA_EXPIRES_AT_INVALID'],
    ['2026-08-11T10:30:00.000Z', 'MEDIA_EXPIRES_AT_TOO_EARLY'],
    ['2026-08-11T13:00:00.000Z', 'MEDIA_EXPIRES_AT_TOO_LATE'],
  ]) {
    const state = { mediaIds: [] };
    assert.throws(() => registerSignedUploadReceipt(state, {
      mediaId,
      uploadUrl,
      maxBytes: 6 * 1024 * 1024,
      expiresAt,
    }, {
      customerId,
      expectedSupabaseProjectRef: 'previewproject',
      observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS,
    }), { code });
    assert.deepEqual(state.mediaIds, [mediaId]);
    assert.equal(state.mediaCleanupDeadlines.length, 1);
    assert.equal(state.mediaCleanupDeadlines[0].valid, false);
    assert.equal(state.mediaCleanupDeadlines[0].failureCode, code);
  }
});

test('signed media id is retained for cleanup before later receipt contract checks and is deduplicated', async () => {
  const { registerSignedUploadReceipt } = await moduleUnderTest();
  const state = { mediaIds: [] };
  const customerId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const invalidReceipt = {
    mediaId,
    uploadUrl: `https://productionproject.supabase.co/storage/v1/object/upload/sign/mesto-media-staging/${customerId}/${mediaId}/source.jpg?token=opaque`,
    maxBytes: 6 * 1024 * 1024,
    expiresAt: SIGNED_UPLOAD_EXPIRES_AT,
  };
  const options = {
    customerId,
    expectedSupabaseProjectRef: 'previewproject',
    observedAtMs: SIGNED_UPLOAD_OBSERVED_AT_MS,
    phase: 'media.sign',
  };

  assert.throws(() => registerSignedUploadReceipt(state, invalidReceipt, options), {
    code: 'MEDIA_SIGNED_URL_PROVIDER_MISMATCH',
  });
  assert.throws(() => registerSignedUploadReceipt(state, invalidReceipt, options), {
    code: 'MEDIA_SIGNED_URL_PROVIDER_MISMATCH',
  });
  assert.deepEqual(state.mediaIds, [mediaId]);
  assert.equal(state.mediaCleanupDeadlines.length, 1);
  assert.deepEqual(state.mediaCleanupDeadlines[0], retainedCleanupDeadline(mediaId));
});

test('malformed signed upload authority, path, or token contract performs zero provider requests', async () => {
  const { prepareMediaSubmission } = await moduleUnderTest();
  const customerId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const validBase = `https://previewproject.supabase.co/storage/v1/object/upload/sign/mesto-media-staging/${customerId}/${mediaId}/source.jpg`;
  const cases = [
    [`${validBase}/suffix?token=opaque`, 'MEDIA_SIGNED_URL_PATH_MISMATCH'],
    [`${validBase}%2Fsuffix?token=opaque`, 'MEDIA_SIGNED_URL_PATH_MISMATCH'],
    [`https://previewproject.supabase.co:443${new URL(validBase).pathname}?token=opaque`, 'MEDIA_SIGNED_URL_PROVIDER_MISMATCH'],
    [`${validBase}?token=opaque#fragment`, 'MEDIA_SIGNED_URL_INVALID'],
    [`${validBase}?token=`, 'MEDIA_SIGNED_URL_TOKEN_INVALID'],
    [`${validBase}?token=one&token=two`, 'MEDIA_SIGNED_URL_TOKEN_INVALID'],
    [`${validBase}?token=opaque&download=1`, 'MEDIA_SIGNED_URL_TOKEN_INVALID'],
  ];
  let providerRequests = 0;
  for (const [uploadUrl, code] of cases) {
    const state = {
      customerId,
      mediaCleanupDeadlines: [],
      mediaIds: [],
      mutationIntent: null,
    };
    await assert.rejects(prepareMediaSubmission({
      customer: {
        async request({ phase }) {
          assert.equal(phase, 'media.sign');
          return {
            status: 201,
            data: {
              mediaId,
              uploadUrl,
              maxBytes: 6 * 1024 * 1024,
              expiresAt: SIGNED_UPLOAD_EXPIRES_AT,
            },
          };
        },
      },
      expectedSupabaseProjectRef: 'previewproject',
      fetchImpl: async () => {
        providerRequests += 1;
        throw new Error('provider request must not occur');
      },
      identity: { customer: {} },
      now: () => SIGNED_UPLOAD_OBSERVED_AT_MS,
      runId: 'invalid-signature',
      state,
    }), { code });
  }
  assert.equal(providerRequests, 0);
});

test('published media manifest requires exact provider path, media id, variant, version, and unique URLs', async () => {
  const { validatePublishedMediaEntry } = await moduleUnderTest();
  const projectRef = 'previewproject';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const otherMediaId = '33333333-3333-4333-8333-333333333333';
  const versionId = '44444444-4444-4444-8444-444444444444';
  const otherVersionId = '55555555-5555-4555-8555-555555555555';
  const entry = (variant, { id = mediaId, version = versionId, url, contentType = 'image/webp' } = {}) => ({
    url: url || `https://${projectRef}.supabase.co/storage/v1/object/public/mesto-media-public/assets/${id}/${version}/${variant}.webp`,
    contentType,
  });
  const expectations = (variant, seenUrls = new Set(), expectedVersionId = versionId) => ({
    expectedSupabaseProjectRef: projectRef,
    expectedMediaId: mediaId,
    expectedVariant: variant,
    expectedVersionId,
    seenUrls,
    phase: `media.public-${variant}`,
  });

  const seenUrls = new Set();
  for (const variant of ['thumb', 'card', 'hero']) {
    const validated = validatePublishedMediaEntry(entry(variant), expectations(variant, seenUrls));
    assert.equal(validated.versionId, versionId);
  }
  assert.equal(seenUrls.size, 3);

  const duplicateUrls = new Set();
  const duplicateEntry = entry('thumb');
  validatePublishedMediaEntry(duplicateEntry, expectations('thumb', duplicateUrls));
  assert.throws(
    () => validatePublishedMediaEntry(duplicateEntry, expectations('thumb', duplicateUrls)),
    { code: 'PUBLIC_MEDIA_URL_DUPLICATE' },
  );
  assert.throws(
    () => validatePublishedMediaEntry(entry('thumb', { id: otherMediaId }), expectations('thumb')),
    { code: 'PUBLIC_MEDIA_ID_MISMATCH' },
  );
  assert.throws(
    () => validatePublishedMediaEntry(entry('thumb'), expectations('card')),
    { code: 'PUBLIC_MEDIA_VARIANT_MISMATCH' },
  );
  assert.throws(
    () => validatePublishedMediaEntry(entry('thumb', { version: otherVersionId }), expectations('thumb')),
    { code: 'PUBLIC_MEDIA_VERSION_MISMATCH' },
  );
  assert.throws(
    () => validatePublishedMediaEntry(entry('thumb', { contentType: 'image/webp; charset=utf-8' }), expectations('thumb')),
    { code: 'PUBLIC_MEDIA_MANIFEST_TYPE_MISMATCH' },
  );
});

test('published media URL rejects credentials, ports, query strings, and fragments', async () => {
  const { validatePublishedMediaEntry } = await moduleUnderTest();
  const projectRef = 'previewproject';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const versionId = '44444444-4444-4444-8444-444444444444';
  const path = `/storage/v1/object/public/mesto-media-public/assets/${mediaId}/${versionId}/thumb.webp`;
  const options = {
    expectedSupabaseProjectRef: projectRef,
    expectedMediaId: mediaId,
    expectedVariant: 'thumb',
    expectedVersionId: versionId,
    phase: 'media.public-thumb',
  };
  const invalidUrls = [
    `https://user:password@${projectRef}.supabase.co${path}`,
    `https://${projectRef}.supabase.co:443${path}`,
    `https://${projectRef}.supabase.co:8443${path}`,
    `https://${projectRef}.supabase.co${path}?download=1`,
    `https://${projectRef}.supabase.co${path}#fragment`,
  ];
  for (const url of invalidUrls) {
    assert.throws(
      () => validatePublishedMediaEntry({ url, contentType: 'image/webp' }, { ...options, seenUrls: new Set() }),
      (error) => ['PUBLIC_MEDIA_PROVIDER_MISMATCH', 'PUBLIC_MEDIA_URL_INVALID'].includes(error.code),
    );
  }
});

test('published media headers require exact WebP media type and parsed immutable cache directives', async () => {
  const { validatePublishedMediaHeaders } = await moduleUnderTest();
  for (const contentType of ['image/webp', 'image/webp; charset=binary']) {
    assert.deepEqual(validatePublishedMediaHeaders(new Headers({
      'content-type': contentType,
      'cache-control': 'immutable, public, max-age = 31536000',
    }), 'media.headers').mediaType, 'image/webp');
  }

  for (const contentType of ['image/webp2', 'image/webpfoo; charset=utf-8', 'text/image/webp']) {
    assert.throws(() => validatePublishedMediaHeaders(new Headers({
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    }), 'media.headers'), { code: 'PUBLIC_MEDIA_TYPE_MISMATCH' });
  }

  for (const cacheControl of [
    'private, max-age=31536000, immutable',
    'public, no-store, max-age=31536000, immutable',
    'public, no-cache, immutable',
    'public, max-age=315360000, immutable',
    'public, s-max-age=31536000, immutable',
    'public, s-maxage=31536000, immutable',
    'public, max-age=31536000, max-age=31536000, immutable',
    'public, max-age=31536000, max-age=0, immutable',
    'public,,max-age=31536000,immutable',
    'public=true, max-age=31536000, immutable',
    'public, max-age=31536000',
  ]) {
    assert.throws(() => validatePublishedMediaHeaders(new Headers({
      'content-type': 'image/webp',
      'cache-control': cacheControl,
    }), 'media.headers'), { code: 'PUBLIC_MEDIA_CACHE_POLICY_MISMATCH' });
  }
});

test('preview acceptance cancels an oversized chunked response before buffering it', async () => {
  const { boundedResponseBody } = await moduleUnderTest();
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(3));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(boundedResponseBody(new Response(body), 'test.response', 5), {
    code: 'RESPONSE_TOO_LARGE',
  });
  assert.equal(cancelled, true);
});

test('private Storage denial accepts only phase-specific documented or observed Supabase missing-object contracts', async () => {
  const { assertPrivateStorageDenied } = await moduleUnderTest();
  const privateUrl = 'https://previewproject.supabase.co/storage/v1/object/public/mesto-media-staging/object.jpg';
  const storageError = (error, status = 404, statusCode = String(status)) => new Response(JSON.stringify({
    statusCode,
    error,
    message: error === 'NoSuchBucket'
      ? 'The specified bucket does not exist'
      : 'The specified key does not exist',
  }), { status });

  assert.equal(
    await assertPrivateStorageDenied(
      async () => storageError('NoSuchBucket'),
      privateUrl,
      'media.staging-private-after-upload',
    ),
    404,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => new Response(JSON.stringify({ code: 'NoSuchBucket', message: 'Bucket not found' }), { status: 404 }),
      privateUrl,
      'media.staging-private-after-upload',
    ),
    404,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => new Response(JSON.stringify({ statusCode: 404, error: 'NoSuchBucket' }), { status: 404 }),
      privateUrl,
      'media.staging-private-after-upload',
    ),
    404,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => transitionalStorageResponse('NoSuchBucket'),
      privateUrl,
      'media.staging-private-after-upload',
    ),
    400,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => transitionalStorageResponse('NoSuchKey'),
      privateUrl,
      'media.staging-private-before-upload',
      { allowMissingObject: true },
    ),
    400,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => storageError('NoSuchKey'),
      privateUrl,
      'media.staging-private-before-upload',
      { allowMissingObject: true },
    ),
    404,
  );
  assert.equal(
    await assertPrivateStorageDenied(
      async () => storageError('NoSuchBucket'),
      privateUrl,
      'media.staging-private-before-upload',
      { allowMissingObject: true },
    ),
    404,
  );
  await assert.rejects(
    assertPrivateStorageDenied(
      async () => storageError('NoSuchKey'),
      privateUrl,
      'media.staging-private-after-upload',
    ),
    { code: 'STORAGE_ERROR_CODE_INVALID' },
  );
  await assert.rejects(
    assertPrivateStorageDenied(
      async () => storageError('NoSuchKey'),
      privateUrl,
      'media.review-private-thumb',
    ),
    { code: 'STORAGE_ERROR_CODE_INVALID' },
  );

  for (const status of [400, 403, 410, 429, 500, 503]) {
    await assert.rejects(
      assertPrivateStorageDenied(async () => new Response('unavailable', { status }), privateUrl, 'media.private'),
      { code: 'STORAGE_ERROR_CONTRACT_INVALID' },
    );
  }
  await assert.rejects(
    assertPrivateStorageDenied(async () => storageError('NoSuchBucket', 403), privateUrl, 'media.private'),
    { code: 'STORAGE_ERROR_STATUS_INVALID' },
  );
  await assert.rejects(
    assertPrivateStorageDenied(async () => storageError('NoSuchBucket', 404, '403'), privateUrl, 'media.private'),
    { code: 'STORAGE_ERROR_BODY_STATUS_INVALID' },
  );
  for (const payload of [
    { code: 'not_found', message: 'missing' },
    { statusCode: '404', error: 'not_found', message: 'missing' },
    { statusCode: '404', code: 'NoSuchKey', error: 'NoSuchBucket', message: 'conflict' },
    { code: 'NoSuchBucket' },
    { statusCode: '403', code: 'NoSuchBucket', error: 'Bucket not found', message: 'conflicting status' },
  ]) {
    await assert.rejects(
      assertPrivateStorageDenied(
        async () => new Response(JSON.stringify(payload), { status: payload.error === 'Bucket not found' ? 400 : 404 }),
        privateUrl,
        'media.private',
      ),
      (error) => ['STORAGE_ERROR_BODY_STATUS_INVALID', 'STORAGE_ERROR_CODE_INVALID', 'STORAGE_ERROR_CONTRACT_INVALID'].includes(error.code),
    );
  }
});

test('published media deletion requires exact NoSuchKey on both the warmed and nonce URL', async () => {
  const { waitForPublishedMediaDeletion } = await moduleUnderTest();
  const publicUrl = 'https://preview.supabase.co/object.webp';
  let bothDeletedProbes = 0;
  assert.equal(
    await waitForPublishedMediaDeletion(async () => {
      bothDeletedProbes += 1;
      return noSuchKeyResponse();
    }, [publicUrl], 'media.delete', 1),
    true,
  );
  assert.equal(bothDeletedProbes, 2);
  let transitionalProbes = 0;
  assert.equal(
    await waitForPublishedMediaDeletion(async () => {
      transitionalProbes += 1;
      return transitionalStorageResponse('NoSuchKey');
    }, [publicUrl], 'media.delete', 1),
    true,
  );
  assert.equal(transitionalProbes, 2);

  const observedUrls = [];
  await assert.rejects(
    waitForPublishedMediaDeletion(async (url) => {
      observedUrls.push(String(url));
      return new URL(url).search ? noSuchKeyResponse() : new Response('still cached', { status: 200 });
    }, [publicUrl], 'media.delete', 2, {
      now: () => SIGNED_UPLOAD_OBSERVED_AT_MS,
      sleep: async () => {},
    }),
    { code: 'PUBLIC_MEDIA_CLEANUP_NOT_PROPAGATED' },
  );
  assert.equal(observedUrls.length, 4);
  assert.equal(observedUrls.filter((url) => url === publicUrl).length, 2);
  assert.equal(observedUrls.filter((url) => new URL(url).searchParams.has('mestoCleanupProbe')).length, 2);
});

test('published media deletion rejects provider outages and generic errors as inconclusive', async () => {
  const { waitForPublishedMediaDeletion } = await moduleUnderTest();
  const publicUrl = 'https://preview.supabase.co/object.webp';
  await assert.rejects(
    waitForPublishedMediaDeletion(async () => new Response('unavailable', { status: 503 }), [publicUrl], 'media.delete', 1),
    { code: 'STORAGE_ERROR_CONTRACT_INVALID' },
  );
  await assert.rejects(
    waitForPublishedMediaDeletion(async () => new Response(JSON.stringify({
      statusCode: '410',
      error: 'NoSuchKey',
    }), { status: 410 }), [publicUrl], 'media.delete', 1),
    { code: 'STORAGE_ERROR_STATUS_INVALID' },
  );
  await assert.rejects(
    waitForPublishedMediaDeletion(async () => noSuchKeyResponse(), [`${publicUrl}?stale=1`], 'media.delete', 1),
    { code: 'PUBLIC_MEDIA_URL_INVALID' },
  );
});

test('venue delete receipt requires exact success and completed private media cleanup', async () => {
  const { validateVenueDeleteReceipt } = await moduleUnderTest();
  assert.deepEqual(validateVenueDeleteReceipt({ status: 200, data: { ok: true } }, 'cleanup.venue'), { ok: true });
  assert.deepEqual(
    validateVenueDeleteReceipt({ status: 200, data: { ok: true, mediaCleanupPending: false } }, 'cleanup.venue'),
    { ok: true, mediaCleanupPending: false },
  );
  assert.throws(
    () => validateVenueDeleteReceipt({ status: 503, data: { ok: true } }, 'cleanup.venue'),
    { code: 'VENUE_DELETE_STATUS_INVALID' },
  );
  for (const data of [null, {}, { ok: 'true' }, { ok: true, mediaCleanupPending: 'false' }]) {
    assert.throws(
      () => validateVenueDeleteReceipt({ status: 200, data }, 'cleanup.venue'),
      { code: 'VENUE_DELETE_CONTRACT_FAILED' },
    );
  }
  assert.throws(
    () => validateVenueDeleteReceipt({ status: 200, data: { ok: true, mediaCleanupPending: true } }, 'cleanup.venue'),
    { code: 'VENUE_MEDIA_CLEANUP_PENDING' },
  );
});

test('submission rejection receipt requires explicit completed media cleanup', async () => {
  const { validateSubmissionRejectionReceipt } = await moduleUnderTest();
  assert.deepEqual(
    validateSubmissionRejectionReceipt({ status: 200, data: { mediaCleanupPending: false } }, 'cleanup.submission'),
    { mediaCleanupPending: false },
  );
  assert.throws(
    () => validateSubmissionRejectionReceipt({ status: 503, data: { mediaCleanupPending: false } }, 'cleanup.submission'),
    { code: 'SUBMISSION_REJECT_STATUS_INVALID' },
  );
  for (const data of [null, {}, { mediaCleanupPending: 'false' }]) {
    assert.throws(
      () => validateSubmissionRejectionReceipt({ status: 200, data }, 'cleanup.submission'),
      { code: 'SUBMISSION_REJECT_CONTRACT_FAILED' },
    );
  }
  assert.throws(
    () => validateSubmissionRejectionReceipt({ status: 200, data: { mediaCleanupPending: true } }, 'cleanup.submission'),
    { code: 'SUBMISSION_MEDIA_CLEANUP_PENDING' },
  );
});

test('pending submission cleanup fails on an incomplete rejection receipt before dashboard status can mask it', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const submissionId = '11111111-1111-4111-8111-111111111111';
  let dashboardVerifyRequests = 0;
  const outcome = await cleanupArtifacts({
    submissionId,
    venueIds: [],
  }, {
    adminB: {
      async request({ phase }) {
        if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
        if (phase === 'cleanup.submission.inspect') {
          return { status: 200, data: { submissions: [{ id: submissionId, status: 'pending' }] } };
        }
        if (phase === 'cleanup.submission') {
          return { status: 200, data: { mediaCleanupPending: true } };
        }
        if (phase === 'cleanup.submission.verify') {
          dashboardVerifyRequests += 1;
          return { status: 200, data: { submissions: [{ id: submissionId, status: 'rejected' }] } };
        }
        throw new Error(`Unexpected phase: ${phase}`);
      },
    },
    runId: 'reject-receipt',
  });
  assert.equal(outcome.complete, false);
  assert.equal(outcome.failures[0].failure.code, 'SUBMISSION_MEDIA_CLEANUP_PENDING');
  assert.equal(dashboardVerifyRequests, 0);
});

test('both admin venue cleanup paths fail on pending private cleanup after venue and public URLs are gone', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const venueId = '11111111-1111-4111-8111-111111111111';
  const submissionId = '22222222-2222-4222-8222-222222222222';
  const mediaId = '33333333-3333-4333-8333-333333333333';
  const customerId = '44444444-4444-4444-8444-444444444444';
  const publicUrl = 'https://previewproject.supabase.co/storage/v1/object/public/mesto-media-public/assets/asset.webp';
  const mediaState = {
    mediaIds: [mediaId],
    mediaAttached: true,
    mediaCleanupDeadlines: [retainedCleanupDeadline(mediaId)],
  };
  const scenarios = [
    {
      state: { ...mediaState, venueIds: [venueId], approvedVenueId: venueId, publicMediaUrls: [publicUrl] },
      deletePhase: 'cleanup.venue',
      verifyPhase: 'cleanup.venue.verify',
      failureKind: 'venue.delete',
    },
    {
      state: { ...mediaState, customerId, submissionId, venueIds: [], publicMediaUrls: [publicUrl] },
      deletePhase: 'cleanup.approved-venue',
      verifyPhase: 'cleanup.approved-venue.verify',
      failureKind: 'submission.resolve',
    },
  ];

  for (const scenario of scenarios) {
    const phases = [];
    let publicDeletionProbes = 0;
    const adminB = {
      async request({ phase }) {
        phases.push(phase);
        if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
        if (phase === 'cleanup.submission.inspect') {
          return {
            status: 200,
            data: { submissions: [{
              id: submissionId,
              title: 'Acceptance Submission test-run',
              description: 'Disposable venue submission for provider-backed acceptance run test-run.',
              submitted_by: customerId,
              status: 'approved',
              approved_venue_id: venueId,
            }] },
          };
        }
        if (phase === 'cleanup.approved-venue.inspect') {
          return {
            status: 200,
            data: { venues: [{
              id: venueId,
              slug: 'acceptance-submission-test-run-22222222',
              title: 'Acceptance Submission test-run',
              description: 'Disposable venue submission for provider-backed acceptance run test-run.',
              source: 'community',
              status: 'published',
              created_by: customerId,
            }] },
          };
        }
        if (phase === scenario.deletePhase) {
          return { status: 200, data: { ok: true, mediaCleanupPending: true } };
        }
        if (phase === scenario.verifyPhase) return { status: 200, data: { venues: [] } };
        throw new Error(`Unexpected phase: ${phase}`);
      },
    };
    const outcome = await cleanupArtifacts(scenario.state, {
      adminB,
      fetchImpl: async () => {
        publicDeletionProbes += 1;
        return noSuchKeyResponse();
      },
      now: () => Date.parse('2026-08-11T12:05:31.000Z'),
      runId: 'test-run',
      sleep: async () => { throw new Error('cleanup gate should already be open'); },
    });

    assert.equal(phases.includes(scenario.verifyPhase), true);
    assert.equal(publicDeletionProbes, 2);
    assert.equal(outcome.complete, false);
    const expectedFailure = outcome.failures.find((failure) => failure.kind === scenario.failureKind);
    assert.equal(expectedFailure.failure.code, 'VENUE_MEDIA_CLEANUP_PENDING');
    assert.equal(outcome.mediaCleanupGate.passed, true);
  }
});

test('cleanup waits through signed-upload expiry, tombstone grace, and clock buffer before one venue delete', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const venueId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const deadline = retainedCleanupDeadline(mediaId);
  let currentMs = deadline.notBeforeMs - 7_000;
  let deleteCalls = 0;
  let sleepCalls = 0;
  const adminB = {
    async request({ phase }) {
      if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
      if (phase === 'cleanup.venue') {
        assert.equal(currentMs >= deadline.notBeforeMs, true);
        deleteCalls += 1;
        return { status: 200, data: { ok: true, mediaCleanupPending: false } };
      }
      if (phase === 'cleanup.venue.verify') return { status: 200, data: { venues: [] } };
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };

  const outcome = await cleanupArtifacts({
    approvedVenueId: venueId,
    mediaAttached: true,
    mediaCleanupDeadlines: [deadline],
    mediaIds: [mediaId],
    venueIds: [venueId],
  }, {
    adminB,
    now: () => currentMs,
    runId: 'test-run',
    sleep: async (milliseconds) => {
      assert.equal(deleteCalls, 0);
      sleepCalls += 1;
      currentMs += milliseconds;
    },
  });

  assert.equal(outcome.complete, true);
  assert.equal(deleteCalls, 1);
  assert.equal(sleepCalls, 1);
  assert.deepEqual(outcome.mediaCleanupGate, {
    required: true,
    passed: true,
    deadlineCount: 1,
    expiresAt: deadline.expiresAt,
    notBefore: deadline.notBefore,
    requestedWaitMs: 7_000,
    waitedMs: 7_000,
    waitCalls: 1,
  });
});

test('cleanup reuses one latest media wait, cleans ordinary artifacts before reaper, and logs out afterward', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const venueId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const abandonedMediaId = '33333333-3333-4333-8333-333333333333';
  const customerId = '44444444-4444-4444-8444-444444444444';
  const deadline = retainedCleanupDeadline(mediaId);
  const abandonedDeadline = retainedCleanupDeadline(abandonedMediaId);
  const customerIdentity = {
    username: 'acceptance.customer.reaper-order',
    email: 'acceptance.customer.reaper-order@example.invalid',
  };
  const order = [];
  let currentMs = deadline.notBeforeMs - 7_000;
  let sleepCalls = 0;
  let authenticated = true;
  let cronCalls = 0;
  const customer = {
    async request({ phase }) {
      if (phase === 'cleanup.customer-session') {
        order.push('customer.identity');
        return {
          status: 200,
          data: authenticated
            ? { authenticated: true, user: { id: customerId, ...customerIdentity, role: 'customer' } }
            : { authenticated: false },
        };
      }
      if (phase === 'media-reaper.probe.exists-before-invoke') {
        order.push('status.exists-before');
        return { status: 200, noStore: true, data: { mediaId: abandonedMediaId, exists: true } };
      }
      if (phase === 'media-reaper.probe.absent-after') {
        order.push('status.absent-after');
        return { status: 200, noStore: true, data: { mediaId: abandonedMediaId, exists: false } };
      }
      if (phase === 'cleanup.customer-logout') {
        order.push('customer.logout');
        authenticated = false;
        return { status: 200, data: { ok: true } };
      }
      if (phase === 'cleanup.customer-logout.verify') {
        order.push('customer.logout.verify');
        return { status: 200, data: { authenticated } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };
  const adminB = {
    async request({ phase }) {
      if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
      if (phase === 'cleanup.venue') {
        order.push('venue.delete');
        return { status: 200, data: { ok: true, mediaCleanupPending: false } };
      }
      if (phase === 'cleanup.venue.verify') {
        order.push('venue.verify');
        return { status: 200, data: { venues: [] } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };
  const cronFetch = async () => {
    cronCalls += 1;
    order.push(cronCalls === 1 ? 'cron.unauthorized' : 'cron.authenticated');
    return cronCalls === 1
      ? mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401)
      : mediaReaperResponse(mediaReaperSummary());
  };

  const outcome = await cleanupArtifacts({
    abandonedMediaExistenceProven: true,
    abandonedMediaId,
    abandonedMediaIds: [abandonedMediaId],
    approvedVenueId: venueId,
    customerId,
    customerSessionActive: true,
    mediaAttached: true,
    mediaCleanupDeadlines: [deadline, abandonedDeadline],
    mediaIds: [mediaId],
    venueIds: [venueId],
  }, {
    adminB,
    customer,
    identity: { customer: customerIdentity },
    mediaReaper: {
      baseUrl: preview,
      cronSecret: 'acceptance-cron-secret-32-characters-minimum',
      fetchImpl: cronFetch,
      providerIdentity: previewProviderIdentity(preview),
    },
    now: () => currentMs,
    runId: 'reaper-order',
    sleep: async (milliseconds) => {
      order.push('media.wait');
      sleepCalls += 1;
      currentMs += milliseconds;
    },
  });

  assert.equal(outcome.complete, true);
  assert.equal(sleepCalls, 1);
  assert.equal(cronCalls, 2);
  assert.equal(outcome.mediaCleanupGate.deadlineCount, 2);
  assert.equal(outcome.mediaCleanupGate.waitCalls, 1);
  assert.equal(outcome.mediaReaperProof.completed, true);
  assert.deepEqual(outcome.mediaReaperProof.evidence.abandonedMediaAbsenceProof, {
    proven: true,
    existedBefore: true,
    existsImmediatelyBeforeInvoke: true,
    existsAfter: false,
  });
  for (const [before, after] of [
    ['media.wait', 'venue.delete'],
    ['venue.verify', 'status.exists-before'],
    ['status.exists-before', 'cron.unauthorized'],
    ['cron.unauthorized', 'cron.authenticated'],
    ['cron.authenticated', 'status.absent-after'],
    ['status.absent-after', 'customer.logout'],
  ]) {
    assert.equal(order.indexOf(before) < order.indexOf(after), true, `${before} must precede ${after}`);
  }
});

test('post-dispatch media reaper failure does not retry or release a candidate after malformed owner readback', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const abandonedMediaId = '22222222-2222-4222-8222-222222222222';
  const wrongMediaId = '33333333-3333-4333-8333-333333333333';
  const deadline = retainedCleanupDeadline(abandonedMediaId);
  const customerIdentity = {
    username: 'acceptance.customer.reaper-fallback',
    email: 'acceptance.customer.reaper-fallback@example.invalid',
  };
  let cronRequests = 0;
  let releaseRequests = 0;
  const outcome = await cleanupArtifacts({
    abandonedMediaExistenceProven: true,
    abandonedMediaId,
    abandonedMediaIds: [abandonedMediaId],
    customerId,
    mediaCleanupDeadlines: [deadline],
    mediaIds: [],
    venueIds: [],
  }, {
    customer: {
      async request({ phase }) {
        if (phase === 'cleanup.customer-session') {
          return {
            status: 200,
            data: { authenticated: true, user: { id: customerId, ...customerIdentity, role: 'customer' } },
          };
        }
        if (phase === 'media-reaper.probe.exists-before-invoke') {
          return { status: 200, noStore: true, data: { mediaId: abandonedMediaId, exists: true } };
        }
        if (phase === 'cleanup.media-reaper-probe.inspect') {
          return { status: 200, noStore: true, data: { mediaId: wrongMediaId, exists: true } };
        }
        if (phase === 'cleanup.media-reaper-probe.release') {
          releaseRequests += 1;
          return { status: 200, data: { released: [abandonedMediaId] } };
        }
        throw new Error(`Unexpected phase: ${phase}`);
      },
    },
    identity: { customer: customerIdentity },
    mediaReaper: {
      baseUrl: preview,
      cronSecret: 'acceptance-cron-secret-32-characters-minimum',
      providerIdentity: previewProviderIdentity(preview),
      fetchImpl: async () => {
        cronRequests += 1;
        return cronRequests === 1
          ? mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_UNAUTHORIZED' }, 401)
          : mediaReaperResponse({ ok: false, code: 'MEDIA_REAPER_FAILED' }, 503);
      },
    },
    now: () => deadline.notBeforeMs + 1,
    runId: 'reaper-fallback',
    sleep: async () => { throw new Error('gate is open'); },
  });

  assert.equal(outcome.complete, false);
  assert.equal(cronRequests, 2);
  assert.equal(releaseRequests, 0);
  assert.equal(outcome.failures.some((item) => item.failure.code === 'MEDIA_REAPER_STATUS_INVALID'), true);
  assert.equal(outcome.failures.some((item) => item.failure.code === 'MEDIA_STATUS_CONTRACT_INVALID'), true);
});

test('wrong authenticated cleanup sessions cannot dispatch owner readback, cron, or merchant mutation', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const preview = 'https://mesto-city-guide-abc123-team.vercel.app';
  const expectedCustomerId = '11111111-1111-4111-8111-111111111111';
  const wrongCustomerId = '22222222-2222-4222-8222-222222222222';
  const abandonedMediaId = '33333333-3333-4333-8333-333333333333';
  const customerIdentity = {
    username: 'acceptance.customer.identity-fence',
    email: 'acceptance.customer.identity-fence@example.invalid',
  };
  const deadline = retainedCleanupDeadline(abandonedMediaId);
  let customerNonSessionRequests = 0;
  let cronRequests = 0;
  const customerOutcome = await cleanupArtifacts({
    abandonedMediaExistenceProven: true,
    abandonedMediaId,
    abandonedMediaIds: [abandonedMediaId],
    customerId: expectedCustomerId,
    mediaCleanupDeadlines: [deadline],
    mediaIds: [],
    venueIds: [],
  }, {
    customer: {
      async request({ phase }) {
        if (phase === 'cleanup.customer-session') {
          return {
            status: 200,
            data: {
              authenticated: true,
              user: { id: wrongCustomerId, ...customerIdentity, role: 'customer' },
            },
          };
        }
        customerNonSessionRequests += 1;
        throw new Error(`Forbidden request: ${phase}`);
      },
    },
    identity: { customer: customerIdentity },
    mediaReaper: {
      baseUrl: preview,
      cronSecret: 'acceptance-cron-secret-32-characters-minimum',
      fetchImpl: async () => {
        cronRequests += 1;
        throw new Error('must not dispatch cron');
      },
      providerIdentity: previewProviderIdentity(preview),
    },
    now: () => deadline.notBeforeMs + 1,
    runId: 'identity-fence',
    sleep: async () => { throw new Error('gate is open'); },
  });
  assert.equal(customerOutcome.complete, false);
  assert.equal(customerOutcome.failures.some((item) => item.failure.code === 'CUSTOMER_SESSION_IDENTITY_MISMATCH'), true);
  assert.equal(customerNonSessionRequests, 0);
  assert.equal(cronRequests, 0);

  const expectedMerchantId = '44444444-4444-4444-8444-444444444444';
  const wrongMerchantId = '55555555-5555-4555-8555-555555555555';
  const menuId = '66666666-6666-4666-8666-666666666666';
  const merchantIdentity = {
    username: 'acceptance.merchant.identity-fence',
    email: 'acceptance.merchant.identity-fence@example.invalid',
  };
  let merchantMutations = 0;
  let merchantLoginRequests = 0;
  const merchantOutcome = await cleanupArtifacts({
    currentMerchantPassword: 'known-disposable-password',
    menuItemIds: [menuId],
    merchantId: expectedMerchantId,
    promotionIds: [],
    venueIds: [],
  }, {
    adminB: {
      async request({ phase }) {
        if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
        if (phase === 'cleanup.merchant-suspend') return { status: 200, data: { ok: true } };
        if (phase === 'cleanup.merchant-suspend.verify') {
          return { status: 200, data: { merchants: [{ id: expectedMerchantId, status: 'suspended' }] } };
        }
        throw new Error(`Unexpected phase: ${phase}`);
      },
    },
    identity: { merchant: merchantIdentity },
    merchant: {
      async request({ phase }) {
        if (phase === 'cleanup.merchant-session') {
          return { status: 200, data: { authenticated: false } };
        }
        if (phase === 'cleanup.merchant-login') {
          merchantLoginRequests += 1;
          return { status: 200, data: { authenticated: true } };
        }
        if (phase === 'cleanup.merchant-login.verify') {
          return {
            status: 200,
            data: {
              authenticated: true,
              user: { id: wrongMerchantId, ...merchantIdentity, role: 'merchant' },
            },
          };
        }
        merchantMutations += 1;
        throw new Error(`Forbidden request: ${phase}`);
      },
    },
    runId: 'identity-fence',
  });
  assert.equal(merchantOutcome.complete, false);
  assert.equal(merchantOutcome.failures.some((item) => item.failure.code === 'MERCHANT_SESSION_IDENTITY_MISMATCH'), true);
  assert.equal(merchantLoginRequests, 1);
  assert.equal(merchantMutations, 0);
});

test('cleanup wait aborts fail closed and never issue a protected cleanup request', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const venueId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const deadline = retainedCleanupDeadline(mediaId);
  let protectedRequests = 0;
  const outcome = await cleanupArtifacts({
    approvedVenueId: venueId,
    mediaCleanupDeadlines: [deadline],
    venueIds: [venueId],
  }, {
    adminB: {
      async request() {
        protectedRequests += 1;
        throw new Error('must not execute');
      },
    },
    now: () => deadline.notBeforeMs - 1,
    runId: 'test-run',
    sleep: async () => { throw new Error('operator interrupted wait'); },
  });

  assert.equal(outcome.complete, false);
  assert.equal(outcome.mediaCleanupGate.passed, false);
  assert.equal(outcome.failures[0].failure.code, 'MEDIA_CLEANUP_WAIT_ABORTED');
  assert.equal(protectedRequests, 0);
});

test('cleanup with media evidence but no retained signed expiry fails before deletion', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const venueId = '11111111-1111-4111-8111-111111111111';
  let protectedRequests = 0;
  const outcome = await cleanupArtifacts({
    approvedVenueId: venueId,
    publicMediaUrls: ['https://previewproject.supabase.co/object.webp'],
    venueIds: [venueId],
  }, {
    adminB: {
      async request() {
        protectedRequests += 1;
        throw new Error('must not execute');
      },
    },
    now: () => SIGNED_UPLOAD_OBSERVED_AT_MS,
    runId: 'test-run',
    sleep: async () => {},
  });

  assert.equal(outcome.complete, false);
  assert.equal(outcome.mediaCleanupGate.passed, false);
  assert.equal(outcome.failures[0].failure.code, 'MEDIA_CLEANUP_DEADLINE_MISSING');
  assert.equal(protectedRequests, 0);
});

test('lost committed admin venue response is GET-reconciled before the cleanup plan is built', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const runId = 'lost-venue-run';
  const venueId = '11111111-1111-4111-8111-111111111111';
  const wrongCandidateId = '22222222-2222-4222-8222-222222222222';
  const phases = [];
  let reconciled = false;
  const adminB = {
    async request({ phase }) {
      phases.push(phase);
      if (phase === 'cleanup.reconcile.admin-session') return { status: 200, data: { authenticated: true } };
      if (phase === 'cleanup.reconcile.venue') {
        reconciled = true;
        return {
          status: 200,
          data: {
            venues: [{
              id: venueId,
              slug: `acceptance-${runId}-a`,
              title: `Acceptance Venue A ${runId}`,
              status: 'published',
            }],
          },
        };
      }
      if (phase === 'cleanup.venue') {
        assert.equal(reconciled, true);
        return { status: 200, data: { ok: true, mediaCleanupPending: false } };
      }
      if (phase === 'cleanup.venue.verify') return { status: 200, data: { venues: [] } };
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };

  const state = {
    ambiguousMutation: { phase: 'admin.venue-1.create', code: 'AMBIGUOUS_MUTATION_TRANSPORT_FAILURE' },
    venueCandidateIds: [wrongCandidateId],
    venueIds: [],
  };
  const outcome = await cleanupArtifacts(state, { adminB, runId });

  assert.equal(outcome.complete, true);
  assert.deepEqual(state.venueIds, [venueId]);
  assert.equal(state.venueCandidateIds.includes(wrongCandidateId), true);
  assert.equal(state.venueIds.includes(wrongCandidateId), false);
  assert.deepEqual(outcome.ambiguousReconciliation, {
    required: true,
    phase: 'admin.venue-1.create',
    completed: true,
    artifact: 'venue',
    matches: 1,
  });
  assert.equal(outcome.attempted, 1);
  assert.equal(phases.indexOf('cleanup.reconcile.venue') < phases.indexOf('cleanup.venue'), true);
});

test('committed submission with an invalid 201 receipt is reconciled from armed intent and never released as unattached', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const runId = 'lost-submission-run';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const submissionId = '22222222-2222-4222-8222-222222222222';
  const mediaId = '33333333-3333-4333-8333-333333333333';
  const deadline = retainedCleanupDeadline(mediaId);
  const phases = [];
  let rejected = false;
  const submission = (status) => ({
    id: submissionId,
    title: `Acceptance Submission ${runId}`,
    description: `Disposable venue submission for provider-backed acceptance run ${runId}.`,
    submitted_by: customerId,
    status,
    approved_venue_id: null,
  });
  const adminB = {
    async request({ phase }) {
      phases.push(phase);
      if (phase === 'cleanup.reconcile.admin-session') return { status: 200, data: { authenticated: true } };
      if (phase === 'cleanup.reconcile.submission') {
        return { status: 200, data: { submissions: [submission('pending')] } };
      }
      if (phase === 'cleanup.submission.inspect') {
        return { status: 200, data: { submissions: [submission('pending')] } };
      }
      if (phase === 'cleanup.submission') {
        rejected = true;
        return { status: 200, data: { mediaCleanupPending: false } };
      }
      if (phase === 'cleanup.submission.verify') {
        return { status: 200, data: { submissions: [submission(rejected ? 'rejected' : 'pending')] } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };

  const outcome = await cleanupArtifacts({
    customerId,
    mediaAttached: false,
    mediaCleanupDeadlines: [deadline],
    mediaIds: [mediaId],
    mutationIntent: { phase: 'customer.submission' },
    submissionId: '',
    venueIds: [],
  }, {
    adminB,
    now: () => deadline.notBeforeMs + 1,
    runId,
    sleep: async () => { throw new Error('gate is already open'); },
  });

  assert.equal(outcome.complete, true);
  assert.equal(outcome.ambiguousReconciliation.artifact, 'submission');
  assert.equal(outcome.ambiguousReconciliation.matches, 1);
  assert.equal(outcome.mediaCleanupGate.passed, true);
  assert.equal(phases.includes('cleanup.submission'), true);
  assert.equal(phases.includes('cleanup.media-release'), false);
  assert.equal(outcome.attempted, 1);
});

test('lost customer registration response without Set-Cookie recovers exact identity through known credentials', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const runId = 'lost-register-cookie';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const identity = {
    customer: {
      username: `acceptance.customer.${runId}`,
      email: `acceptance.customer.${runId}@example.invalid`,
      password: 'known-disposable-password',
    },
  };
  const phases = [];
  let authenticated = false;
  const customer = {
    async request({ phase, method = 'GET' }) {
      phases.push({ phase, method });
      if (phase === 'cleanup.reconcile.customer-session') {
        return { status: 200, data: { authenticated: false } };
      }
      if (phase === 'cleanup.reconcile.customer-login') {
        assert.equal(method, 'POST');
        authenticated = true;
        return { status: 200, data: { user: { id: customerId } } };
      }
      if (phase === 'cleanup.reconcile.customer-session-verified') {
        return {
          status: 200,
          data: { authenticated, user: { id: customerId, username: identity.customer.username, email: identity.customer.email } },
        };
      }
      if (phase === 'cleanup.customer-logout') {
        authenticated = false;
        return { status: 200, data: { ok: true } };
      }
      if (phase === 'cleanup.customer-logout.verify') {
        return { status: 200, data: { authenticated } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };

  const outcome = await cleanupArtifacts({
    customerId: '',
    customerSessionActive: false,
    mutationIntent: { phase: 'customer.register' },
    venueIds: [],
  }, { customer, identity, runId });

  assert.equal(outcome.complete, true);
  assert.equal(outcome.ambiguousReconciliation.artifact, 'customer-session');
  assert.equal(outcome.ambiguousReconciliation.matches, 1);
  assert.equal(outcome.unavoidableResiduals[0].kind, 'customer-account');
  assert.equal(phases.some((entry) => entry.phase === 'cleanup.reconcile.customer-login' && entry.method === 'POST'), true);
  assert.equal(outcome.attempted, 1);
});

test('authoritative zero submission match releases unattached media, while duplicate matches stay fail closed', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const runId = 'ambiguous-submission-cardinality';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const mediaId = '22222222-2222-4222-8222-222222222222';
  const deadline = retainedCleanupDeadline(mediaId);
  const customerIdentity = {
    username: `acceptance.customer.${runId}`,
    email: `acceptance.customer.${runId}@example.invalid`,
  };
  let releaseCalls = 0;
  const state = () => ({
    ambiguousMutation: { phase: 'customer.submission', code: 'AMBIGUOUS_MUTATION_TRANSPORT_FAILURE' },
    customerId,
    mediaAttached: false,
    mediaCleanupDeadlines: [deadline],
    mediaIds: [mediaId],
    submissionId: '',
    venueIds: [],
  });
  const context = (submissions) => ({
    adminB: {
      async request({ phase }) {
        if (phase === 'cleanup.reconcile.admin-session') return { status: 200, data: { authenticated: true } };
        if (phase === 'cleanup.reconcile.submission') return { status: 200, data: { submissions } };
        throw new Error(`Unexpected phase: ${phase}`);
      },
    },
    customer: {
      async request({ phase }) {
        if (phase === 'cleanup.customer-session') {
          return { status: 200, data: { authenticated: true, user: { id: customerId, ...customerIdentity, role: 'customer' } } };
        }
        if (phase === 'cleanup.media-release') {
          releaseCalls += 1;
          return { status: 200, data: { released: [mediaId] } };
        }
        throw new Error(`Unexpected phase: ${phase}`);
      },
    },
    identity: { customer: customerIdentity },
    now: () => deadline.notBeforeMs + 1,
    runId,
    sleep: async () => { throw new Error('gate is already open'); },
  });

  const noCommit = await cleanupArtifacts(state(), context([]));
  assert.equal(noCommit.complete, true);
  assert.equal(noCommit.ambiguousReconciliation.matches, 0);
  assert.equal(releaseCalls, 1);

  const duplicate = (id) => ({
    id,
    title: `Acceptance Submission ${runId}`,
    description: `Disposable venue submission for provider-backed acceptance run ${runId}.`,
    submitted_by: customerId,
    status: 'pending',
  });
  const ambiguous = await cleanupArtifacts(state(), context([
    duplicate('33333333-3333-4333-8333-333333333333'),
    duplicate('44444444-4444-4444-8444-444444444444'),
  ]));
  assert.equal(ambiguous.complete, false);
  assert.equal(ambiguous.failures.some((failure) => failure.failure.code === 'AMBIGUOUS_RECONCILIATION_NOT_UNIQUE'), true);
  assert.equal(releaseCalls, 1);
});

test('lost committed merchant menu response is GET-reconciled by exact run probe before deletion', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const runId = 'lost-menu-run';
  const venueId = '11111111-1111-4111-8111-111111111111';
  const menuId = '22222222-2222-4222-8222-222222222222';
  const merchantId = '33333333-3333-4333-8333-333333333333';
  const merchantIdentity = {
    username: `acceptance.merchant.${runId}`,
    email: `acceptance.merchant.${runId}@example.invalid`,
  };
  const phases = [];
  let deleted = false;
  const menuItem = {
    id: menuId,
    venue_id: venueId,
    title: `\" img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1`,
    description: `Stored-XSS menu probe ${runId}`,
  };
  const merchant = {
    async request({ phase }) {
      phases.push(phase);
      if (phase === 'cleanup.reconcile.merchant-dashboard') {
        return { status: 200, data: { menu: [menuItem], promotions: [] } };
      }
      if (phase === 'cleanup.merchant-session') {
        return { status: 200, data: { authenticated: true, user: { id: merchantId, ...merchantIdentity, role: 'merchant' } } };
      }
      if (phase === 'cleanup.menu') {
        deleted = true;
        return { status: 200, data: { ok: true } };
      }
      if (phase === 'cleanup.menu.verify') {
        return { status: 200, data: { menu: deleted ? [] : [menuItem] } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };
  const adminB = {
    async request({ phase }) {
      phases.push(phase);
      if (phase === 'cleanup.admin-session') return { status: 200, data: { authenticated: true } };
      if (phase === 'cleanup.merchant-suspend') return { status: 200, data: { ok: true } };
      if (phase === 'cleanup.merchant-suspend.verify') {
        return { status: 200, data: { merchants: [{ id: merchantId, status: 'suspended' }] } };
      }
      if (phase === 'cleanup.venue') return { status: 200, data: { ok: true, mediaCleanupPending: false } };
      if (phase === 'cleanup.venue.verify') return { status: 200, data: { venues: [] } };
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };

  const outcome = await cleanupArtifacts({
    ambiguousMutation: { phase: 'merchant.menu-create', code: 'AMBIGUOUS_MUTATION_RESPONSE_FAILURE' },
    menuItemIds: [],
    merchantId,
    promotionIds: [],
    venueIds: [venueId],
  }, {
    adminB,
    identity: { merchant: merchantIdentity },
    merchant,
    runId,
  });

  assert.equal(outcome.complete, true);
  assert.equal(outcome.ambiguousReconciliation.artifact, 'menu');
  assert.equal(outcome.ambiguousReconciliation.matches, 1);
  assert.equal(phases.indexOf('cleanup.reconcile.merchant-dashboard') < phases.indexOf('cleanup.menu'), true);
  assert.equal(outcome.attempted, 3);
});

test('cleanup fails when a successful delete is a provider no-op', async () => {
  const { cleanupArtifacts } = await moduleUnderTest();
  const customerId = '11111111-1111-4111-8111-111111111111';
  const customerIdentity = {
    username: 'acceptance.customer.test-run',
    email: 'acceptance.customer.test-run@example.invalid',
  };
  const customer = {
    async request({ phase }) {
      if (phase === 'cleanup.customer-session') {
        return { status: 200, data: { authenticated: true, user: { id: customerId, ...customerIdentity, role: 'customer' } } };
      }
      if (phase === 'cleanup.favorite') return { status: 200, data: { ok: true } };
      if (phase === 'cleanup.favorite.verify') {
        return { status: 200, data: { favorites: [{ venue_key: 'still-present' }] } };
      }
      throw new Error(`Unexpected phase: ${phase}`);
    },
  };
  const outcome = await cleanupArtifacts({
    customerId,
    favoriteVenueKey: 'still-present',
    menuItemIds: [],
    promotionIds: [],
    venueIds: [],
  }, {
    customer,
    identity: { customer: customerIdentity },
    runId: 'test-run',
  });
  assert.equal(outcome.complete, false);
  assert.equal(outcome.failures[0].failure.code, 'FAVORITE_CLEANUP_NOT_PERSISTED');
});

test('a wrong valid venue response id remains candidate-only and can never enter destructive cleanup', async () => {
  const { registerCreatedVenue } = await moduleUnderTest();
  const state = { venueIds: [] };
  const id = '11111111-1111-4111-8111-111111111111';
  assert.throws(
    () => registerCreatedVenue(state, { id, slug: 'wrong', status: 'published' }, { slug: 'expected' }, 'venue.create'),
    { code: 'VENUE_CREATE_CONTRACT_FAILED' }
  );
  assert.deepEqual(state.venueCandidateIds, [id]);
  assert.deepEqual(state.venueIds, []);
});

test('wrong valid mutation-response ids stay non-authoritative across every destructive artifact class', async () => {
  const {
    confirmAuthoritativeMerchant,
    confirmAuthoritativeMerchantContent,
    confirmAuthoritativeRegistration,
    confirmAuthoritativeReview,
    confirmAuthoritativeSubmission,
    confirmAuthoritativeVenue,
    registerCreatedVenue,
    retainMutationCandidate,
  } = await moduleUnderTest();
  const runId = 'wrong-valid-id-run';
  const wrongId = '11111111-1111-4111-8111-111111111111';
  const actualId = '22222222-2222-4222-8222-222222222222';
  const customerId = '33333333-3333-4333-8333-333333333333';
  const venueId = '44444444-4444-4444-8444-444444444444';

  const venueState = { venueIds: [] };
  const draft = { slug: `acceptance-${runId}-a`, title: `Acceptance Venue A ${runId}` };
  registerCreatedVenue(venueState, { id: wrongId, ...draft }, draft, 'venue.response');
  assert.throws(
    () => confirmAuthoritativeVenue(
      venueState,
      [{ id: actualId, ...draft }],
      wrongId,
      draft,
      'venue.authoritative',
    ),
    { code: 'VENUE_AUTHORITATIVE_IDENTITY_MISMATCH' },
  );
  assert.deepEqual(venueState.venueCandidateIds, [wrongId]);
  assert.deepEqual(venueState.venueIds, []);

  const customerIdentity = {
    username: `acceptance.customer.${runId}`,
    email: `acceptance.customer.${runId}@example.invalid`,
  };
  const registrationState = { customerId: '' };
  retainMutationCandidate(registrationState, 'customerCandidateId', wrongId, 'register.response', 'CUSTOMER_ID_INVALID');
  assert.throws(
    () => confirmAuthoritativeRegistration(registrationState, {
      data: { authenticated: true, user: { id: actualId, ...customerIdentity } },
    }, wrongId, customerIdentity, 'register.authoritative'),
    { code: 'CUSTOMER_AUTHORITATIVE_IDENTITY_MISMATCH' },
  );
  assert.equal(registrationState.customerCandidateId, wrongId);
  assert.equal(registrationState.customerId, '');

  const reviewState = { reviewId: '' };
  retainMutationCandidate(reviewState, 'reviewCandidateId', wrongId, 'review.response', 'REVIEW_ID_INVALID');
  assert.throws(
    () => confirmAuthoritativeReview(reviewState, [{
      id: actualId,
      body: `Disposable acceptance review for run ${runId}; it is long enough for validation.`,
      submitted_by: customerId,
      status: 'pending',
    }], wrongId, { runId, customerId, phase: 'review.authoritative' }),
    { code: 'REVIEW_AUTHORITATIVE_IDENTITY_MISMATCH' },
  );
  assert.equal(reviewState.reviewCandidateId, wrongId);
  assert.equal(reviewState.reviewId, '');

  const submissionState = { submissionId: '', mediaAttached: false };
  retainMutationCandidate(submissionState, 'submissionCandidateId', wrongId, 'submission.response', 'SUBMISSION_ID_INVALID');
  assert.throws(
    () => confirmAuthoritativeSubmission(submissionState, [{
      id: actualId,
      title: `Acceptance Submission ${runId}`,
      description: `Disposable venue submission for provider-backed acceptance run ${runId}.`,
      submitted_by: customerId,
      status: 'pending',
    }], wrongId, { runId, customerId, phase: 'submission.authoritative' }),
    { code: 'SUBMISSION_AUTHORITATIVE_IDENTITY_MISMATCH' },
  );
  assert.equal(submissionState.submissionCandidateId, wrongId);
  assert.equal(submissionState.submissionId, '');
  assert.equal(submissionState.mediaAttached, false);

  const merchantIdentity = {
    username: `acceptance.merchant.${runId}`,
    email: `acceptance.merchant.${runId}@example.invalid`,
  };
  const merchantState = { merchantId: '' };
  retainMutationCandidate(merchantState, 'merchantCandidateId', wrongId, 'merchant.response', 'MERCHANT_ID_INVALID');
  assert.throws(
    () => confirmAuthoritativeMerchant(merchantState, [{
      id: actualId,
      ...merchantIdentity,
      role: 'merchant',
    }], wrongId, merchantIdentity, 'merchant.authoritative'),
    { code: 'MERCHANT_AUTHORITATIVE_IDENTITY_MISMATCH' },
  );
  assert.equal(merchantState.merchantCandidateId, wrongId);
  assert.equal(merchantState.merchantId, '');

  const contentState = {
    menuItemIds: [],
    menuItemCandidateIds: [],
    promotionIds: [],
    promotionCandidateIds: [],
  };
  const persistedProbeTitle = `\" img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1`;
  for (const kind of ['menu', 'promotion']) {
    const candidateField = kind === 'menu' ? 'menuItemCandidateIds' : 'promotionCandidateIds';
    const authoritativeField = kind === 'menu' ? 'menuItemIds' : 'promotionIds';
    retainMutationCandidate(
      contentState,
      candidateField,
      wrongId,
      `${kind}.response`,
      kind === 'menu' ? 'MENU_ID_INVALID' : 'PROMOTION_ID_INVALID',
      { collection: true },
    );
    assert.throws(
      () => confirmAuthoritativeMerchantContent(contentState, [{
        id: actualId,
        title: persistedProbeTitle,
        description: `Stored-XSS ${kind} probe ${runId}`,
        venue_id: venueId,
      }], wrongId, { kind, runId, venueId, phase: `${kind}.authoritative` }),
      { code: kind === 'menu'
        ? 'MENU_AUTHORITATIVE_IDENTITY_MISMATCH'
        : 'PROMOTION_AUTHORITATIVE_IDENTITY_MISMATCH' },
    );
    assert.deepEqual(contentState[candidateField], [wrongId]);
    assert.deepEqual(contentState[authoritativeField], []);
  }
});

test('merchant content authority matches the server-canonical XSS probe title and rejects the raw request variant', async () => {
  const { confirmAuthoritativeMerchantContent } = await moduleUnderTest();
  const runId = 'canonical-xss-probe';
  const venueId = '11111111-1111-4111-8111-111111111111';
  const menuId = '22222222-2222-4222-8222-222222222222';
  const promotionId = '33333333-3333-4333-8333-333333333333';
  const canonicalTitle = `\" img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1`;
  const rawRequestTitle = `\"><img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1>`;
  const state = { menuItemIds: [], promotionIds: [] };

  for (const [kind, id, field, errorCode] of [
    ['menu', menuId, 'menuItemIds', 'MENU_AUTHORITATIVE_IDENTITY_MISMATCH'],
    ['promotion', promotionId, 'promotionIds', 'PROMOTION_AUTHORITATIVE_IDENTITY_MISMATCH'],
  ]) {
    const description = `Stored-XSS ${kind} probe ${runId}`;
    const authoritative = confirmAuthoritativeMerchantContent(state, [{
      id,
      title: canonicalTitle,
      description,
      venue_id: venueId,
    }], id, { kind, runId, venueId, phase: `${kind}.authoritative.canonical` });
    assert.equal(authoritative.title, canonicalTitle);
    assert.deepEqual(state[field], [id]);

    assert.throws(
      () => confirmAuthoritativeMerchantContent({ menuItemIds: [], promotionIds: [] }, [{
        id,
        title: rawRequestTitle,
        description,
        venue_id: venueId,
      }], id, { kind, runId, venueId, phase: `${kind}.authoritative.raw-request` }),
      { code: errorCode },
    );
  }
});

test('the real HTTP text sanitizer produces the exact persisted XSS probe title expected by acceptance', () => {
  const runId = 'canonical-xss-probe';
  const rawRequestTitle = `\"><img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1>`;
  const expectedPersistedTitle = `\" img data-mesto-acceptance=\"${runId}\" src=x onerror=globalThis.__mestoAcceptance=1`;

  assert.equal(canonicalizeHttpText(rawRequestTitle, 160), expectedPersistedTitle);
});

test('cache invalidation requires an explicit non-hit before accepting fresh entity data', async () => {
  const { observeEntityInvalidation } = await moduleUnderTest();
  const expectedItemId = '22222222-2222-4222-8222-222222222222';
  const misleading = [
    { explicitCache: 'MISS', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
  ];
  await assert.rejects(observeEntityInvalidation({
    async request() { return misleading.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 2,
    wait: 0,
  }), {
    code: 'CACHE_INVALIDATION_STATE_INCONCLUSIVE',
  });

  const staleThenFresh = [
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
  ];
  const revalidated = await observeEntityInvalidation({
    async request() { return staleThenFresh.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 4,
    wait: 0,
  });
  assert.deepEqual(revalidated, {
    requests: 4,
    state: 'STALE',
    freshState: 'HIT',
    observedFresh: true,
  });

  await assert.rejects(observeEntityInvalidation({
    async request() {
      return {
        explicitCache: 'STALE',
        etag: 'W/"new"',
        bodyDigest: 'new',
        cachePop: 'iad1',
        data: { menu: [{ id: expectedItemId }] },
      };
    },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 1,
    wait: 0,
  }), {
    code: 'CACHE_STALE_RESPONSE_ALREADY_FRESH',
  });

  const nonConsecutiveFresh = [
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
  ];
  await assert.rejects(observeEntityInvalidation({
    async request() { return nonConsecutiveFresh.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 3,
    wait: 0,
  }), {
    code: 'RELEVANT_CACHE_TAG_NOT_INVALIDATED',
  });

  const convergingCacheLayers = [
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
  ];
  assert.deepEqual(await observeEntityInvalidation({
    async request() { return convergingCacheLayers.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 6,
    wait: 0,
  }), {
    requests: 6,
    state: 'STALE',
    freshState: 'HIT',
    observedFresh: true,
  });

  const exactLiveFailureConverges = [
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"new"', bodyDigest: 'new', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
  ];
  assert.deepEqual(await observeEntityInvalidation({
    async request() { return exactLiveFailureConverges.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 5,
    wait: 0,
  }), {
    requests: 5,
    state: 'STALE',
    freshState: 'HIT',
    observedFresh: true,
  });

  const changedFreshConfirmation = [
    { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } },
    { explicitCache: 'HIT', etag: 'W/"new-1"', bodyDigest: 'new-1', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
    { explicitCache: 'HIT', etag: 'W/"new-2"', bodyDigest: 'new-2', cachePop: 'iad1', data: { menu: [{ id: expectedItemId }] } },
  ];
  await assert.rejects(observeEntityInvalidation({
    async request() { return changedFreshConfirmation.shift(); },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 3,
    wait: 0,
  }), {
    code: 'CACHE_FRESH_CONFIRMATION_CHANGED',
  });

  await assert.rejects(observeEntityInvalidation({
    async request() {
      return { explicitCache: 'PRERENDER', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } };
    },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: Date.now(),
    attempts: 1,
    wait: 0,
  }), {
    code: 'CACHE_INVALIDATION_STATE_INCONCLUSIVE',
  });

  let currentTime = 0;
  await assert.rejects(observeEntityInvalidation({
    async request() {
      currentTime = 45_001;
      return { explicitCache: 'STALE', etag: 'W/"old"', bodyDigest: 'old', cachePop: 'iad1', data: { menu: [] } };
    },
  }, {
    path: '/api/venue-content',
    expectedItemId,
    phase: 'cache.test',
    baselineEtag: 'W/"old"',
    baselineBodyDigest: 'old',
    baselineCachePop: 'iad1',
    baselineWarmedAt: 0,
    attempts: 1,
    wait: 0,
    now: () => currentTime,
  }), {
    code: 'CACHE_INVALIDATION_BASELINE_EXPIRED',
  });
});

test('cache warmup uses the public Vercel HIT contract and does not require stripped cache-tag headers', async () => {
  const { warmEntityCache } = await moduleUnderTest();
  const responses = [
    { cache: 'MISS', explicitCache: 'MISS', etag: 'W/"entity"', bodyDigest: 'entity', cachePop: 'iad1', data: { menu: [] } },
    { cache: 'HIT', explicitCache: 'HIT', etag: 'W/"entity"', bodyDigest: 'entity', cachePop: 'iad1', data: { menu: [] } },
  ];
  const observed = await warmEntityCache({
    async request() { return responses.shift(); },
  }, '/api/venue-content?venueId=11111111-1111-4111-8111-111111111111', 'cache.warm');

  assert.equal(observed.attempts, 2);
  assert.equal(observed.state, 'HIT');
  assert.equal(observed.etag, 'W/"entity"');
  assert.equal(observed.bodyDigest, 'entity');
  assert.equal(observed.cachePop, 'iad1');
  assert.equal(Number.isFinite(observed.warmedAt), true);

  await assert.rejects(warmEntityCache({
    async request() { return { cache: 'HIT', explicitCache: '', data: { menu: [] } }; },
  }, '/api/venue-content?venueId=11111111-1111-4111-8111-111111111111', 'cache.warm'), {
    code: 'CACHE_DID_NOT_WARM',
  });
});

test('unrelated cache isolation requires an explicit unchanged HIT in the same PoP', async () => {
  const { validateUnrelatedEntityCache } = await moduleUnderTest();
  const baseline = {
    etag: 'W/"venue-b"',
    bodyDigest: 'venue-b-body',
    cachePop: 'iad1',
    warmedAt: Date.now(),
  };
  assert.equal(validateUnrelatedEntityCache({
    explicitCache: 'HIT',
    etag: baseline.etag,
    bodyDigest: baseline.bodyDigest,
    cachePop: baseline.cachePop,
  }, baseline, 'cache.unrelated-b'), true);

  for (const response of [
    { cache: 'HIT', explicitCache: '', etag: baseline.etag, bodyDigest: baseline.bodyDigest, cachePop: baseline.cachePop },
    { explicitCache: 'STALE', etag: baseline.etag, bodyDigest: baseline.bodyDigest, cachePop: baseline.cachePop },
    { explicitCache: 'HIT', etag: 'W/"changed"', bodyDigest: baseline.bodyDigest, cachePop: baseline.cachePop },
    { explicitCache: 'HIT', etag: baseline.etag, bodyDigest: baseline.bodyDigest, cachePop: 'fra1' },
  ]) {
    assert.throws(() => validateUnrelatedEntityCache(response, baseline, 'cache.unrelated-b'), {
      name: 'AcceptanceError',
    });
  }
});
