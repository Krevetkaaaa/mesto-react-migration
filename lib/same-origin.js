const { json } = require('./http');

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '').trim();
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.origin : '';
  } catch {
    return '';
  }
}

function requestTargetOrigins(req) {
  const origins = new Set();
  const configuredValue = String(process.env.MESTO_PUBLIC_ORIGIN || '').trim();
  if (configuredValue) {
    const configuredOrigin = normalizedOrigin(configuredValue);
    if (configuredOrigin) origins.add(configuredOrigin);
  }
  if (process.env.VERCEL_ENV === 'preview') {
    const deploymentHost = String(process.env.VERCEL_URL || '').trim();
    const deploymentOrigin = normalizedOrigin(deploymentHost ? `https://${deploymentHost}` : '');
    if (deploymentOrigin) origins.add(deploymentOrigin);
  }
  if (origins.size || process.env.VERCEL || process.env.NODE_ENV === 'production') return origins;
  const host = header(req, 'host');
  if (!host) return origins;
  const forwardedProtocol = header(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProtocol || (req?.socket?.encrypted ? 'https' : 'http');
  const requestOrigin = normalizedOrigin(`${protocol}://${host}`);
  if (requestOrigin) origins.add(requestOrigin);
  return origins;
}

function isSameOriginRequest(req) {
  if (!UNSAFE_METHODS.has(String(req?.method || 'GET').toUpperCase())) return true;

  const fetchSite = header(req, 'sec-fetch-site').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const suppliedOrigin = header(req, 'origin');
  if (suppliedOrigin) {
    const origin = normalizedOrigin(suppliedOrigin);
    const targets = requestTargetOrigins(req);
    return Boolean(origin && targets.has(origin));
  }

  return fetchSite === 'same-origin';
}

function requireSameOrigin(req, res) {
  if (isSameOriginRequest(req)) return true;
  json(res, 403, {
    message: 'Запрос отклонён проверкой безопасности. Обновите страницу и повторите действие.',
    code: 'CSRF_CHECK_FAILED'
  });
  return false;
}

module.exports = { isSameOriginRequest, requireSameOrigin };
