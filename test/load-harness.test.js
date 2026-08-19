const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  return import('../scripts/phase11-load.mjs');
}

test('load target is unconditionally loopback-only', async () => {
  const { validateLoadTarget } = await loadModule();
  assert.equal(validateLoadTarget('http://127.0.0.1:4174'), 'http://127.0.0.1:4174');
  assert.equal(validateLoadTarget('http://[::1]:4174'), 'http://[::1]:4174');
  assert.throws(() => validateLoadTarget('http://localhost:4174'), /loopback IP literal/);
  assert.throws(() => validateLoadTarget('https://example.com'), /remote load is intentionally unsupported/);
  assert.throws(() => validateLoadTarget('http://user:secret@127.0.0.1:4174'), /credentials/);
  assert.throws(() => validateLoadTarget('http://127.0.0.1:4174/path'), /origin without path/);
});

test('load fetches never follow redirects away from the verified origin', async (t) => {
  const { fetchWithoutRedirect } = await loadModule();
  let sinkHits = 0;
  const sink = createServer((_request, response) => {
    sinkHits += 1;
    response.writeHead(200).end('external sink must remain untouched');
  });
  await new Promise((resolve, reject) => {
    sink.once('error', reject);
    sink.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => sink.close(resolve)));
  const sinkAddress = sink.address();
  assert.equal(typeof sinkAddress, 'object');

  const redirector = createServer((_request, response) => {
    response.writeHead(307, { Location: `http://127.0.0.1:${sinkAddress.port}/production-like-target` });
    response.end('local redirect body');
  });
  await new Promise((resolve, reject) => {
    redirector.once('error', reject);
    redirector.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => redirector.close(resolve)));
  const redirectAddress = redirector.address();
  assert.equal(typeof redirectAddress, 'object');

  const response = await fetchWithoutRedirect(
    `http://127.0.0.1:${redirectAddress.port}/redirect`,
    { redirect: 'follow' },
  );
  const body = await response.text();

  assert.equal(response.status, 307);
  assert.equal(response.redirected, false);
  assert.equal(body, 'local redirect body');
  assert.equal(sinkHits, 0);
});

test('workspace load lock is exclusive and reusable after release', async () => {
  const { acquireWorkspaceLock } = await import('../scripts/phase11-workspace-lock.mjs');
  const projectKey = `${process.cwd()}-lock-contract-${process.pid}`;
  const first = await acquireWorkspaceLock(projectKey);

  await assert.rejects(
    () => acquireWorkspaceLock(projectKey),
    /Another Phase 11 load run owns this workspace/,
  );

  await first.release();
  const second = await acquireWorkspaceLock(projectKey);
  await second.release();
});

test('workspace load lock is released by the OS after owner termination', { timeout: 10_000 }, async (t) => {
  const { acquireWorkspaceLock } = await import('../scripts/phase11-workspace-lock.mjs');
  const moduleUrl = pathToFileURL(resolve(__dirname, '../scripts/phase11-workspace-lock.mjs')).href;
  const projectKey = `${process.cwd()}-lock-crash-contract-${process.pid}`;
  const source = [
    `import { acquireWorkspaceLock } from ${JSON.stringify(moduleUrl)};`,
    `await acquireWorkspaceLock(${JSON.stringify(projectKey)});`,
    'process.send("ready");',
    'setInterval(() => {}, 1000);',
  ].join('\n');
  const owner = spawn(process.execPath, ['--input-type=module', '--eval', source], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });
  t.after(() => {
    if (owner.exitCode === null) owner.kill('SIGKILL');
  });
  const ownerError = [];
  owner.stderr.on('data', (chunk) => ownerError.push(String(chunk)));
  await Promise.race([
    once(owner, 'message'),
    once(owner, 'exit').then(() => {
      throw new Error(`Lock owner exited before readiness: ${ownerError.join('')}`);
    }),
  ]);

  await assert.rejects(
    () => acquireWorkspaceLock(projectKey),
    /Another Phase 11 load run owns this workspace/,
  );
  const ownerExit = once(owner, 'exit');
  owner.kill('SIGKILL');
  await ownerExit;

  const replacement = await acquireWorkspaceLock(projectKey);
  await replacement.release();
});

test('runner options fail closed on missing, duplicate, and unknown values', async () => {
  const { parseRunMatrix } = await import('../scripts/phase11-runner-contract.mjs');

  assert.deepEqual(parseRunMatrix([]).at(-1), ['baseline', 'mixed']);
  assert.deepEqual(
    parseRunMatrix(['--scenario', 'mixed', '--stage', 'expected']),
    [['expected', 'mixed']],
  );
  assert.throws(() => parseRunMatrix(['--stage', 'expected', '--scenario']), /require a value/);
  assert.throws(() => parseRunMatrix(['--stage', 'expected']), /supplied together/);
  assert.throws(
    () => parseRunMatrix(['--stage', 'expected', '--stage', 'baseline', '--scenario', 'mixed']),
    /Duplicate/,
  );
  assert.throws(() => parseRunMatrix(['--target', 'production']), /Unknown Phase 11 runner option/);
  assert.throws(() => parseRunMatrix(['--stage', 'unbounded', '--scenario', 'mixed']), /Unknown load stage/);
});

