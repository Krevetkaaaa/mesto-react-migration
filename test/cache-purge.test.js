const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CachePurgeConfigurationError,
  CachePurgeProviderError,
  PUBLIC_VENUES_TAG,
  VERCEL_CDN_CACHE_CONTROL,
  createCachePurgeAdapterFromEnvironment,
  createVercelCachePurgeAdapter,
  publicCatalogCacheHeaders,
  publicVenueCacheHeaders,
  venueEntityCacheTag,
  venueInvalidationTags
} = require('../lib/cache-purge');

const VENUE_ID = '30000000-0000-4000-8000-000000000001';
const VENUE_TAG = `mesto-venue-${VENUE_ID}`;

test('public cache tags keep catalog and venue invalidation scopes separate', () => {
  assert.equal(venueEntityCacheTag(VENUE_ID.toUpperCase()), VENUE_TAG);
  assert.equal(venueEntityCacheTag('../unsafe'), '');
  assert.deepEqual(publicCatalogCacheHeaders(), {
    'Vercel-CDN-Cache-Control': VERCEL_CDN_CACHE_CONTROL,
    'Vercel-Cache-Tag': PUBLIC_VENUES_TAG
  });
  assert.deepEqual(publicVenueCacheHeaders({ id: VENUE_ID }), {
    'Vercel-CDN-Cache-Control': VERCEL_CDN_CACHE_CONTROL,
    'Vercel-Cache-Tag': VENUE_TAG
  });
  assert.deepEqual(publicVenueCacheHeaders({ id: 'not-a-uuid' }), {});

  assert.deepEqual(venueInvalidationTags({ id: VENUE_ID, reason: 'venue.updated' }), [
    PUBLIC_VENUES_TAG,
    VENUE_TAG
  ]);
  assert.deepEqual(venueInvalidationTags({ id: VENUE_ID, reason: 'menu.updated' }), [VENUE_TAG]);
  assert.deepEqual(venueInvalidationTags({ reason: 'submission.approved' }), [PUBLIC_VENUES_TAG]);
});

test('Vercel adapter uses the project-scoped Function API with bounded tags', async () => {
  const calls = [];
  const adapter = createVercelCachePurgeAdapter({
    async invalidateByTagImpl(tags) {
      calls.push(tags);
    }
  });

  const result = await adapter.invalidateVenue({ id: VENUE_ID, reason: 'venue.updated' });

  assert.deepEqual(result, {
    provider: 'vercel',
    requested: true,
    tags: [PUBLIC_VENUES_TAG, VENUE_TAG]
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [PUBLIC_VENUES_TAG, VENUE_TAG]);
});

test('Vercel adapter normalizes Function API failures without exposing provider details', async () => {
  const adapter = createVercelCachePurgeAdapter({
    async invalidateByTagImpl() {
      throw new Error('provider account details must stay private');
    }
  });

  await assert.rejects(
    adapter.invalidateTags([PUBLIC_VENUES_TAG]),
    (error) => {
      assert.ok(error instanceof CachePurgeProviderError);
      assert.equal(error.code, 'CACHE_PURGE_PROVIDER_UNAVAILABLE');
      assert.equal(error.statusCode, 502);
      assert.doesNotMatch(error.message, /account details/);
      return true;
    }
  );
});

test('environment composition is explicitly disabled until a provider is selected', () => {
  assert.equal(createCachePurgeAdapterFromEnvironment({}), null);
  assert.equal(createCachePurgeAdapterFromEnvironment({ MESTO_CACHE_PURGE_PROVIDER: 'none' }), null);
});

test('invalid declared provider configuration stays observable without crashing module startup', async () => {
  const adapter = createCachePurgeAdapterFromEnvironment({
    MESTO_CACHE_PURGE_PROVIDER: 'vercel',
    VERCEL_ENV: 'preview'
  });

  assert.equal(adapter.provider, 'vercel');
  assert.ok(adapter.configurationError instanceof CachePurgeConfigurationError);
  assert.equal(adapter.configurationError.code, 'CACHE_PURGE_NOT_CONFIGURED');
  await assert.rejects(adapter.invalidateVenue({ id: VENUE_ID }), {
    code: 'CACHE_PURGE_NOT_CONFIGURED'
  });
});

test('environment composition uses implicit Vercel project and environment context', async () => {
  const calls = [];
  const adapter = createCachePurgeAdapterFromEnvironment({
    MESTO_CACHE_PURGE_PROVIDER: 'vercel',
    VERCEL: '1',
    VERCEL_ENV: 'production'
  }, {
    async invalidateByTagImpl(tags) {
      calls.push(tags);
    }
  });

  await adapter.invalidateVenue({ id: VENUE_ID, reason: 'promotion.created' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [VENUE_TAG]);
});

test('the real Function API path reports a request, not unprovable CDN invalidation', async () => {
  const adapter = createCachePurgeAdapterFromEnvironment({
    MESTO_CACHE_PURGE_PROVIDER: 'vercel',
    VERCEL: '1',
    VERCEL_ENV: 'preview'
  });

  assert.deepEqual(await adapter.invalidateVenue({ id: VENUE_ID, reason: 'venue.updated' }), {
    provider: 'vercel',
    requested: true,
    tags: [PUBLIC_VENUES_TAG, VENUE_TAG]
  });
});
