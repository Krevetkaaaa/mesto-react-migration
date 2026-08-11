const crypto = require('node:crypto');
const { json } = require('./http');

const REDIS_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  'return {count, ttl}'
].join('\n');

/**
 * @typedef {'public-catalog'|'public-detail'|'auth-login'|'auth-register'|'oauth'|'upload'|'mutation'} RateLimitPolicyName
 * @typedef {{ limit: number, windowMs: number, category: string }} RateLimitPolicy
 * @typedef {{ limited: boolean, limit: number, remaining: number, resetAt: number, retryAfter: number, scope: string, keyHash: string }} RateLimitDecision
 * @typedef {{ consume(input: { key: string, limit: number, windowMs: number }): Promise<{ count: number, resetAt: number }> }} RateLimitAdapter
 */

/** @type {Readonly<Record<RateLimitPolicyName, RateLimitPolicy>>} */
const RATE_LIMIT_POLICIES = Object.freeze({
  'public-catalog': Object.freeze({ category: 'public-read', limit: 30, windowMs: 60_000 }),
  'public-detail': Object.freeze({ category: 'public-read', limit: 60, windowMs: 60_000 }),
  'auth-login': Object.freeze({ category: 'authentication', limit: 10, windowMs: 15 * 60_000 }),
  'auth-register': Object.freeze({ category: 'authentication', limit: 5, windowMs: 60 * 60_000 }),
  oauth: Object.freeze({ category: 'oauth', limit: 20, windowMs: 15 * 60_000 }),
  upload: Object.freeze({ category: 'upload', limit: 12, windowMs: 60 * 60_000 }),
  mutation: Object.freeze({ category: 'mutation', limit: 30, windowMs: 60_000 })
});

class RateLimitError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'RateLimitError';
    this.code = code;
    this.statusCode = 503;
  }
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function clientAddress(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous')
    .split(',')[0]
    .trim() || 'anonymous';
}

