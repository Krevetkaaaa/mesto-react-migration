const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { test } = require('node:test');

async function moduleUnderTest() {
  return import('../scripts/preview-browser-oracle.mjs');
}

const baseUrl = 'https://mesto-city-guide-ab12cd34e-team.vercel.app';
const targetUrl = `${baseUrl}/venue/acceptance-venue`;
const executablePath = resolve(__dirname, 'fixtures', 'chromium');
const probeToken = 'acceptance-venue';
const expectedSupabaseProjectRef = 'previewprojectref123';
const mediaId = '11111111-1111-4111-8111-111111111111';
const mediaVersionId = '22222222-2222-4222-8222-222222222222';
const publicMediaBase = `https://${expectedSupabaseProjectRef}.supabase.co/storage/v1/object/public/mesto-media-public/assets/${mediaId}/${mediaVersionId}`;
const publicCardUrl = `${publicMediaBase}/card.webp`;

function browserRequest({
  url = targetUrl,
  method = 'GET',
  resourceType = 'document',
  headers = { accept: 'text/html' },
} = {}) {
  return {
    allHeaders: async () => ({ ...headers }),
    method: () => method,
    resourceType: () => resourceType,
    url: () => url,
  };
}

function navigationRequest({ redirected = false } = {}) {
  return {
    frame: () => fakeFrame,
    isNavigationRequest: () => true,
    redirectedFrom: () => redirected ? {} : null,
    url: () => targetUrl,
  };
}

function navigationResponse(overrides = {}) {
  const request = overrides.request || navigationRequest();
  return {
    request: () => request,
    status: () => overrides.status ?? 200,
    url: () => overrides.url ?? targetUrl,
  };
}

const fakeFrame = {};

function createHarness({
  states,
  initialResponse = navigationResponse(),
  reloadResponses = [navigationResponse(), navigationResponse()],
  duringGoto,
  contextCloseError = null,
  browserCloseError = null,
} = {}) {
  const listeners = new Map();
  const observedStates = states || Array.from({ length: 3 }, () => ({
    dialogPresent: true,
    exactTitle: 'Acceptance Venue',
    menuHasProbe: true,
    promotionHasProbe: true,
    executionFlagSet: false,
    hasProbeImage: false,
    hasInlineOnerror: false,
  }));
  const calls = {
    addInitScript: 0,
    browserClose: 0,
    contextClose: 0,
    evaluate: 0,
    goto: 0,
    launchOptions: null,
    newContextOptions: null,
    reload: 0,
    routes: 0,
    routeContinueOptions: [],
  };

  const page = {
    evaluate: async () => observedStates[calls.evaluate++],
    goto: async () => {
      calls.goto += 1;
      duringGoto?.({ emit, page });
      return initialResponse;
    },
    mainFrame: () => fakeFrame,
    on: (event, listener) => {
      const current = listeners.get(event) || [];
      current.push(listener);
      listeners.set(event, current);
    },
    reload: async () => reloadResponses[calls.reload++],
    setDefaultNavigationTimeout: () => {},
    setDefaultTimeout: () => {},
    url: () => targetUrl,
    waitForLoadState: async () => {},
    waitForSelector: async () => {},
  };

  function emit(event, value) {
    for (const listener of listeners.get(event) || []) listener(value);
  }

  const context = {
    addInitScript: async () => { calls.addInitScript += 1; },
    close: async () => {
      calls.contextClose += 1;
      if (contextCloseError) throw contextCloseError;
    },
    newPage: async () => page,
    route: async (_pattern, handler) => {
      calls.routes += 1;
      calls.routeHandler = handler;
    },
  };
  const browser = {
    close: async () => {
      calls.browserClose += 1;
      if (browserCloseError) throw browserCloseError;
    },
    newContext: async (options) => {
      calls.newContextOptions = options;
      return context;
    },
  };
  const launchBrowser = async (options) => {
    calls.launchOptions = options;
    return browser;
  };
  return { calls, emit, launchBrowser, page };
}

function validOptions(overrides = {}) {
  return {
    baseUrl,
    venueSlug: 'acceptance-venue',
    expectedTitle: 'Acceptance Venue',
    probeToken,
    bypassSecret: 'private-preview-bypass',
    executablePath,
    ...overrides,
  };
}

