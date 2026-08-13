import { isAbsolute } from 'node:path';

import { chromium } from '@playwright/test';

const NAVIGATION_TIMEOUT_MS = 15_000;
const UNIQUE_PREVIEW_HOST_PATTERN = /^[a-z0-9-]+-[a-z0-9]{9}-[a-z0-9-]+\.vercel\.app$/;
const SAFE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const SAFE_PROBE_PATTERN = /^[a-zA-Z0-9_-]{8,160}$/;
const PRODUCTION_ORIGIN = 'https://mesto-city-guide.vercel.app';

export class PreviewBrowserOracleError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PreviewBrowserOracleError';
    this.code = code;
  }
}

function invariant(condition, code) {
  if (!condition) throw new PreviewBrowserOracleError(code);
}

function safeOracleError(error, fallbackCode) {
  return error instanceof PreviewBrowserOracleError
    ? error
    : new PreviewBrowserOracleError(fallbackCode);
}

export function validateImmutablePreviewOrigin(value) {
  let candidate;
  try {
    candidate = new URL(String(value || ''));
  } catch {
    throw new PreviewBrowserOracleError('INVALID_PREVIEW_ORIGIN');
  }

  invariant(candidate.protocol === 'https:', 'PREVIEW_HTTPS_REQUIRED');
  invariant(!candidate.username && !candidate.password, 'PREVIEW_CREDENTIALS_FORBIDDEN');
  invariant(!candidate.port, 'PREVIEW_NONSTANDARD_PORT_FORBIDDEN');
  invariant(candidate.pathname === '/' && !candidate.search && !candidate.hash, 'PREVIEW_ORIGIN_ONLY');
  invariant(candidate.origin !== PRODUCTION_ORIGIN, 'PRODUCTION_ORIGIN_FORBIDDEN');
  invariant(UNIQUE_PREVIEW_HOST_PATTERN.test(candidate.hostname), 'IMMUTABLE_PREVIEW_HOST_REQUIRED');
  return candidate.origin;
}

function validateInputs({ baseUrl, venueSlug, expectedTitle, probeToken, executablePath }) {
  const origin = validateImmutablePreviewOrigin(baseUrl);
  const slug = String(venueSlug || '').trim();
  const title = String(expectedTitle || '');
  const probe = String(probeToken || '');
  const browserExecutable = String(executablePath || '').trim();

  invariant(SAFE_SLUG_PATTERN.test(slug), 'INVALID_VENUE_SLUG');
  invariant(title.length > 0 && title.length <= 240, 'INVALID_EXPECTED_TITLE');
  invariant(SAFE_PROBE_PATTERN.test(probe), 'INVALID_PROBE_TOKEN');
  invariant(browserExecutable.length > 0 && isAbsolute(browserExecutable), 'EXPLICIT_EXECUTABLE_PATH_REQUIRED');

  return {
    origin,
    targetUrl: new URL(`/venue/${encodeURIComponent(slug)}`, origin).href,
    expectedTitle: title,
    probeToken: probe,
    executablePath: browserExecutable,
  };
}

function requestUrl(request) {
  try {
    return new URL(request.url());
  } catch {
    return null;
  }
}

function isAllowedPassiveCrossOriginRequest(request) {
  const url = requestUrl(request);
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;

  let method;
  let resourceType;
  try {
    method = request.method();
    resourceType = request.resourceType();
  } catch {
    return false;
  }
  if (method !== 'GET') return false;

  if (url.origin === 'https://fonts.googleapis.com') {
    return resourceType === 'stylesheet'
      && url.pathname === '/css2'
      && url.searchParams.has('family')
      && Array.from(url.searchParams.keys()).every((key) => key === 'family' || key === 'display');
  }
  if (url.origin === 'https://fonts.gstatic.com') {
    return resourceType === 'font'
      && !url.search
      && /^\/s\/[A-Za-z0-9._/-]+\.woff2$/.test(url.pathname);
  }
  return false;
}

function isAnonymousSessionUrl(value, origin) {
  try {
    const candidate = new URL(value);
    return candidate.origin === origin && candidate.pathname === '/api/auth/session';
  } catch {
    return false;
  }
}

