const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return address.port;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

test('phase 4 proxy never turns an upstream reset into a successful complete body', async () => {
  const { proxyHttpRequest } = await import('../e2e/support/phase4-proxy.mjs');
  const upstream = createServer((request, response) => {
    if (request.url === '/ok') {
      response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    response.writeHead(200, { 'Content-Length': '100', 'Content-Type': 'text/plain' });
    response.write('partial');
    setImmediate(() => response.socket.destroy());
  });
  const upstreamPort = await listen(upstream);
  const gateway = createServer((request, response) => {
    proxyHttpRequest(request, response, { host: '127.0.0.1', targetPort: upstreamPort });
  });
  const gatewayPort = await listen(gateway);

  try {
    await assert.rejects(async () => {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/reset`);
      await response.text();
    });
    const healthy = await fetch(`http://127.0.0.1:${gatewayPort}/ok`);
    assert.equal(healthy.status, 200);
    assert.equal(await healthy.text(), 'ok');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('phase 4 proxy returns 503 only when the upstream fails before headers', async () => {
  const { proxyHttpRequest } = await import('../e2e/support/phase4-proxy.mjs');
  const upstream = createServer((_request, response) => response.socket.destroy());
  const upstreamPort = await listen(upstream);
  const gateway = createServer((request, response) => {
    proxyHttpRequest(request, response, { host: '127.0.0.1', targetPort: upstreamPort });
  });
  const gatewayPort = await listen(gateway);

  try {
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/reset-before-headers`);
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.match(payload.message, /^Phase 4 upstream is unavailable:/);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('phase 4 proxy cancels upstream work when the downstream client aborts', { timeout: 10_000 }, async () => {
  const { proxyHttpRequest } = await import('../e2e/support/phase4-proxy.mjs');
  let markReceived;
  let markClosed;
  const received = new Promise((resolve) => { markReceived = resolve; });
  const closed = new Promise((resolve) => { markClosed = resolve; });
  const upstream = createServer((_request, response) => {
    markReceived();
    response.once('close', markClosed);
  });
  const upstreamPort = await listen(upstream);
  const gateway = createServer((request, response) => {
    proxyHttpRequest(request, response, { host: '127.0.0.1', targetPort: upstreamPort });
  });
  const gatewayPort = await listen(gateway);
  const controller = new AbortController();

  try {
    const request = fetch(`http://127.0.0.1:${gatewayPort}/slow`, { signal: controller.signal });
    await received;
    controller.abort();
    await assert.rejects(request, { name: 'AbortError' });
    await closed;
  } finally {
    await close(gateway);
    await close(upstream);
  }
});
