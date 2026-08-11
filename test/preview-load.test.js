const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');

async function moduleUnderTest() {
  return import('../scripts/preview-load.mjs');
}

async function gateUnderTest() {
  return import('../scripts/run-preview-load-gate.mjs');
}

const preview = 'https://mesto-city-guide-example-team.vercel.app';
const deploymentId = 'dpl_1234567890abcdef';
const projectId = 'prj_1234567890abcdef';
const teamId = 'team_example';
const commitSha = '0123456789abcdef0123456789abcdef01234567';
const previewRedisProvidersFingerprint = 'r'.repeat(43);
const productionRedisProvidersFingerprint = 'p'.repeat(43);
const providerExpectation = {
  expectedSupabaseProjectRef: 'previewproject',
  forbiddenProductionSupabaseProjectRef: 'productionproject',
  expectedRedisNamespace: 'preview',
  expectedRedisProvidersFingerprint: previewRedisProvidersFingerprint,
  forbiddenProductionRedisProvidersFingerprint: productionRedisProvidersFingerprint,
};

function deploymentPayload(overrides = {}) {
  return {
    id: deploymentId,
    projectId,
    target: null,
    readyState: 'READY',
    url: new URL(preview).hostname,
    meta: { githubCommitSha: commitSha },
    ...overrides
  };
}

function fingerprintPayload(overrides = {}) {
  const payload = {
    kind: 'mesto.release-provider-identity',
    environment: 'preview',
    deploymentId,
    projectId,
    deploymentHost: new URL(preview).hostname,
    redisNamespace: 'preview',
    redisProvidersFingerprint: previewRedisProvidersFingerprint,
    supabaseProjectRef: 'previewproject',
    ...overrides
  };
  return {
    ...payload,
    fingerprint: overrides.fingerprint || createHash('sha256')
      .update(JSON.stringify([
        payload.environment,
        payload.deploymentId,
        payload.projectId,
        payload.deploymentHost,
        payload.redisNamespace,
        payload.redisProvidersFingerprint,
        payload.supabaseProjectRef
      ]))
      .digest('base64url')
  };
}

function htmlResponse(body, headers = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-vercel-cache': 'HIT', ...headers }
  });
}

test('Preview load target is exact-allowlisted; production and nonstandard ports are forbidden', async () => {
  const { validatePreviewLoadTarget } = await moduleUnderTest();
  assert.equal(validatePreviewLoadTarget(preview, preview), preview);
  assert.throws(
    () => validatePreviewLoadTarget('https://mesto-city-guide.vercel.app', 'https://mesto-city-guide.vercel.app'),
    /Production load is forbidden/
  );
  assert.throws(() => validatePreviewLoadTarget(preview, 'https://different-preview.vercel.app'), /exactly match/);
  assert.throws(() => validatePreviewLoadTarget('http://127.0.0.1:4173', 'http://127.0.0.1:4173'), /HTTPS/);
  assert.throws(
    () => validatePreviewLoadTarget(`${preview}:8443`, `${preview}:8443`),
    /nonstandard port/
  );
});

test('Preview load CLI requires acknowledgement, exact deployment/commit, and a known stage', async () => {
  const { parsePreviewLoadArguments } = await moduleUnderTest();
  const environment = { MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN: preview };
  assert.deepEqual(
    parsePreviewLoadArguments([
      '--base-url', preview,
      '--deployment-id', deploymentId,
      '--expected-commit-sha', commitSha,
      '--stage', 'burst',
      '--acknowledge-preview-load'
    ], environment),
    { baseUrl: preview, deploymentId, expectedCommitSha: commitSha, stageName: 'burst' }
  );
  assert.throws(
    () => parsePreviewLoadArguments(['--base-url', preview, '--deployment-id', deploymentId, '--stage', 'burst'], environment),
    /acknowledge/
  );
  assert.throws(
    () => parsePreviewLoadArguments([
      '--base-url', preview,
      '--deployment-id', deploymentId,
      '--expected-commit-sha', commitSha,
      '--stage', 'unknown',
      '--acknowledge-preview-load'
    ], environment),
    /expected, burst, or soak/
  );
  assert.throws(
    () => parsePreviewLoadArguments([
      '--base-url', preview,
      '--deployment-id', deploymentId,
      '--stage', 'burst',
      '--acknowledge-preview-load'
    ], environment),
    /exactly 40 hexadecimal/
  );
  assert.equal(parsePreviewLoadArguments([
    '--base-url', preview,
    '--deployment-id', deploymentId,
    '--stage', 'burst',
    '--acknowledge-preview-load'
  ], { ...environment, MESTO_EXPECTED_PREVIEW_COMMIT_SHA: commitSha }).expectedCommitSha, commitSha);
});

