const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RATE_LIMIT_POLICIES,
  RateLimitError,
  configuration,
  createMemoryRateLimitAdapter,
  createRateLimiter,
  createUpstashRedisRateLimitAdapter,
  enforceRateLimit,
  resetRateLimiterForTests
} = require('../lib/rate-limit');

const originalEnvironment = {
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  MESTO_RATE_LIMIT_PROVIDER: process.env.MESTO_RATE_LIMIT_PROVIDER,
  MESTO_RATE_LIMIT_REDIS_TOKEN: process.env.MESTO_RATE_LIMIT_REDIS_TOKEN,
  MESTO_RATE_LIMIT_REDIS_URL: process.env.MESTO_RATE_LIMIT_REDIS_URL,
  MESTO_REDIS_NAMESPACE: process.env.MESTO_REDIS_NAMESPACE,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV
};

test.afterEach(() => {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetRateLimiterForTests();
});

function request(address = '203.0.113.10') {
  return {
    headers: { 'x-forwarded-for': `${address}, 10.0.0.1` },
    socket: { remoteAddress: '127.0.0.1' }
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

test('memory adapter implements fixed-window policy decisions and resets without exposing identifiers', async () => {
  let now = 10_000;
  const metrics = [];
  const limiter = createRateLimiter({
    adapter: createMemoryRateLimitAdapter({ now: () => now }),
    now: () => now,
    reportLimited: (metric) => metrics.push(metric)
  });

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const decision = await limiter.consume(request(), {
      policy: 'auth-login',
      scope: 'login',
      identifier: 'Private.User@Example.com'
    });
    assert.equal(decision.limited, false);
    assert.equal(decision.remaining, 10 - attempt);
  }
  const blocked = await limiter.consume(request(), {
    policy: 'auth-login',
    scope: 'login',
    identifier: 'private.user@example.com'
  });
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfter, 900);
  assert.equal(metrics.length, 1);
  assert.doesNotMatch(JSON.stringify(metrics[0]), /203\.0\.113\.10|private\.user/i);
  assert.match(metrics[0].keyHash, /^[A-Za-z0-9_-]{43}$/);

  now += 15 * 60_000;
  const reset = await limiter.consume(request(), {
    policy: 'auth-login',
    scope: 'login',
    identifier: 'private.user@example.com'
  });
  assert.equal(reset.limited, false);
  assert.equal(reset.remaining, 9);
});

test('different rate-limit categories have independent policy budgets', async () => {
  const limiter = createRateLimiter({
    adapter: createMemoryRateLimitAdapter({ now: () => 1_000 }),
    now: () => 1_000,
    reportLimited: () => {}
  });
  const req = request();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await limiter.consume(req, {
      policy: 'auth-register', scope: 'register', identifier: 'person@example.com'
    })).limited, false);
  }
  assert.equal((await limiter.consume(req, {
    policy: 'auth-register', scope: 'register', identifier: 'person@example.com'
  })).limited, true);
  assert.equal((await limiter.consume(req, {
    policy: 'public-detail', scope: 'venue', identifier: 'venue-slug'
  })).limited, false);
  assert.equal((await limiter.consume(req, {
    policy: 'upload', scope: 'upload', identifier: 'user-id'
  })).limited, false);
  assert.equal((await limiter.consume(req, {
    policy: 'mutation', scope: 'mutation', identifier: 'reviews:POST'
  })).limited, false);
});

test('every declared policy is consumable through the shared contract', async () => {
  const limiter = createRateLimiter({
    adapter: createMemoryRateLimitAdapter({ now: () => 2_000 }),
    now: () => 2_000,
    reportLimited: () => {}
  });
  for (const [policy, expected] of Object.entries(RATE_LIMIT_POLICIES)) {
    const decision = await limiter.consume(request(), {
      policy,
      scope: `policy-contract-${policy}`,
      identifier: 'contract'
    });
    assert.equal(decision.limited, false, policy);
    assert.equal(decision.limit, expected.limit, policy);
    assert.equal(decision.remaining, expected.limit - 1, policy);
  }
});

test('adapter and metric seams cannot silently corrupt or override a limit decision', async () => {
  const invalidLimiter = createRateLimiter({
    adapter: { async consume() { return { count: 0, resetAt: Number.NaN }; } }
  });
  await assert.rejects(
    invalidLimiter.consume(request(), { policy: 'oauth', scope: 'invalid-adapter' }),
    (error) => error instanceof RateLimitError && error.code === 'RATE_LIMIT_PROVIDER_INVALID_RESPONSE'
  );

  const reportingFailure = createRateLimiter({
    adapter: { async consume() { return { count: 31, resetAt: Date.now() + 60_000 }; } },
    reportLimited() { throw new Error('metrics backend unavailable'); }
  });
  const decision = await reportingFailure.consume(request(), {
    policy: 'mutation', scope: 'reporting-failure'
  });
  assert.equal(decision.limited, true);
});

