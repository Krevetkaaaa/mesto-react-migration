const { authenticateFixture, expect, test } = require('./support/test-fixtures');

test.describe('Phase 5 fixture contracts', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'visual-1440x900', 'fixture contracts run once');
  });

  test('fixture authentication cookie is shared by the legacy and React gateway ports', async ({ page }) => {
    await authenticateFixture(page, 'customer');

    for (const url of ['http://127.0.0.1:4173/', 'http://127.0.0.1:4174/']) {
      const cookies = await page.context().cookies(url);
      expect(cookies).toContainEqual(expect.objectContaining({
        name: 'e2e-session',
        value: 'customer',
        domain: '127.0.0.1',
        path: '/'
      }));
    }
  });

  test('catalog and venue detail requests expose independent counters and stable slugs', async ({ request, fixtureApi }) => {
    const catalogResponse = await request.get('/api/venues');
    expect(catalogResponse.status()).toBe(200);
    const catalog = await catalogResponse.json();
    expect(catalog.items.map((item) => item.slug)).toEqual([
      'tihiy-sad',
      'morskoy-svet',
      'kofe-vo-dvore'
    ]);

    const detailResponse = await request.get('/api/venues/tihiy-sad');
    expect(detailResponse.status()).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({
      venue: { slug: 'tihiy-sad', status: 'published' }
    });

    const state = await fixtureApi.read();
    expect(state.requestCounters).toEqual({
      venueList: 1,
      venueDetail: 1,
      venueDetailBySlug: { 'tihiy-sad': 1 }
    });
  });

  test('summary contract aggregates the exact published fixture catalog', async ({ request, fixtureApi }) => {
    const response = await request.get('/api/venues?summary=1');

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total: 3,
      byCategory: { 'Рестораны': 2, 'Кофейни': 1 },
      byCity: { 'Симферополь': 2, 'Ялта': 1 },
      source: 'database',
      databaseConfigured: true
    });
    expect((await fixtureApi.read()).requestCounters.venueList).toBe(1);
  });

  test('venue detail records, delay and error state are controllable', async ({ request, fixtureApi }) => {
    const details = (await fixtureApi.read()).publicVenueDetails;
    await fixtureApi.set({
      publicVenueDetails: [{ ...details[0], slug: 'fixture-only-place' }],
      venueDelayMs: 25
    });

    const startedAt = Date.now();
    const response = await request.get('/api/venues/fixture-only-place');
    expect(response.status()).toBe(200);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);

    await fixtureApi.set({ venueError: true, venueDelayMs: 0 });
    const errorResponse = await request.get('/api/venues/fixture-only-place');
    expect(errorResponse.status()).toBe(503);

    await fixtureApi.set({ venueError: false });
    const missingResponse = await request.get('/api/venues/tihiy-sad');
    expect(missingResponse.status()).toBe(404);
    expect((await fixtureApi.read()).requestCounters).toEqual({
      venueList: 0,
      venueDetail: 3,
      venueDetailBySlug: { 'fixture-only-place': 2, 'tihiy-sad': 1 }
    });
  });
});