test('Full Preview load gate uses the same explicit CLI/env expected commit contract', async () => {
  const { parsePreviewLoadGateArguments } = await gateUnderTest();
  const environment = { MESTO_LOAD_ALLOWED_PREVIEW_ORIGIN: preview };
  assert.deepEqual(parsePreviewLoadGateArguments([
    '--base-url', preview,
    '--deployment-id', deploymentId,
    '--expected-commit-sha', commitSha.toUpperCase(),
    '--acknowledge-preview-load'
  ], environment), { baseUrl: preview, deploymentId, expectedCommitSha: commitSha });
  assert.equal(parsePreviewLoadGateArguments([
    '--base-url', preview,
    '--deployment-id', deploymentId,
    '--acknowledge-preview-load'
  ], { ...environment, MESTO_EXPECTED_PREVIEW_COMMIT_SHA: commitSha }).expectedCommitSha, commitSha);
  assert.throws(() => parsePreviewLoadGateArguments([
    '--base-url', preview,
    '--deployment-id', deploymentId,
    '--acknowledge-preview-load'
  ], environment), /exactly 40 hexadecimal/);
});

test('Preview load proves exact deployment, project, commit, READY state, and Preview target', async () => {
  const { verifyPreviewDeployment } = await moduleUnderTest();
  const valid = async () => Response.json(deploymentPayload());
  assert.deepEqual(
    await verifyPreviewDeployment({
      baseUrl: preview,
      deploymentId,
      projectId,
      expectedCommitSha: commitSha,
      teamId,
      token: 'token',
      fetchImpl: valid
    }),
    { deploymentId, projectId, commitSha, expectedCommitSha: commitSha, actualCommitSha: commitSha, readyState: 'READY', target: 'preview' }
  );
  await assert.rejects(
    verifyPreviewDeployment({
      baseUrl: preview,
      deploymentId,
      projectId,
      expectedCommitSha: commitSha,
      teamId,
      token: 'token',
      fetchImpl: async () => Response.json(deploymentPayload({ projectId: 'prj_different' }))
    }),
    /different project/
  );
  await assert.rejects(
    verifyPreviewDeployment({
      baseUrl: preview,
      deploymentId,
      projectId,
      expectedCommitSha: commitSha,
      teamId,
      token: 'token',
      fetchImpl: async () => Response.json(deploymentPayload({ target: 'production' }))
    }),
    /Only an immutable Preview deployment/
  );
  await assert.rejects(
    verifyPreviewDeployment({
      baseUrl: preview,
      deploymentId,
      projectId,
      expectedCommitSha: commitSha,
      teamId,
      token: 'token',
      fetchImpl: async () => Response.json(deploymentPayload({ meta: {} }))
    }),
    /commit proof/
  );
});

test('Runtime fingerprint must identify the expected isolated Preview providers', async () => {
  const { verifyPreviewReleaseFingerprint } = await moduleUnderTest();
  const valid = await verifyPreviewReleaseFingerprint({
    baseUrl: preview,
    expectedDeploymentId: deploymentId,
    expectedProjectId: projectId,
    ...providerExpectation,
    fetchImpl: async () => Response.json(fingerprintPayload())
  });
  assert.deepEqual(
    { environment: valid.environment, redisNamespace: valid.redisNamespace, supabaseProjectRef: valid.supabaseProjectRef },
    { environment: 'preview', redisNamespace: 'preview', supabaseProjectRef: 'previewproject' }
  );
  await assert.rejects(
    verifyPreviewReleaseFingerprint({
      baseUrl: preview,
      expectedDeploymentId: deploymentId,
      expectedProjectId: projectId,
      ...providerExpectation,
      fetchImpl: async () => Response.json(fingerprintPayload({ environment: 'production', redisNamespace: 'production' }))
    }),
    /Production runtime fingerprint is forbidden/
  );
  await assert.rejects(
    verifyPreviewReleaseFingerprint({
      baseUrl: preview,
      expectedDeploymentId: deploymentId,
      expectedProjectId: projectId,
      ...providerExpectation,
      fetchImpl: async () => Response.json(fingerprintPayload({
        redisProvidersFingerprint: productionRedisProvidersFingerprint,
      })),
    }),
    /Production Redis providers are forbidden/,
  );
});