test('browser oracle pins explicit Chromium, observes initial document and two real reloads, then closes', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness();
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  assert.deepEqual(await verify(validOptions()), {
    passed: true,
    observations: 3,
    reloads: 2,
  });
  assert.deepEqual(harness.calls.launchOptions, { executablePath, headless: true });
  assert.equal(harness.calls.goto, 1);
  assert.equal(harness.calls.reload, 2);
  assert.equal(harness.calls.evaluate, 3);
  assert.equal(harness.calls.addInitScript, 1);
  assert.equal(harness.calls.routes, 1);
  assert.equal(harness.calls.contextClose, 1);
  assert.equal(harness.calls.browserClose, 1);
  assert.equal(harness.calls.newContextOptions.extraHTTPHeaders, undefined);

  const routeCalls = { abort: 0, continue: 0 };
  await harness.calls.routeHandler({
    abort: async () => { routeCalls.abort += 1; },
    continue: async (options) => {
      routeCalls.continue += 1;
      harness.calls.routeContinueOptions.push(options);
    },
    request: () => browserRequest(),
  });
  assert.deepEqual(routeCalls, { abort: 0, continue: 1 });
  assert.equal(
    harness.calls.routeContinueOptions[0].headers['x-vercel-protection-bypass'],
    'private-preview-bypass',
  );
  assert.equal(harness.calls.routeContinueOptions[0].headers['x-vercel-skip-toolbar'], '1');
  assert.equal(harness.calls.routeContinueOptions[0].headers.accept, 'text/html');
});

test('browser oracle does not mistake the normal target navigation for a probe resource', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness({
    duringGoto: ({ emit }) => {
      emit('request', {
        url: () => targetUrl,
      });
    },
  });
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  assert.equal((await verify(validOptions())).passed, true);
});

test('browser oracle disables the Preview Toolbar even when no protection bypass is required', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness();
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  assert.equal((await verify(validOptions({ bypassSecret: '' }))).passed, true);
  let continuedHeaders = null;
  await harness.calls.routeHandler({
    abort: async () => assert.fail('same-origin request must not be aborted'),
    continue: async ({ headers }) => { continuedHeaders = headers; },
    request: () => browserRequest(),
  });
  assert.equal(continuedHeaders['x-vercel-skip-toolbar'], '1');
  assert.equal(
    Object.keys(continuedHeaders).some((name) => name.toLowerCase() === 'x-vercel-protection-bypass'),
    false,
  );
});

test('browser oracle permits only exact passive Google Fonts reads and keeps all other cross-origin traffic forbidden', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const stylesheetRequest = browserRequest({
    url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;700&display=swap',
    resourceType: 'stylesheet',
    headers: {
      accept: 'text/css',
      'X-Vercel-Protection-Bypass': 'must-not-leave-preview-origin',
      'X-Vercel-Skip-Toolbar': '1',
    },
  });
  const fontRequest = browserRequest({
    url: 'https://fonts.gstatic.com/s/manrope/v20/font-file.woff2',
    resourceType: 'font',
  });
  const allowed = createHarness({
    duringGoto: ({ emit }) => {
      emit('request', stylesheetRequest);
      emit('request', fontRequest);
    },
  });
  assert.equal((await createStoredXssBrowserVerifier({ launchBrowser: allowed.launchBrowser })(validOptions())).passed, true);

  for (const allowedRequest of [stylesheetRequest, fontRequest]) {
    const routeCalls = { abort: 0, continue: 0, options: null };
    await allowed.calls.routeHandler({
      abort: async () => { routeCalls.abort += 1; },
      continue: async (options) => {
        routeCalls.continue += 1;
        routeCalls.options = options;
      },
      request: () => allowedRequest,
    });
    assert.equal(routeCalls.abort, 0);
    assert.equal(routeCalls.continue, 1);
    const forwardedHeaderNames = Object.keys(routeCalls.options.headers).map((name) => name.toLowerCase());
    assert.equal(forwardedHeaderNames.includes('x-vercel-protection-bypass'), false);
    assert.equal(forwardedHeaderNames.includes('x-vercel-skip-toolbar'), false);
  }

  for (const forbiddenRequest of [
    browserRequest({ url: 'https://fonts.googleapis.com/css2?display=swap', resourceType: 'stylesheet' }),
    browserRequest({ url: 'https://fonts.googleapis.com/css2?family=Manrope', method: 'POST', resourceType: 'stylesheet' }),
    browserRequest({ url: 'https://fonts.googleapis.com/css2?family=Manrope', resourceType: 'script' }),
    browserRequest({ url: 'https://fonts.googleapis.com/css?family=Manrope', resourceType: 'stylesheet' }),
    browserRequest({ url: 'https://fonts.gstatic.com/s/manrope/v20/font-file.woff2?token=unexpected', resourceType: 'font' }),
    browserRequest({ url: 'https://fonts.gstatic.com/s/manrope/v20/font-file.js', resourceType: 'font' }),
    browserRequest({ url: 'https://example.com/font.woff2', resourceType: 'font' }),
    browserRequest({ url: 'https://vercel.live/_next-live/feedback/feedback.js', resourceType: 'script' }),
  ]) {
    const forbidden = createHarness({
      duringGoto: ({ emit }) => emit('request', forbiddenRequest),
    });
    const verify = createStoredXssBrowserVerifier({ launchBrowser: forbidden.launchBrowser });
    await assert.rejects(verify(validOptions()), (error) => error.code === 'CROSS_ORIGIN_REQUEST_FORBIDDEN');

    const routeCalls = { abort: 0, continue: 0 };
    await forbidden.calls.routeHandler({
      abort: async () => { routeCalls.abort += 1; },
      continue: async () => { routeCalls.continue += 1; },
      request: () => forbiddenRequest,
    });
    assert.deepEqual(routeCalls, { abort: 1, continue: 0 });
  }
});

