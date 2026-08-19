const { invalidateByTag } = require('@vercel/functions');

const PUBLIC_VENUES_TAG = 'mesto-venues';
const VERCEL_CACHE_TAG_HEADER = 'Vercel-Cache-Tag';
const VERCEL_CDN_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=120';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class CachePurgeConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CachePurgeConfigurationError';
    this.code = 'CACHE_PURGE_NOT_CONFIGURED';
  }
}

class CachePurgeProviderError extends Error {
  constructor(code, statusCode = 502) {
    super(code);
    this.name = 'CachePurgeProviderError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function environmentValue(value) {
  return String(value || '').trim();
}

function canonicalVenueId(value) {
  const id = environmentValue(value).toLowerCase();
  return UUID_PATTERN.test(id) ? id : '';
}

function venueEntityCacheTag(id) {
  const canonicalId = canonicalVenueId(id);
  return canonicalId ? `mesto-venue-${canonicalId}` : '';
}

function venueInvalidationTags(details = {}) {
  const entityTag = venueEntityCacheTag(details.id);
  const reason = environmentValue(details.reason || 'venue.changed').toLowerCase();
  const contentOnly = reason.startsWith('menu.') || reason.startsWith('promotion.');
  const tags = [];

  if (!contentOnly || !entityTag) tags.push(PUBLIC_VENUES_TAG);
  if (entityTag) tags.push(entityTag);
  return tags;
}

function cacheTagHeaders(tags) {
  const normalized = Array.from(new Set(tags.map((tag) => environmentValue(tag)).filter(Boolean)));
  if (!normalized.length) return {};
  return {
    'Vercel-CDN-Cache-Control': VERCEL_CDN_CACHE_CONTROL,
    [VERCEL_CACHE_TAG_HEADER]: normalized.join(',')
  };
}

function publicCatalogCacheHeaders() {
  return cacheTagHeaders([PUBLIC_VENUES_TAG]);
}

function publicVenueCacheHeaders(details = {}) {
  const entityTag = venueEntityCacheTag(details.id);
  return entityTag ? cacheTagHeaders([entityTag]) : {};
}

function normalizeTags(values) {
  if (!Array.isArray(values) || !values.length || values.length > 128) {
    throw new TypeError('Cache purge requires between 1 and 128 tags');
  }
  return Array.from(new Set(values.map((value) => {
    const tag = environmentValue(value);
    if (!tag || tag.includes(',') || Buffer.byteLength(tag, 'utf8') > 256) {
      throw new TypeError('Cache tags must be non-empty, comma-free, and at most 256 UTF-8 bytes');
    }
    return tag;
  })));
}

function createVercelCachePurgeAdapter(options = {}) {
  const invalidate = options.invalidateByTagImpl || invalidateByTag;
  if (typeof invalidate !== 'function') {
    throw new CachePurgeConfigurationError('Vercel cache invalidation API is unavailable');
  }

  async function invalidateTags(values) {
    const tags = normalizeTags(values);
    try {
      await invalidate(tags);
    } catch {
      throw new CachePurgeProviderError('CACHE_PURGE_PROVIDER_UNAVAILABLE');
    }
    return { provider: 'vercel', requested: true, tags };
  }

  return Object.freeze({
    provider: 'vercel',
    invalidateTags,
    invalidateVenue(details) {
      return invalidateTags(venueInvalidationTags(details));
    }
  });
}

function unavailableAdapter(provider, error) {
  return Object.freeze({
    provider,
    configurationError: error,
    async invalidateVenue() {
      throw error;
    }
  });
}

function createCachePurgeAdapterFromEnvironment(environment = process.env, options = {}) {
  const provider = environmentValue(environment.MESTO_CACHE_PURGE_PROVIDER).toLowerCase();
  if (!provider || provider === 'none') return null;
  if (provider !== 'vercel') {
    return unavailableAdapter(provider, new CachePurgeConfigurationError(`Unsupported cache purge provider: ${provider}`));
  }

  try {
    const vercelEnvironment = environmentValue(environment.VERCEL_ENV).toLowerCase();
    if (environmentValue(environment.VERCEL) !== '1'
      || (vercelEnvironment !== 'production' && vercelEnvironment !== 'preview')) {
      throw new CachePurgeConfigurationError('Vercel cache purge requires a Preview or Production Function runtime');
    }
    return createVercelCachePurgeAdapter({
      invalidateByTagImpl: options.invalidateByTagImpl
    });
  } catch (error) {
    const configurationError = error instanceof CachePurgeConfigurationError
      ? error
      : new CachePurgeConfigurationError('Vercel cache purge configuration is invalid');
    return unavailableAdapter(provider, configurationError);
  }
}

module.exports = {
  CachePurgeConfigurationError,
  CachePurgeProviderError,
  PUBLIC_VENUES_TAG,
  VERCEL_CDN_CACHE_CONTROL,
  VERCEL_CACHE_TAG_HEADER,
  cacheTagHeaders,
  createCachePurgeAdapterFromEnvironment,
  createVercelCachePurgeAdapter,
  publicCatalogCacheHeaders,
  publicVenueCacheHeaders,
  venueEntityCacheTag,
  venueInvalidationTags
};