test('Preview provider expectations are explicit and deny known Production providers', async () => {
  const { previewProviderExpectation } = await moduleUnderTest();
  assert.deepEqual(previewProviderExpectation({
    MESTO_EXPECTED_PREVIEW_SUPABASE_PROJECT_REF: 'previewproject',
    MESTO_FORBIDDEN_PRODUCTION_SUPABASE_PROJECT_REF: 'productionproject',
    MESTO_EXPECTED_PREVIEW_REDIS_PROVIDERS_FINGERPRINT: previewRedisProvidersFingerprint,
    MESTO_FORBIDDEN_PRODUCTION_REDIS_PROVIDERS_FINGERPRINT: productionRedisProvidersFingerprint,
  }), {
    supabaseProjectRef: 'previewproject',
    forbiddenProductionSupabaseProjectRef: 'productionproject',
    redisNamespace: 'preview',
    redisProvidersFingerprint: previewRedisProvidersFingerprint,
    forbiddenProductionRedisProvidersFingerprint: productionRedisProvidersFingerprint,
  });
  assert.throws(
    () => previewProviderExpectation({ MESTO_SUPABASE_PROJECT_REF: 'previewproject' }),
    /MESTO_EXPECTED_PREVIEW_SUPABASE_PROJECT_REF/,
  );
});

test('Exported load run revalidates and makes zero document requests on fingerprint mismatch', async () => {
  const { runPreviewLoad } = await moduleUnderTest();
  let fingerprintRequests = 0;
  let documentRequests = 0;
  const appFetch = async (url) => {
    if (new URL(url).pathname === '/api/release-fingerprint') fingerprintRequests += 1;
    else documentRequests += 1;
    return Response.json(fingerprintPayload({ supabaseProjectRef: 'wrongproject' }));
  };
  await assert.rejects(
    runPreviewLoad({
      baseUrl: preview,
      allowedOrigin: preview,
      deploymentId,
      expectedCommitSha: commitSha,
      projectId,
      stageName: 'burst',
      ...providerExpectation,
      teamId,
      vercelToken: 'token',
      deploymentFetch: async () => Response.json(deploymentPayload()),
      appFetch
    }),
    /Supabase project ref does not match Preview/
  );
  assert.equal(fingerprintRequests, 1);
  assert.equal(documentRequests, 0);
});

test('Exported load run rejects a non-allowlisted target before deployment or app requests', async () => {
  const { runPreviewLoad } = await moduleUnderTest();
  let deploymentRequests = 0;
  let appRequests = 0;
  await assert.rejects(runPreviewLoad({
    baseUrl: preview,
    allowedOrigin: 'https://different-preview.vercel.app',
    deploymentId,
    expectedCommitSha: commitSha,
    projectId,
    stageName: 'burst',
    ...providerExpectation,
    teamId,
    vercelToken: 'token',
    deploymentFetch: async () => { deploymentRequests += 1; return Response.json(deploymentPayload()); },
    appFetch: async () => { appRequests += 1; return Response.json(fingerprintPayload()); }
  }), /exactly match/);
  assert.equal(deploymentRequests, 0);
  assert.equal(appRequests, 0);
});

