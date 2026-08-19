const {
  createCachePurgeAdapterFromEnvironment,
  publicCatalogCacheHeaders,
  publicVenueCacheHeaders
} = require('./cache-purge');

let invalidationAdapter = createCachePurgeAdapterFromEnvironment();

function telemetryEnabled() {
  return process.env.VERCEL === '1' || process.env.MESTO_TELEMETRY_LOGS === '1';
}

function safeErrorCode(error) {
  const code = String(error?.code || '').trim();
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'CACHE_PURGE_FAILED';
}

function logInvalidationFailure(error, details) {
  if (!telemetryEnabled()) return;
  console.error(JSON.stringify({
    level: 'error',
    event: 'cache.purge.failed',
    code: safeErrorCode(error),
    scope: details.id ? 'venue' : 'catalog'
  }));
}

function configurePublicCacheInvalidation(adapter) {
  if (adapter !== null && typeof adapter?.invalidateVenue !== 'function') {
    throw new TypeError('Public cache adapter must implement invalidateVenue(details)');
  }
  invalidationAdapter = adapter;
}

async function invalidatePublicVenueCache(details = {}) {
  if (!invalidationAdapter) return { configured: false, requested: false };
  const normalized = {
    id: String(details.id || ''),
    slug: String(details.slug || ''),
    reason: String(details.reason || 'venue.changed')
  };
  try {
    await invalidationAdapter.invalidateVenue(normalized);
    return { configured: true, requested: true };
  } catch (error) {
    logInvalidationFailure(error, normalized);
    throw error;
  }
}

module.exports = {
  configurePublicCacheInvalidation,
  invalidatePublicVenueCache,
  publicCatalogCacheHeaders,
  publicVenueCacheHeaders
};