function opaqueKey(scope, address, identifier = '') {
  const raw = `${scope}|${address}|${String(identifier).trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(raw).digest('base64url');
}

function createMemoryRateLimitAdapter({ now = Date.now } = {}) {
  const buckets = new Map();
  let calls = 0;
  return {
    kind: 'memory',
    async consume({ key, limit, windowMs }) {
      positiveInteger(limit, 'limit');
      positiveInteger(windowMs, 'windowMs');
      const currentTime = now();
      const current = buckets.get(key);
      const bucket = !current || currentTime >= current.resetAt
        ? { count: 0, resetAt: currentTime + windowMs }
        : current;
      bucket.count += 1;
      buckets.set(key, bucket);
      calls += 1;
      if (calls % 250 === 0) {
        for (const [storedKey, value] of buckets) {
          if (currentTime >= value.resetAt) buckets.delete(storedKey);
        }
      }
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
    reset() {
      buckets.clear();
      calls = 0;
    }
  };
}

function validateRedisConfiguration({ url, token }) {
  let endpoint;
  try {
    endpoint = new URL(String(url || ''));
  } catch {
    throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Distributed rate limit URL is invalid');
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Distributed rate limit URL must be a credential-free HTTPS origin');
  }
  if (!String(token || '').trim()) {
    throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Distributed rate limit token is missing');
  }
  return { endpoint: endpoint.toString().replace(/\/$/, ''), token: String(token).trim() };
}

function validateRedisNamespace(value) {
  const namespace = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9:-]{0,63}$/.test(namespace)) {
    throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Distributed rate limit namespace is invalid');
  }
  return namespace;
}

function redisCredentials(environment) {
  const explicitUrl = String(environment.MESTO_RATE_LIMIT_REDIS_URL || '').trim();
  const explicitToken = String(environment.MESTO_RATE_LIMIT_REDIS_TOKEN || '').trim();
  if (Boolean(explicitUrl) !== Boolean(explicitToken)) {
    throw new RateLimitError(
      'RATE_LIMIT_CONFIGURATION_ERROR',
      'MESTO rate limit Redis URL and token must be configured together'
    );
  }
  if (explicitUrl) return { url: explicitUrl, token: explicitToken };
  return {
    url: environment.KV_REST_API_URL,
    token: environment.KV_REST_API_TOKEN
  };
}

function createUpstashRedisRateLimitAdapter({ url, token, namespace = 'local', fetchImpl = global.fetch } = {}) {
  const config = validateRedisConfiguration({ url, token });
  const keyNamespace = validateRedisNamespace(namespace);
  if (typeof fetchImpl !== 'function') {
    throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Distributed rate limit transport is unavailable');
  }
  return {
    kind: 'upstash-redis',
    async consume({ key, limit, windowMs }) {
      positiveInteger(limit, 'limit');
      positiveInteger(windowMs, 'windowMs');
      let response;
      try {
        response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(['EVAL', REDIS_SCRIPT, '1', `mesto:${keyNamespace}:rate-limit:${key}`, String(limit), String(windowMs)]),
          signal: AbortSignal.timeout(2_500)
        });
      } catch (error) {
        throw new RateLimitError('RATE_LIMIT_PROVIDER_UNAVAILABLE', 'Distributed rate limit provider is unavailable', error);
      }
      if (!response.ok) {
        throw new RateLimitError('RATE_LIMIT_PROVIDER_UNAVAILABLE', 'Distributed rate limit provider rejected the request');
      }
      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new RateLimitError('RATE_LIMIT_PROVIDER_INVALID_RESPONSE', 'Distributed rate limit provider returned invalid JSON', error);
      }
      const count = Number(payload?.result?.[0]);
      const ttl = Number(payload?.result?.[1]);
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttl) || ttl < 0) {
        throw new RateLimitError('RATE_LIMIT_PROVIDER_INVALID_RESPONSE', 'Distributed rate limit provider returned an invalid decision');
      }
      return { count, resetAt: Date.now() + Math.max(1, Math.ceil(ttl)) };
    }
  };
}

function createRateLimiter({ adapter, now = Date.now, reportLimited = defaultLimitedReporter } = {}) {
  if (!adapter || typeof adapter.consume !== 'function') {
    throw new TypeError('Rate limit adapter must implement consume(input)');
  }
  return {
    async consume(req, { policy, scope, identifier = '' }) {
      const selected = RATE_LIMIT_POLICIES[policy];
      if (!selected) throw new TypeError(`Unknown rate limit policy: ${policy}`);
      if (!String(scope || '').trim()) throw new TypeError('Rate limit scope is required');
      const keyHash = opaqueKey(scope, clientAddress(req), identifier);
      const result = await adapter.consume({ key: keyHash, limit: selected.limit, windowMs: selected.windowMs });
      if (!Number.isSafeInteger(result?.count) || result.count < 1 || !Number.isFinite(result?.resetAt)) {
        throw new RateLimitError('RATE_LIMIT_PROVIDER_INVALID_RESPONSE', 'Rate limit adapter returned an invalid decision');
      }
      const currentTime = now();
      const retryAfter = result.count > selected.limit
        ? Math.max(1, Math.ceil((result.resetAt - currentTime) / 1000))
        : 0;
      const decision = {
        limited: retryAfter > 0,
        limit: selected.limit,
        remaining: Math.max(0, selected.limit - result.count),
        resetAt: result.resetAt,
        retryAfter,
        scope: String(scope),
        keyHash
      };
      if (decision.limited) {
        try {
          reportLimited({
            event: 'rate_limit_exceeded',
            category: selected.category,
            scope: decision.scope,
            keyHash: decision.keyHash,
            retryAfter: decision.retryAfter
          });
        } catch {
          // Observability must not change the request decision.
        }
      }
      return decision;
    }
  };
}

function defaultLimitedReporter(metric) {
  console.warn(JSON.stringify(metric));
}

function configuration(environment = process.env) {
  const production = environment.NODE_ENV === 'production' || environment.VERCEL_ENV === 'production';
  const provider = String(environment.MESTO_RATE_LIMIT_PROVIDER || (production ? '' : 'memory')).trim().toLowerCase();
  if (provider === 'memory') {
    if (production) {
      throw new RateLimitError('RATE_LIMIT_CONFIGURATION_ERROR', 'Memory rate limiting is not allowed in production');
    }
    return { provider };
  }
  if (provider === 'upstash-redis') {
    const validated = validateRedisConfiguration(redisCredentials(environment));
    const namespace = validateRedisNamespace(
      environment.MESTO_REDIS_NAMESPACE || environment.VERCEL_ENV || 'local'
    );
    return { provider, namespace, ...validated };
  }
  throw new RateLimitError(
    'RATE_LIMIT_CONFIGURATION_ERROR',
    production
      ? 'Distributed rate limiting is not configured for production'
      : 'MESTO_RATE_LIMIT_PROVIDER must be memory or upstash-redis'
  );
}

let configuredLimiter;
let configuredSignature;

function getConfiguredRateLimiter(environment = process.env) {
  const config = configuration(environment);
  const signature = JSON.stringify({
    provider: config.provider,
    namespace: config.namespace || '',
    endpoint: config.endpoint || '',
    tokenHash: config.token ? crypto.createHash('sha256').update(config.token).digest('base64url') : ''
  });
  if (configuredLimiter && signature === configuredSignature) return configuredLimiter;
  const adapter = config.provider === 'memory'
    ? createMemoryRateLimitAdapter()
    : createUpstashRedisRateLimitAdapter({
      url: config.endpoint,
      token: config.token,
      namespace: config.namespace
    });
  configuredLimiter = createRateLimiter({ adapter });
  configuredSignature = signature;
  return configuredLimiter;
}

function rateLimitHeaders(decision) {
  const headers = {
    'RateLimit-Limit': String(decision.limit),
    'RateLimit-Remaining': String(decision.remaining),
    'RateLimit-Reset': String(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000)))
  };
  if (decision.limited) headers['Retry-After'] = String(decision.retryAfter);
  return headers;
}

async function enforceRateLimit(req, res, options) {
  let decision;
  try {
    decision = await getConfiguredRateLimiter().consume(req, options);
  } catch (error) {
    if (!(error instanceof RateLimitError)) throw error;
    json(res, 503, {
      code: 'RATE_LIMIT_UNAVAILABLE',
      message: 'Защита от чрезмерного числа запросов временно недоступна.'
    });
    return false;
  }
  if (!decision.limited) return true;
  json(res, 429, {
    code: options.code || 'RATE_LIMITED',
    message: options.message || 'Слишком много запросов. Повторите позже.'
  }, rateLimitHeaders(decision));
  return false;
}

function resetRateLimiterForTests() {
  configuredLimiter = undefined;
  configuredSignature = undefined;
}

module.exports = {
  RATE_LIMIT_POLICIES,
  RateLimitError,
  configuration,
  createMemoryRateLimitAdapter,
  createRateLimiter,
  createUpstashRedisRateLimitAdapter,
  enforceRateLimit,
  rateLimitHeaders,
  resetRateLimiterForTests,
  validateRedisConfiguration,
  validateRedisNamespace
};