test('Exported load run rejects missing/mismatched expected commit before any app request', async () => {
  const { runPreviewLoad } = await moduleUnderTest();
  let deploymentRequests = 0;
  let appRequests = 0;
  const baseOptions = {
    baseUrl: preview,
    allowedOrigin: preview,
    deploymentId,
    projectId,
    stageName: 'burst',
    ...providerExpectation,
    teamId,
    vercelToken: 'token',
    deploymentFetch: async () => {
      deploymentRequests += 1;
      return Response.json(deploymentPayload());
    },
    appFetch: async () => {
      appRequests += 1;
      return Response.json(fingerprintPayload());
    }
  };

  await assert.rejects(runPreviewLoad(baseOptions), /exactly 40 hexadecimal/);
  assert.equal(deploymentRequests, 0);
  assert.equal(appRequests, 0);

  await assert.rejects(
    runPreviewLoad({ ...baseOptions, expectedCommitSha: 'f'.repeat(40) }),
    /does not match expected Preview commit SHA/
  );
  assert.equal(deploymentRequests, 1);
  assert.equal(appRequests, 0);
});

test('Explicit X-Vercel-Cache state wins over Age fallback', async () => {
  const { edgeDocumentCacheHit } = await moduleUnderTest();
  assert.equal(edgeDocumentCacheHit(new Headers({ 'x-vercel-cache': 'MISS', age: '120' })), false);
  assert.equal(edgeDocumentCacheHit(new Headers({ 'x-vercel-cache': '', age: '120' })), false);
  assert.equal(edgeDocumentCacheHit(new Headers({ 'x-vercel-cache': 'HIT', age: '0' })), true);
  assert.equal(edgeDocumentCacheHit(new Headers({ age: '120' })), true);
});

test('Edge document validation rejects protection and generic SPA fallback HTML', async () => {
  const { validateEdgeDocumentResponse } = await moduleUnderTest();
  const url = new URL('/catalog', preview);
  assert.equal(validateEdgeDocumentResponse({
    url,
    response: htmlResponse('<!doctype html><main data-react-route="catalog"><section id="catalog-view"></section></main>'),
    body: '<!doctype html><main data-react-route="catalog"><section id="catalog-view"></section></main>'
  }), true);
  assert.throws(() => validateEdgeDocumentResponse({
    url,
    response: htmlResponse('<!doctype html><main>Sign in to Vercel</main>'),
    body: '<!doctype html><main>Sign in to Vercel</main>'
  }), /route marker/);
  assert.throws(() => validateEdgeDocumentResponse({
    url,
    response: new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    body: '{}'
  }), /not HTML/);
});

test('Preview load summary names cache evidence as edge document cache evidence', async () => {
  const { summarizePreviewLoad } = await moduleUnderTest();
  const summary = summarizePreviewLoad([
    { bytes: 100, edgeDocumentCacheHit: true, latencyMs: 10, status: 200 },
    { bytes: 50, edgeDocumentCacheHit: false, latencyMs: 20, status: 503 },
    { bytes: 0, edgeDocumentCacheHit: false, latencyMs: 10000, status: 0, transportError: true }
  ], 1_000);
  assert.equal(summary.profile, 'edge-document-cache');
  assert.deepEqual(summary.statuses, { 200: 1, 503: 1 });
  assert.equal(summary.transportErrors, 1);
  assert.equal(summary.edgeDocumentCacheHits, 1);
  assert.equal(summary.responseBytes, 150);
  assert.equal(summary.throughputRps, 3);
  assert.equal(Object.hasOwn(summary, 'cacheHits'), false);
});

test('Preview load SLO rejects poor edge cache ratio and tail latency without relaxing limits', async () => {
  const { evaluatePreviewLoad, PREVIEW_LOAD_STAGES } = await moduleUnderTest();
  const outcome = evaluatePreviewLoad({
    statuses: { 200: 99, 503: 1 },
    transportErrors: 0,
    requests: 500,
    throughputRps: 100,
    latencyMs: { p95: 1_001, p99: 2_501 },
    edgeDocumentCacheHitRatio: 0.89
  }, PREVIEW_LOAD_STAGES.expected);
  assert.equal(outcome.passed, false);
  assert.equal(outcome.failures.length, 4);
});