test('standalone load options fail closed instead of silently using defaults', async () => {
  const { parseLoadArguments } = await loadModule();

  assert.deepEqual(parseLoadArguments([]), {
    baseUrl: 'http://127.0.0.1:4174',
    scenario: 'public-read',
    stageName: 'smoke',
  });
  assert.deepEqual(
    parseLoadArguments([
      '--base-url', 'http://127.0.0.1:4999',
      '--stage', 'expected',
      '--scenario', 'mixed',
    ]),
    { baseUrl: 'http://127.0.0.1:4999', scenario: 'mixed', stageName: 'expected' },
  );
  assert.throws(() => parseLoadArguments(['--base-url']), /require a value/);
  assert.throws(() => parseLoadArguments(['--stage', 'expected']), /supplied together/);
  assert.throws(() => parseLoadArguments(['--scenario', 'mixed']), /supplied together/);
  assert.throws(() => parseLoadArguments(['--unknown', 'value']), /Unknown Phase 11 load option/);
  assert.throws(
    () => parseLoadArguments(['--base-url', 'http://127.0.0.1:1', '--base-url', 'http://127.0.0.1:2']),
    /Duplicate/,
  );
});

test('bounded latency reservoir remains deterministic beyond its capacity', async () => {
  const { addReservoirSample } = await loadModule();
  const reservoir = { latencies: [], sampleSeed: 0x6d657374 };
  for (let value = 1; value <= 10; value += 1) {
    addReservoirSample(reservoir, value, value, 3);
  }

  assert.equal(reservoir.latencies.length, 3);
  assert.deepEqual(reservoir.latencies, [7, 2, 3]);
  assert.equal(reservoir.sampleSeed, 0xd0db2cf1);
});

test('only private IPC PIDs can authorize Phase 11 child cleanup', async () => {
  const {
    healthMatchesOwnedChildPids,
    ownedChildPidsFromMessage,
    responseMatchesOwnedChildPids,
  } = await import('../scripts/phase11-runner-contract.mjs');

  assert.equal(ownedChildPidsFromMessage({ type: 'unrelated', reactPid: 11, legacyPid: 12 }), null);
  for (const invalidPid of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => ownedChildPidsFromMessage({ type: 'phase4-owned-children', reactPid: invalidPid, legacyPid: 12 }),
      /invalid React child PID/,
    );
  }
  const owned = ownedChildPidsFromMessage({ type: 'phase4-owned-children', reactPid: 11, legacyPid: 12 });
  assert.deepEqual(owned, [11, 12]);
  assert.equal(healthMatchesOwnedChildPids({ ok: true, reactPid: 11, legacyPid: 12 }, owned), true);
  assert.equal(healthMatchesOwnedChildPids({ ok: true, reactPid: 999, legacyPid: 12 }, owned), false);
  assert.equal(healthMatchesOwnedChildPids({ ok: true, reactPid: -1, legacyPid: 0 }, owned), false);

  const unavailable = new Response(JSON.stringify({ ok: false }), {
    headers: { 'Content-Type': 'application/json' },
    status: 503,
  });
  assert.equal(await responseMatchesOwnedChildPids(unavailable, owned), false);
  assert.equal(unavailable.bodyUsed, true);
});

test('React child stdout is never connected to an unread pipe', async () => {
  const { childProcessHasExited, PHASE4_CHILD_STDIO } = await import('../e2e/support/phase4-process-contract.mjs');
  assert.deepEqual(PHASE4_CHILD_STDIO, ['ignore', 'ignore', 'pipe']);
  assert.equal(childProcessHasExited({ exitCode: null, signalCode: null }), false);
  assert.equal(childProcessHasExited({ exitCode: 0, signalCode: null }), true);
  assert.equal(childProcessHasExited({ exitCode: null, signalCode: 'SIGTERM' }), true);
});

test('runner requests gateway-owned cleanup and receives its acknowledgement', { timeout: 10_000 }, async () => {
  const { stopOwnedGateway } = await import('../scripts/phase11-runner-contract.mjs');
  const source = [
    'const keepAlive = setInterval(() => {}, 1000);',
    'process.on("message", (message) => {',
    '  if (message?.type !== "phase4-shutdown") return;',
    '  clearInterval(keepAlive);',
    '  process.send({ type: "phase4-stopped" }, () => process.disconnect());',
    '});',
  ].join('\n');
  const gateway = spawn(process.execPath, ['--eval', source], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    windowsHide: true,
  });
  const outcome = await stopOwnedGateway(gateway, { gracefulTimeoutMs: 2_000, signalTimeoutMs: 500 });

  assert.deepEqual(outcome, { acknowledged: true, forced: false, wasRunning: true });
  assert.equal(gateway.exitCode, 0);
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
