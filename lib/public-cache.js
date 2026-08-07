let invalidationAdapter = null;

function configurePublicCacheInvalidation(adapter) {
  if (adapter !== null && typeof adapter?.invalidateVenue !== 'function') {
    throw new TypeError('Public cache adapter must implement invalidateVenue(details)');
  }
  invalidationAdapter = adapter;
}

async function invalidatePublicVenueCache(details = {}) {
  if (!invalidationAdapter) return { configured: false, invalidated: false };
  await invalidationAdapter.invalidateVenue({
    id: String(details.id || ''),
    slug: String(details.slug || ''),
    reason: String(details.reason || 'venue.changed')
  });
  return { configured: true, invalidated: true };
}

module.exports = { configurePublicCacheInvalidation, invalidatePublicVenueCache };