function isAllowedAnonymousSessionConsoleError(message, origin) {
  const text = String(message.text?.() || '');
  const location = message.location?.();
  return isAnonymousSessionUrl(location?.url || '', origin)
    && /(?:401|unauthori[sz]ed)/i.test(text);
}

function isProbeResourceRequest(request, targetUrl, probeToken) {
  const url = requestUrl(request);
  if (!url) return false;
  const rawUrl = url.href;
  if (rawUrl === targetUrl) return false;
  const relativeProbeUrl = new URL('x', targetUrl).href;
  return rawUrl === relativeProbeUrl
    || rawUrl.includes(probeToken)
    || rawUrl.includes(encodeURIComponent(probeToken));
}

function isMainFrameNavigation(request, page) {
  try {
    return request.isNavigationRequest() && request.frame() === page.mainFrame();
  } catch {
    return false;
  }
}

function assertNavigationResponse(response, page, targetUrl) {
  invariant(response, 'NAVIGATION_RESPONSE_MISSING');
  invariant(response.status() >= 200 && response.status() < 300, 'NAVIGATION_HTTP_STATUS');
  invariant(response.url() === targetUrl, 'NAVIGATION_RESPONSE_URL_MISMATCH');
  const request = response.request();
  invariant(isMainFrameNavigation(request, page), 'MAIN_FRAME_NAVIGATION_REQUIRED');
  invariant(!request.redirectedFrom(), 'REDIRECT_FORBIDDEN');
  invariant(page.url() === targetUrl, 'FINAL_URL_MISMATCH');
}

async function readOracleState(page, expectedTitle, probeToken) {
  return page.evaluate(({ title, probe }) => {
    const exactTitle = document.querySelector('#venue-dialog-title')?.textContent ?? null;
    const menuText = document.querySelector('.dialog-menu-list')?.textContent ?? '';
    const promotionText = document.querySelector('.dialog-promotions')?.textContent ?? '';
    return {
      exactTitle,
      menuHasProbe: menuText.includes(probe),
      promotionHasProbe: promotionText.includes(probe),
      executionFlagSet: typeof globalThis.__mestoAcceptance !== 'undefined'
        || typeof globalThis.__storedXssExecuted !== 'undefined',
      hasProbeImage: document.querySelector('img[data-mesto-acceptance]') !== null,
      hasInlineOnerror: document.querySelector('[onerror]') !== null,
      dialogPresent: document.querySelector('#venue-dialog') !== null,
      expectedTitle: title,
    };
  }, { title: expectedTitle, probe: probeToken });
}

function assertOracleState(state, expectedTitle) {
  invariant(state && state.dialogPresent, 'VENUE_DIALOG_MISSING');
  invariant(state.exactTitle === expectedTitle, 'VENUE_TITLE_MISMATCH');
  invariant(state.menuHasProbe === true, 'MENU_PROBE_NOT_PERSISTED');
  invariant(state.promotionHasProbe === true, 'PROMOTION_PROBE_NOT_PERSISTED');
  invariant(state.executionFlagSet === false, 'STORED_XSS_EXECUTED');
  invariant(state.hasProbeImage === false, 'STORED_XSS_IMAGE_PRESENT');
  invariant(state.hasInlineOnerror === false, 'INLINE_ONERROR_PRESENT');
}

async function settleAndAssert(page, expectedTitle, probeToken) {
  await page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS });
  await page.waitForSelector('#venue-dialog-title', {
    state: 'visible',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForLoadState('networkidle', { timeout: NAVIGATION_TIMEOUT_MS });
  assertOracleState(await readOracleState(page, expectedTitle, probeToken), expectedTitle);
}

function attachEventOracles(page, origin, targetUrl, probeToken) {
  const failures = {
    consoleErrors: 0,
    crossOriginRequests: 0,
    pageErrors: 0,
    probeResourceRequests: 0,
    redirects: 0,
    requestFailures: 0,
  };

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (isAllowedAnonymousSessionConsoleError(message, origin)) return;
    failures.consoleErrors += 1;
  });
  page.on('pageerror', () => {
    failures.pageErrors += 1;
  });
  page.on('request', (request) => {
    const url = requestUrl(request);
    if (url
      && /^https?:$/.test(url.protocol)
      && url.origin !== origin
      && !isAllowedPassiveCrossOriginRequest(request)) failures.crossOriginRequests += 1;
    if (isProbeResourceRequest(request, targetUrl, probeToken)) failures.probeResourceRequests += 1;
  });
  page.on('requestfailed', () => {
    failures.requestFailures += 1;
  });
  page.on('response', (response) => {
    const request = response.request();
    if (isMainFrameNavigation(request, page) && response.status() >= 300 && response.status() < 400) {
      failures.redirects += 1;
    }
  });

  return failures;
}

