const { timingSafeEqual } = require('node:crypto');

const { json, methodNotAllowed } = require('../../lib/http');
const { createMediaStorage } = require('../../lib/media-storage');
const {
  MEDIA_REAPER_OPERATION_TIMEOUT_MS,
  runMediaReaper
} = require('../../lib/media-reaper');
const { configuration, createStore } = require('../../lib/supabase');

const MINIMUM_CRON_SECRET_LENGTH = 32;

function requestHeader(req, name) {
  const headers = req?.headers || {};
  const direct = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(direct) ? String(direct[0] || '') : String(direct || '');
}

function validSecret(secret) {
  return typeof secret === 'string'
    && secret === secret.trim()
    && secret.length >= MINIMUM_CRON_SECRET_LENGTH;
}

function authorized(req, secret) {
  const match = requestHeader(req, 'authorization').match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(match[1]);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

module.exports = async function mediaReaperHandler(req, res, dependencies = {}) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const env = dependencies.env || process.env;
  const secret = String(env.CRON_SECRET || '');
  if (!validSecret(secret)) {
    return json(res, 503, {
      ok: false,
      code: 'MEDIA_REAPER_NOT_CONFIGURED'
    });
  }
  if (!authorized(req, secret)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return json(res, 401, {
      ok: false,
      code: 'MEDIA_REAPER_UNAUTHORIZED'
    });
  }

  // Authentication is intentionally complete before configuration, database
  // or Storage construction. An invalid caller has no cleanup side effects.
  try {
    const configurationFn = dependencies.configurationFn || configuration;
    const createStoreFn = dependencies.createStoreFn || createStore;
    const createStorageFn = dependencies.createStorageFn || createMediaStorage;
    const runMediaReaperFn = dependencies.runMediaReaperFn || runMediaReaper;
    const config = configurationFn();
    const store = createStoreFn();
    const storage = createStorageFn({
      ...config,
      operationTimeoutMs: MEDIA_REAPER_OPERATION_TIMEOUT_MS
    });
    const summary = await runMediaReaperFn({ store, storage });
    if (!summary || typeof summary !== 'object' || typeof summary.ok !== 'boolean') {
      throw Object.assign(new Error('Invalid media reaper result'), {
        code: 'MEDIA_REAPER_RESULT_INVALID'
      });
    }
    return json(res, summary.ok ? 200 : 503, summary);
  } catch (error) {
    const candidate = String(error?.code || '');
    const code = /^[A-Z][A-Z0-9_]{2,63}$/.test(candidate)
      ? candidate
      : 'MEDIA_REAPER_FAILED';
    return json(res, 503, { ok: false, code });
  }
};

module.exports.MINIMUM_CRON_SECRET_LENGTH = MINIMUM_CRON_SECRET_LENGTH;
module.exports.authorized = authorized;
