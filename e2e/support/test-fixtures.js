const { test: base, expect } = require('@playwright/test');

function fontFace(origin, family, slug, weights) {
  return weights.map((weight) => `@font-face{font-family:'${family}';font-style:normal;font-display:block;font-weight:${weight};src:url('${origin}/__e2e-fonts/${slug}-${weight}-normal.woff2') format('woff2');}`).join('\n');
}

const test = base.extend({
  colorTheme: ['light', { option: true }],
  expectedConsolePatterns: [[], { option: true }],
  expectedHttpErrors: [[], { option: true }],
  fixtureApi: async ({ baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    const request = async (path, options = {}) => {
      const response = await fetch(`${origin}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Fixture API failed with ${response.status}`);
      return payload;
    };
    await request('/__e2e/reset', { method: 'POST', body: '{}' });
    await use({
      read: () => request('/__e2e/state'),
      set: (patch) => request('/__e2e/state', { method: 'POST', body: JSON.stringify(patch) })
    });
  },
  page: async ({ page, baseURL, colorTheme, expectedConsolePatterns, expectedHttpErrors, fixtureApi: _fixtureApi }, use, testInfo) => {
    const browserErrors = [];
    const expectedMatches = new Set();
    const origin = new URL(baseURL).origin;
    const fontCss = [
      fontFace(origin, 'Manrope', 'manrope', [400, 500, 600, 700, 800]),
      fontFace(origin, 'Cormorant Garamond', 'cormorant-garamond', [500, 600, 700])
    ].join('\n');

    // Apply the media preference explicitly before the first navigation. Project-level
    // viewport overrides must never let reveal-on-scroll motion hide full-page content.
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const source = message.location().url || '';
      const anonymousSessionProbe = message.text().includes('401 (Unauthorized)')
        && ['/api/auth/session', '/api/admin/session'].some((path) => source.includes(path));
      const expectedHttpError = expectedHttpErrors.find(({ path, status }) => source.includes(path) && message.text().includes(`${status}`));
      const expectedPattern = expectedConsolePatterns.find((pattern) => message.text().includes(pattern));
      if (expectedHttpError) expectedMatches.add(`http:${expectedHttpError.status}:${expectedHttpError.path}`);
      if (expectedPattern) expectedMatches.add(`console:${expectedPattern}`);
      if (!anonymousSessionProbe && !expectedHttpError && !expectedPattern) browserErrors.push(`console: ${message.text()}${source ? ` @ ${source}` : ''}`);
    });
    page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.stack || error.message}`));

    await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: fontCss
    }));
    await page.addInitScript(({ fixedTimestamp, theme }) => {
      const NativeDate = Date;
      class FixedDate extends NativeDate {
        constructor(...arguments_) {
          super(...(arguments_.length ? arguments_ : [fixedTimestamp]));
        }

        static now() {
          return fixedTimestamp;
        }
      }
      globalThis.Date = FixedDate;
      try { window.localStorage.setItem('mesto-color-theme', theme); } catch { /* Storage is optional. */ }
    }, { fixedTimestamp: Date.parse('2026-08-05T09:00:00.000Z'), theme: colorTheme });

    await use(page);

    if (browserErrors.length) {
      await testInfo.attach('browser-console-errors', {
        body: Buffer.from(browserErrors.join('\n'), 'utf8'),
        contentType: 'text/plain'
      });
    }
    expect(browserErrors, 'legacy page must not emit console errors or uncaught exceptions').toEqual([]);
    if (testInfo.status !== 'skipped') {
      expectedHttpErrors.forEach(({ path, status }) => expect(expectedMatches.has(`http:${status}:${path}`), `expected HTTP ${status} console signal for ${path}`).toBe(true));
      expectedConsolePatterns.forEach((pattern) => expect(expectedMatches.has(`console:${pattern}`), `expected characterized console error containing: ${pattern}`).toBe(true));
    }
  }
});

async function waitForStableUi(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    const visibleImages = [...document.images].filter((image) => {
      const box = image.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && box.bottom >= 0 && box.top <= window.innerHeight;
    });
    await Promise.all(visibleImages.map((image) => image.complete ? image.decode().catch(() => {}) : new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    })));
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(75);
}

async function waitForFullPageStableUi(page) {
  await waitForStableUi(page);
  await page.evaluate(async () => {
    const step = Math.max(Math.floor(window.innerHeight / 2), 300);
    const bottom = document.documentElement.scrollHeight;
    for (let offset = 0; offset < bottom; offset += step) {
      window.scrollTo(0, offset);
      await new Promise((resolve) => window.setTimeout(resolve, 35));
    }
    const unrevealed = [...document.querySelectorAll('[data-motion-observed="true"]:not(.is-revealed)')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
    for (const element of unrevealed) {
      element.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => window.setTimeout(resolve, 200));
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(75);
  return page.evaluate(async () => {
    for (const animation of document.getAnimations({ subtree: true })) {
      try {
        const declaredTiming = animation.effect?.getTiming();
        const computedTiming = animation.effect?.getComputedTiming();
        if (declaredTiming && computedTiming && Number.isFinite(declaredTiming.iterations) && Number.isFinite(computedTiming.endTime)) {
          animation.finish();
        } else {
          animation.pause();
          animation.currentTime = 0;
        }
      } catch { /* A detached animation can disappear while the page settles. */ }
    }

    let previous = '';
    let consecutiveMatches = 0;
    let dimensions;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      document.documentElement.scrollLeft = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollLeft = 0;
      document.body.scrollTop = 0;
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      dimensions = {
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      };
      const serialized = JSON.stringify(dimensions);
      consecutiveMatches = serialized === previous && dimensions.scrollX === 0 && dimensions.scrollY === 0 ? consecutiveMatches + 1 : 1;
      if (consecutiveMatches >= 3) return dimensions;
      previous = serialized;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }

    throw new Error(`Full-page dimensions did not stabilize: ${JSON.stringify(dimensions)}`);
  });
}

async function openLoginDialog(page) {
  const desktopTrigger = page.locator('.login-trigger');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
  } else {
    await page.locator('.mobile-menu-toggle').click();
    await page.locator('.mobile-nav [data-open-auth]').click();
  }
  await expect(page.locator('#auth-dialog')).toBeVisible();
}

async function openRegisterDialog(page) {
  const desktopTrigger = page.locator('.register-trigger');
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
  } else {
    await openLoginDialog(page);
    await page.locator('#auth-dialog [data-open-register]').click();
  }
  await expect(page.locator('#register-dialog')).toBeVisible();
}

async function openCatalogFromCategory(page, category = 'Рестораны') {
  const response = page.waitForResponse((candidate) => {
    if (candidate.request().method() !== 'GET') return false;
    const url = new URL(candidate.url());
    return url.pathname === '/api/venues' && url.searchParams.get('category') === category;
  });
  await page.locator(`.category-card[data-filter-category="${category}"]`).click();
  await response;
  await expect(page.locator('#catalog-view')).toBeVisible();
  await expect(page.locator('#catalog-view')).not.toHaveClass(/is-catalog-loading/);
}

async function authenticateFixture(page, role) {
  const sessions = {
    admin: ['e2e-admin', 'active'],
    customer: ['e2e-session', 'customer'],
    merchant: ['e2e-session', 'merchant']
  };
  const [name, value] = sessions[role] || [];
  if (!name) throw new Error(`Unknown fixture role: ${role}`);
  await page.context().addCookies([{ name, value, url: 'http://127.0.0.1:4173', httpOnly: true, sameSite: 'Lax' }]);
}

const savedFavorite = {
  id: 'favorite-marea',
  venue_key: 'marea',
  venue_id: null,
  external_venue_id: 'marea',
  snapshot: {
    title: 'Баркас',
    type: 'Ресторан · Севастополь',
    rating: '4.9',
    image: 'assets/venue-restaurant-unsplash.jpg',
    text: 'Ресторан черноморской кухни с винным бутиком и спокойной атмосферой у воды.'
  }
};

module.exports = {
  authenticateFixture,
  expect,
  openCatalogFromCategory,
  openLoginDialog,
  openRegisterDialog,
  savedFavorite,
  test,
  waitForFullPageStableUi,
  waitForStableUi
};