test('browser oracle permits only exact preflight-bound public media images and strips Preview headers', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const mediaRequest = browserRequest({
    url: publicCardUrl,
    resourceType: 'image',
    headers: {
      accept: 'image/avif,image/webp',
      'X-Vercel-Protection-Bypass': 'must-not-leave-preview-origin',
      'X-Vercel-Skip-Toolbar': '1',
    },
  });
  const harness = createHarness({
    duringGoto: ({ emit }) => emit('request', mediaRequest),
  });
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });
  const options = validOptions({
    expectedSupabaseProjectRef,
    allowedPublicMediaUrls: [publicCardUrl],
  });

  assert.equal((await verify(options)).passed, true);
  const routeCalls = { abort: 0, continue: 0, options: null };
  await harness.calls.routeHandler({
    abort: async () => { routeCalls.abort += 1; },
    continue: async (continued) => {
      routeCalls.continue += 1;
      routeCalls.options = continued;
    },
    request: () => mediaRequest,
  });
  assert.equal(routeCalls.abort, 0);
  assert.equal(routeCalls.continue, 1);
  const forwardedHeaderNames = Object.keys(routeCalls.options.headers).map((name) => name.toLowerCase());
  assert.equal(forwardedHeaderNames.includes('x-vercel-protection-bypass'), false);
  assert.equal(forwardedHeaderNames.includes('x-vercel-skip-toolbar'), false);
});

test('browser oracle keeps public media fail-closed for non-exact URLs, methods, and resource types', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const options = validOptions({
    expectedSupabaseProjectRef,
    allowedPublicMediaUrls: [publicCardUrl],
  });
  for (const forbiddenRequest of [
    browserRequest({ url: `${publicMediaBase}/hero.webp`, resourceType: 'image' }),
    browserRequest({ url: publicCardUrl, method: 'POST', resourceType: 'image' }),
    browserRequest({ url: publicCardUrl, resourceType: 'script' }),
  ]) {
    const harness = createHarness({
      duringGoto: ({ emit }) => emit('request', forbiddenRequest),
    });
    const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });
    await assert.rejects(verify(options), (error) => error.code === 'CROSS_ORIGIN_REQUEST_FORBIDDEN');

    const routeCalls = { abort: 0, continue: 0 };
    await harness.calls.routeHandler({
      abort: async () => { routeCalls.abort += 1; },
      continue: async () => { routeCalls.continue += 1; },
      request: () => forbiddenRequest,
    });
    assert.deepEqual(routeCalls, { abort: 1, continue: 0 });
  }
});

test('browser oracle rejects unbound or malformed public media allowlist entries before launch', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const invalidUrls = [
    publicCardUrl.replace(`${expectedSupabaseProjectRef}.supabase.co`, 'foreignprojectref123.supabase.co'),
    publicCardUrl.replace('/mesto-media-public/', '/mesto-media-staging/'),
    publicCardUrl.replace('/card.webp', '/original.webp'),
    `${publicCardUrl}?download=1`,
    `${publicCardUrl}#fragment`,
  ];

  for (const candidate of invalidUrls) {
    const harness = createHarness();
    const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });
    await assert.rejects(
      verify(validOptions({
        expectedSupabaseProjectRef,
        allowedPublicMediaUrls: [candidate],
      })),
      (error) => [
        'ALLOWED_PUBLIC_MEDIA_PROVIDER_MISMATCH',
        'ALLOWED_PUBLIC_MEDIA_PATH_INVALID',
        'ALLOWED_PUBLIC_MEDIA_URL_INVALID',
      ].includes(error.code),
    );
    assert.equal(harness.calls.launchOptions, null);
  }
});

