const { performance } = require('node:perf_hooks');

const VERCEL_ID_PATTERN = /^[A-Za-z0-9:._-]{1,160}$/;
let firstInvocation = true;

function telemetryEnabled() {
  return process.env.VERCEL === '1' || process.env.MESTO_TELEMETRY_LOGS === '1';
}

function safeVercelId(value) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === 'string' && VERCEL_ID_PATTERN.test(normalized) ? normalized : undefined;
}

function write(level, details) {
  if (!telemetryEnabled()) return;
  const output = JSON.stringify({ level, ...details });
  if (level === 'error') console.error(output);
  else console.log(output);
}

function beginApiRequest({ method, requestId, route, vercelId }) {
  const startedAt = performance.now();
  const coldStart = firstInvocation;
  firstInvocation = false;
  const providerRequestId = safeVercelId(vercelId);
  const base = {
    requestId,
    route,
    method: String(method || 'GET').toUpperCase(),
    ...(providerRequestId ? { vercelId: providerRequestId } : {})
  };
  write('info', { event: 'api.request.start', coldStart, ...base });

  return {
    complete(status) {
      write('info', {
        event: 'api.request.complete',
        ...base,
        status: Number(status) || 200,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100
      });
    },
    fail(error, status) {
      write('error', {
        event: 'api.request.failed',
        ...base,
        status: Number(status) || 500,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  };
}

function resetTelemetryForTests() {
  firstInvocation = true;
}

module.exports = { beginApiRequest, resetTelemetryForTests, safeVercelId };