function assertEventOracles(failures) {
  invariant(failures.redirects === 0, 'REDIRECT_FORBIDDEN');
  invariant(failures.crossOriginRequests === 0, 'CROSS_ORIGIN_REQUEST_FORBIDDEN');
  invariant(failures.probeResourceRequests === 0, 'PROBE_RESOURCE_REQUESTED');
  invariant(failures.pageErrors === 0, 'UNEXPECTED_PAGE_ERROR');
  invariant(failures.consoleErrors === 0, 'UNEXPECTED_CONSOLE_ERROR');
  invariant(failures.requestFailures === 0, 'UNEXPECTED_REQUEST_FAILURE');
}

export function createStoredXssBrowserVerifier({ launchBrowser } = {}) {
  invariant(typeof launchBrowser === 'function', 'BROWSER_LAUNCHER_REQUIRED');

  return async function runStoredXssBrowserOracle(options) {
    const {
      origin,
      targetUrl,
      expectedTitle,
      probeToken,
      executablePath,
    } = validateInputs(options || {});
    const bypassSecret = String(options?.bypassSecret || '');

    let browser = null;
    let context = null;
    let result = null;
    let failure = null;

    try {
      try {
        browser = await launchBrowser({
          executablePath,
          headless: true,
        });
      } catch (error) {
        throw safeOracleError(error, 'BROWSER_LAUNCH_FAILED');
      }

      context = await browser.newContext({
        extraHTTPHeaders: bypassSecret
          ? { 'x-vercel-protection-bypass': bypassSecret }
          : {},
        ignoreHTTPSErrors: false,
        serviceWorkers: 'block',
      });
      await context.addInitScript(() => {
        delete globalThis.__mestoAcceptance;
        delete globalThis.__storedXssExecuted;
      });
      await context.route('**/*', async (route) => {
        let url;
        try {
          url = new URL(route.request().url());
        } catch {
          await route.abort('blockedbyclient');
          return;
        }
        if (/^https?:$/.test(url.protocol)
          && url.origin !== origin
          && !isAllowedPassiveCrossOriginRequest(route.request())) {
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
      page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
      const eventFailures = attachEventOracles(page, origin, targetUrl, probeToken);

      const initialResponse = await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      assertNavigationResponse(initialResponse, page, targetUrl);
      await settleAndAssert(page, expectedTitle, probeToken);

      for (let reload = 0; reload < 2; reload += 1) {
        const reloadResponse = await page.reload({ waitUntil: 'domcontentloaded' });
        assertNavigationResponse(reloadResponse, page, targetUrl);
        await settleAndAssert(page, expectedTitle, probeToken);
      }

      assertEventOracles(eventFailures);
      result = Object.freeze({
        passed: true,
        observations: 3,
        reloads: 2,
      });
    } catch (error) {
      failure = safeOracleError(error, 'BROWSER_ORACLE_FAILED');
    } finally {
      if (context) {
        try {
          await context.close();
        } catch {
          if (!failure) failure = new PreviewBrowserOracleError('BROWSER_CONTEXT_CLOSE_FAILED');
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch {
          if (!failure) failure = new PreviewBrowserOracleError('BROWSER_CLOSE_FAILED');
        }
      }
    }

    if (failure) throw failure;
    return result;
  };
}

const defaultVerifier = createStoredXssBrowserVerifier({
  launchBrowser: (options) => chromium.launch(options),
});

export function verifyStoredXssBrowser({
  baseUrl,
  venueSlug,
  expectedTitle,
  probeToken,
  bypassSecret = '',
  executablePath,
}) {
  return defaultVerifier({
    baseUrl,
    venueSlug,
    expectedTitle,
    probeToken,
    bypassSecret,
    executablePath,
  });
}
