const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../api/router');
const { resetTelemetryForTests, safeVercelId } = require('../lib/telemetry');

const originalEnvironment = {
  VERCEL: process.env.VERCEL,
  MESTO_TELEMETRY_LOGS: process.env.MESTO_TELEMETRY_LOGS
};

test.afterEach(() => {
  resetTelemetryForTests();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

test('Vercel API telemetry logs bounded correlation data without request payloads', async (t) => {
  process.env.VERCEL = '1';
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(JSON.parse(line)));
  const res = responseRecorder();

  await router({
    method: 'POST',
    query: { route: 'missing', password: 'must-not-be-logged' },
    headers: {
      cookie: 'must-not-be-logged',
      'x-vercel-id': 'fra1::iad1::request_123'
    },
    body: { token: 'must-not-be-logged' }
  }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map(({ event }) => event), ['api.request.start', 'api.request.complete']);
  assert.equal(lines[0].route, '(unmatched)');
  assert.equal(lines[0].method, 'POST');
  assert.equal(lines[0].coldStart, true);
  assert.equal(lines[0].vercelId, 'fra1::iad1::request_123');
  assert.equal(lines[1].status, 404);
  assert.equal(typeof lines[1].durationMs, 'number');
  assert.doesNotMatch(JSON.stringify(lines), /password|cookie|token|must-not-be-logged/);
});

test('telemetry accepts only bounded provider request ids', () => {
  assert.equal(safeVercelId('fra1::request-1'), 'fra1::request-1');
  assert.equal(safeVercelId('contains a space'), undefined);
  assert.equal(safeVercelId('x'.repeat(161)), undefined);
});
