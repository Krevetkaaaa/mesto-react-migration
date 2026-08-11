const { randomUUID } = require('node:crypto');

const { json, uuid } = require('../lib/http');
const { setSecurityHeaders } = require('../lib/security-headers');
const { beginApiRequest } = require('../lib/telemetry');
const venueBySlug = require('../handlers/venue');
const uploads = require('../handlers/uploads');

const routes = new Map([
  ['venues', require('../handlers/venues')],
  ['venue-sitemap', require('../handlers/venue-sitemap')],
  ['venue-content', require('../handlers/venue-content')],
  ['release-fingerprint', require('../handlers/release-fingerprint')],
  ['submissions', require('../handlers/submissions')],
  ['reviews', require('../handlers/reviews')],
  ['uploads/sign', uploads.sign],
  ['uploads/finalize', uploads.finalize],
  ['uploads/release', uploads.release],
  ['uploads/status', uploads.status],
  ['favorites', require('../handlers/favorites')],
  ['auth/login', require('../handlers/auth/login')],
  ['auth/logout', require('../handlers/auth/logout')],
  ['auth/oauth', require('../handlers/auth/oauth')],
  ['auth/oauth-vk-callback', require('../handlers/auth/oauth-vk-callback')],
  ['auth/oauth-session', require('../handlers/auth/oauth-session')],
  ['auth/password', require('../handlers/auth/password')],
  ['auth/providers', require('../handlers/auth/providers')],
  ['auth/register', require('../handlers/auth/register')],
  ['auth/session', require('../handlers/auth/session')],
  ['auth/yandex/callback', require('../handlers/auth/yandex-callback')],
  ['cron/media-reaper', require('../handlers/cron/media-reaper')],
  ['admin/dashboard', require('../handlers/admin/dashboard')],
  ['admin/login', require('../handlers/admin/login')],
  ['admin/logout', require('../handlers/admin/logout')],
  ['admin/merchants', require('../handlers/admin/merchants')],
  ['admin/reviews', require('../handlers/admin/reviews')],
  ['admin/session', require('../handlers/admin/session')],
  ['admin/submissions', require('../handlers/admin/submissions')],
  ['admin/venues', require('../handlers/admin/venues')],
  ['merchant/dashboard', require('../handlers/merchant/dashboard')],
  ['merchant/menu', require('../handlers/merchant/menu')],
  ['merchant/promotions', require('../handlers/merchant/promotions')],
  ['merchant/venue', require('../handlers/merchant/venue')]
]);

function requestHeader(req, name) {
  const headers = req?.headers || {};
  const value = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function observed(operation, res, telemetry) {
  try {
    const result = await operation();
    telemetry.complete(res.statusCode || 200);
    return result;
  } catch (error) {
    telemetry.fail(error, res.statusCode || 500);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  const requestId = uuid(requestHeader(req, 'x-request-id')) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const value = req.query?.route;
  const key = (Array.isArray(value) ? value.join('/') : String(value || '')).replace(/^\/+|\/+$/g, '');
  const telemetry = beginApiRequest({
    method: req.method,
    requestId,
    route: key.startsWith('venues/')
      ? 'venues/:slug'
      : routes.has(key)
        ? key
        : '(unmatched)',
    vercelId: requestHeader(req, 'x-vercel-id')
  });
  if (!key.startsWith('venues/') && !routes.has(key)) telemetry.complete(404);
  if (key.startsWith('venues/')) {
    req.query = { ...req.query, slug: key.slice('venues/'.length) };
    return observed(() => venueBySlug(req, res), res, telemetry);
  }
  const route = routes.get(key);
  if (!route) return json(res, 404, { message: 'API-маршрут не найден.' });
  return observed(() => route(req, res), res, telemetry);
};
