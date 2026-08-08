const { randomUUID } = require('node:crypto');

const { json, uuid } = require('../lib/http');
const { setSecurityHeaders } = require('../lib/security-headers');
const venueBySlug = require('../handlers/venue');

const routes = new Map([
  ['venues', require('../handlers/venues')],
  ['venue-sitemap', require('../handlers/venue-sitemap')],
  ['venue-content', require('../handlers/venue-content')],
  ['submissions', require('../handlers/submissions')],
  ['reviews', require('../handlers/reviews')],
  ['uploads', require('../handlers/uploads')],
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

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  const requestId = uuid(requestHeader(req, 'x-request-id')) || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  const value = req.query?.route;
  const key = (Array.isArray(value) ? value.join('/') : String(value || '')).replace(/^\/+|\/+$/g, '');
  if (key.startsWith('venues/')) {
    req.query = { ...req.query, slug: key.slice('venues/'.length) };
    return venueBySlug(req, res);
  }
  const route = routes.get(key);
  if (!route) return json(res, 404, { message: 'API-маршрут не найден.' });
  return route(req, res);
};