test('Preview load SLO cannot pass with a partial sample', async () => {
  const { evaluatePreviewLoad, PREVIEW_LOAD_STAGES } = await moduleUnderTest();
  const outcome = evaluatePreviewLoad({
    statuses: { 200: 1 },
    requests: 1,
    transportErrors: 0,
    throughputRps: 100,
    latencyMs: { p95: 10, p99: 10 },
    edgeDocumentCacheHitRatio: 1
  }, PREVIEW_LOAD_STAGES.burst);
  assert.equal(outcome.passed, false);
  assert.match(outcome.failures[0], /expected 300/);
});

test('Preview load byte cap cancels a chunked body before buffering the remainder', async () => {
  const { boundedBody } = await moduleUnderTest();
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(3));
    },
    cancel() {
      cancelled = true;
    }
  });
  await assert.rejects(boundedBody(new Response(body), 5), /byte cap/);
  assert.equal(cancelled, true);
});

test('Full gate runs expected then burst then soak and emits immutable evidence', async () => {
  const { runPreviewLoadGate } = await gateUnderTest();
  const calls = [];
  const evidenceManifest = {
    deploymentId,
    projectId,
    commitSha,
    expectedCommitSha: commitSha,
    actualCommitSha: commitSha,
    providerIdentity: { fingerprint: 'a'.repeat(43) }
  };
  const result = await runPreviewLoadGate({
    baseUrl: preview,
    allowedOrigin: preview,
    expectedCommitSha: commitSha
  }, {
    runStage: async ({ stageName }) => {
      calls.push(stageName);
      return { stage: stageName, evidenceManifest, slo: { passed: true, failures: [] } };
    },
    now: () => new Date('2026-08-11T10:00:00.000Z')
  });
  assert.deepEqual(calls, ['expected', 'burst', 'soak']);
  assert.equal(result.passed, true);
  assert.equal(result.evidenceManifest.deploymentId, deploymentId);
  assert.equal(result.evidenceManifest.projectId, projectId);
  assert.equal(result.evidenceManifest.commitSha, commitSha);
  assert.equal(result.evidenceManifest.expectedCommitSha, commitSha);
  assert.equal(result.evidenceManifest.actualCommitSha, commitSha);
  assert.equal(result.evidenceManifest.startedAt, '2026-08-11T10:00:00.000Z');
  assert.deepEqual(result.notRun, []);
});

test('Full gate does not start soak unless expected and burst both pass', async () => {
  const { runPreviewLoadGate } = await gateUnderTest();
  const calls = [];
  const evidenceManifest = {
    deploymentId,
    projectId,
    commitSha,
    expectedCommitSha: commitSha,
    actualCommitSha: commitSha,
    providerIdentity: { fingerprint: 'a'.repeat(43) }
  };
  const result = await runPreviewLoadGate({
    baseUrl: preview,
    allowedOrigin: preview,
    expectedCommitSha: commitSha
  }, {
    runStage: async ({ stageName }) => {
      calls.push(stageName);
      return {
        stage: stageName,
        evidenceManifest,
        slo: { passed: stageName !== 'burst', failures: stageName === 'burst' ? ['failed'] : [] }
      };
    }
  });
  assert.deepEqual(calls, ['expected', 'burst']);
  assert.equal(result.passed, false);
  assert.deepEqual(result.notRun, ['soak']);
});

test('Full gate rejects missing or mismatched commit evidence before advancing stages', async () => {
  const { runPreviewLoadGate } = await gateUnderTest();
  let calls = 0;
  const runStage = async ({ stageName }) => {
    calls += 1;
    return {
      stage: stageName,
      evidenceManifest: {
        deploymentId,
        projectId,
        commitSha,
        expectedCommitSha: commitSha,
        actualCommitSha: 'f'.repeat(40),
        providerIdentity: { fingerprint: 'a'.repeat(43) }
      },
      slo: { passed: true, failures: [] }
    };
  };
  await assert.rejects(
    runPreviewLoadGate({ baseUrl: preview, allowedOrigin: preview }, { runStage }),
    /exactly 40 hexadecimal/
  );
  assert.equal(calls, 0);
  await assert.rejects(
    runPreviewLoadGate({ baseUrl: preview, allowedOrigin: preview, expectedCommitSha: commitSha }, { runStage }),
    /actual commit evidence does not match/
  );
  assert.equal(calls, 1);
});