test('Upstash adapter performs one atomic EVAL without putting credentials in URL or body', async () => {
  const calls = [];
  const adapter = createUpstashRedisRateLimitAdapter({
    url: 'https://redis.example/',
    token: 'private-provider-token',
    namespace: 'preview',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ result: [3, 42_000] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });
  const result = await adapter.consume({ key: 'opaque-key', limit: 10, windowMs: 60_000 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://redis.example');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer private-provider-token');
  const command = JSON.parse(calls[0].options.body);
  assert.equal(command[0], 'EVAL');
  assert.equal(command[2], '1');
  assert.equal(command[3], 'mesto:preview:rate-limit:opaque-key');
  assert.equal(command[4], '10');
  assert.equal(command[5], '60000');
  assert.doesNotMatch(calls[0].url + calls[0].options.body, /private-provider-token/);
  assert.equal(result.count, 3);
  assert.ok(result.resetAt > Date.now());
});

test('Upstash adapter fails closed on transport and response contract failures', async (t) => {
  await t.test('transport failure', async () => {
    const adapter = createUpstashRedisRateLimitAdapter({
      url: 'https://redis.example',
      token: 'token',
      fetchImpl: async () => { throw new Error('private upstream detail'); }
    });
    await assert.rejects(
      adapter.consume({ key: 'key', limit: 1, windowMs: 1_000 }),
      (error) => error instanceof RateLimitError && error.code === 'RATE_LIMIT_PROVIDER_UNAVAILABLE'
    );
  });
  await t.test('invalid decision', async () => {
    const adapter = createUpstashRedisRateLimitAdapter({
      url: 'https://redis.example',
      token: 'token',
      fetchImpl: async () => new Response(JSON.stringify({ result: ['not-a-count', -1] }), { status: 200 })
    });
    await assert.rejects(
      adapter.consume({ key: 'key', limit: 1, windowMs: 1_000 }),
      (error) => error instanceof RateLimitError && error.code === 'RATE_LIMIT_PROVIDER_INVALID_RESPONSE'
    );
  });
});

test('configuration permits memory only outside production and validates distributed provider', () => {
  assert.deepEqual(configuration({ NODE_ENV: 'test' }), { provider: 'memory' });
  assert.throws(
    () => configuration({ NODE_ENV: 'production' }),
    (error) => error instanceof RateLimitError && error.code === 'RATE_LIMIT_CONFIGURATION_ERROR'
  );
  assert.throws(
    () => configuration({ NODE_ENV: 'production', MESTO_RATE_LIMIT_PROVIDER: 'memory' }),
    /not allowed in production/
  );
  assert.throws(
    () => configuration({
      NODE_ENV: 'production',
      MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
      MESTO_RATE_LIMIT_REDIS_URL: 'http://redis.example',
      MESTO_RATE_LIMIT_REDIS_TOKEN: 'token'
    }),
    /HTTPS/
  );
  const valid = configuration({
    NODE_ENV: 'production',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    MESTO_RATE_LIMIT_REDIS_URL: 'https://redis.example/',
    MESTO_RATE_LIMIT_REDIS_TOKEN: 'token',
    MESTO_REDIS_NAMESPACE: 'production'
  });
  assert.deepEqual(valid, {
    provider: 'upstash-redis',
    namespace: 'production',
    endpoint: 'https://redis.example',
    token: 'token'
  });

  const marketplace = configuration({
    VERCEL_ENV: 'production',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    KV_REST_API_URL: 'https://marketplace-redis.example',
    KV_REST_API_TOKEN: 'marketplace-token',
    MESTO_REDIS_NAMESPACE: 'production'
  });
  assert.equal(marketplace.endpoint, 'https://marketplace-redis.example');
  assert.equal(marketplace.namespace, 'production');
  assert.throws(() => configuration({
    VERCEL_ENV: 'production',
    MESTO_RATE_LIMIT_PROVIDER: 'upstash-redis',
    MESTO_RATE_LIMIT_REDIS_URL: 'https://partial.example',
    KV_REST_API_TOKEN: 'must-not-be-mixed'
  }), /configured together/);
});

test('HTTP enforcement emits controlled 429 headers and fails honestly when production is unconfigured', async () => {
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL_ENV;
  process.env.MESTO_RATE_LIMIT_PROVIDER = 'memory';
  resetRateLimiterForTests();
  const req = request('198.51.100.8');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = responseRecorder();
    assert.equal(await enforceRateLimit(req, res, {
      policy: 'mutation', scope: 'contract', identifier: 'reviews:POST'
    }), true);
    assert.equal(res.statusCode, null);
  }
  const blocked = responseRecorder();
  assert.equal(await enforceRateLimit(req, blocked, {
    policy: 'mutation', scope: 'contract', identifier: 'reviews:POST'
  }), false);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');
  assert.match(blocked.headers['retry-after'], /^\d+$/);
  assert.equal(blocked.headers['ratelimit-limit'], '30');
  assert.equal(blocked.headers['ratelimit-remaining'], '0');
  assert.match(blocked.headers['ratelimit-reset'], /^\d+$/);

  process.env.NODE_ENV = 'production';
  delete process.env.MESTO_RATE_LIMIT_PROVIDER;
  resetRateLimiterForTests();
  const unavailable = responseRecorder();
  assert.equal(await enforceRateLimit(request(), unavailable, {
    policy: 'public-detail', scope: 'contract'
  }), false);
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.body, {
    code: 'RATE_LIMIT_UNAVAILABLE',
    message: 'Защита от чрезмерного числа запросов временно недоступна.'
  });
  assert.doesNotMatch(JSON.stringify(unavailable.body), /provider|redis|token|configuration/i);
});
