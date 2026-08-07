const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../scripts/phase11-load.mjs');
}

test('load target is unconditionally loopback-only', async () => {
  const { validateLoadTarget } = await loadModule();
  assert.equal(validateLoadTarget('http://127.0.0.1:4174'), 'http://127.0.0.1:4174');
  assert.throws(() => validateLoadTarget('https://example.com'), /remote load is intentionally unsupported/);
  assert.throws(() => validateLoadTarget('http://user:secret@127.0.0.1:4174'), /credentials/);
  assert.throws(() => validateLoadTarget('http://127.0.0.1:4174/path'), /origin without path/);
});

test('load summary exposes required latency, status, throughput and cache metrics', async () => {
  const { summarizeLoadMetrics } = await loadModule();
  const summary = summarizeLoadMetrics({
    requests: 5,
    latencies: [10, 20, 30, 40, 50],
    responseBytes: 1234,
    statuses: { 200: 3, 429: 1, 503: 1 },
    transportErrors: 0,
    unexpectedStatuses: 2,
    abortedReason: null,
    cache: { hit: 1, miss: 2, unreported: 2 },
    byLabel: {
      catalog: {
        requests: 5,
        successes: 3,
        transportErrors: 0,
        statuses: { 200: 3, 429: 1, 503: 1 },
        latencies: [10, 20, 30, 40, 50],
      },
    },
  }, 1000);
  assert.deepEqual(summary.latencyMs, { p50: 30, p95: 50, p99: 50 });
  assert.equal(summary.attemptedThroughputRps, 5);
  assert.equal(summary.successfulThroughputRps, 3);
  assert.equal(summary.status4xx, 1);
  assert.equal(summary.status429, 1);
  assert.equal(summary.status5xx, 1);
  assert.deepEqual(summary.cache, { hit: 1, miss: 2, unreported: 2 });
});

test('predeclared local SLO rejects latency, errors and insufficient throughput', async () => {
  const { evaluateLocalSlo, LOAD_STAGES } = await loadModule();
  const result = evaluateLocalSlo({
    latencyMs: { p50: 10, p95: 1200, p99: 2600 },
    successfulThroughputRps: 1,
    status5xx: 1,
    transportErrors: 1,
    unexpectedStatuses: 2,
  }, LOAD_STAGES.smoke, 'public-read');
  assert.equal(result.passed, false);
  assert.equal(result.failures.length, 6);
});