test('browser oracle never permits a probe token through the exact public media allowlist', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness();
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  await assert.rejects(
    verify(validOptions({
      probeToken: mediaId,
      expectedSupabaseProjectRef,
      allowedPublicMediaUrls: [publicCardUrl],
    })),
    (error) => error.code === 'PROBE_TOKEN_IN_ALLOWED_PUBLIC_MEDIA_URL',
  );
  assert.equal(harness.calls.launchOptions, null);
});

test('browser oracle closes context and browser after a stored-XSS execution oracle fails', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness({
    states: [{
      dialogPresent: true,
      exactTitle: 'Acceptance Venue',
      menuHasProbe: true,
      promotionHasProbe: true,
      executionFlagSet: true,
      hasProbeImage: false,
      hasInlineOnerror: false,
    }],
  });
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  await assert.rejects(verify(validOptions()), (error) => error.code === 'STORED_XSS_EXECUTED');
  assert.equal(harness.calls.reload, 0);
  assert.equal(harness.calls.contextClose, 1);
  assert.equal(harness.calls.browserClose, 1);
});

test('browser oracle forbids any redirect even when it lands on the requested URL', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness({
    initialResponse: navigationResponse({ request: navigationRequest({ redirected: true }) }),
  });
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  await assert.rejects(verify(validOptions()), (error) => error.code === 'REDIRECT_FORBIDDEN');
  assert.equal(harness.calls.contextClose, 1);
  assert.equal(harness.calls.browserClose, 1);
});

test('browser oracle rejects probe resource requests and unexpected browser errors', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const harness = createHarness({
    duringGoto: ({ emit }) => {
      emit('request', {
        url: () => `${baseUrl}/venue/x`,
      });
    },
  });
  const verify = createStoredXssBrowserVerifier({ launchBrowser: harness.launchBrowser });

  await assert.rejects(verify(validOptions()), (error) => error.code === 'PROBE_RESOURCE_REQUESTED');
  assert.equal(harness.calls.reload, 2);
  assert.equal(harness.calls.browserClose, 1);
});

test('documented anonymous session 401 console noise is the only console error exception', async () => {
  const { createStoredXssBrowserVerifier } = await moduleUnderTest();
  const allowed = createHarness({
    duringGoto: ({ emit }) => {
      emit('console', {
        type: () => 'error',
        text: () => 'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
        location: () => ({ url: `${baseUrl}/api/auth/session` }),
      });
    },
  });
  const allowedVerify = createStoredXssBrowserVerifier({ launchBrowser: allowed.launchBrowser });
  assert.equal((await allowedVerify(validOptions())).passed, true);

  const forbidden = createHarness({
    duringGoto: ({ emit }) => {
      emit('console', {
        type: () => 'error',
        text: () => 'Unexpected application failure',
        location: () => ({ url: targetUrl }),
      });
    },
  });
  const forbiddenVerify = createStoredXssBrowserVerifier({ launchBrowser: forbidden.launchBrowser });
  await assert.rejects(forbiddenVerify(validOptions()), (error) => error.code === 'UNEXPECTED_CONSOLE_ERROR');
});

test('browser oracle accepts only an origin-only immutable Preview URL and an explicit absolute executable', async () => {
  const { validateImmutablePreviewOrigin, createStoredXssBrowserVerifier } = await moduleUnderTest();
  assert.equal(validateImmutablePreviewOrigin(baseUrl), baseUrl);
  assert.throws(
    () => validateImmutablePreviewOrigin('https://mesto-city-guide.vercel.app'),
    (error) => error.code === 'PRODUCTION_ORIGIN_FORBIDDEN',
  );
  assert.throws(
    () => validateImmutablePreviewOrigin('https://mesto-city-guide-friendly-alias-team.vercel.app'),
    (error) => error.code === 'IMMUTABLE_PREVIEW_HOST_REQUIRED',
  );
  assert.throws(
    () => validateImmutablePreviewOrigin(`${baseUrl}/venue/example`),
    (error) => error.code === 'PREVIEW_ORIGIN_ONLY',
  );

  const verify = createStoredXssBrowserVerifier({ launchBrowser: createHarness().launchBrowser });
  await assert.rejects(
    verify(validOptions({ executablePath: 'chrome.exe' })),
    (error) => error.code === 'EXPLICIT_EXECUTABLE_PATH_REQUIRED',
  );
});
