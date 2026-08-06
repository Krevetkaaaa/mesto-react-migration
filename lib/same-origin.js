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

function requestTargetOrigin(req) {
  const configuredValue = String(process.env.MESTO_PUBLIC_ORIGIN || '').trim();
  if (configuredValue) return normalizedOrigin(configuredValue);
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return '';
  const host = header(req, 'host');
  if (!host) return '';
  const forwardedProtocol = header(req, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProtocol || (req?.socket?.encrypted ? 'https' : 'http');
  return normalizedOrigin(`${protocol}://${host}`);
}

function isSameOriginRequest(req) {
  if (!UNSAFE_METHODS.has(String(req?.method || 'GET').toUpperCase())) return true;

  const fetchSite = header(req, 'sec-fetch-site').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const suppliedOrigin = header(req, 'origin');
  if (suppliedOrigin) {
    const origin = normalizedOrigin(suppliedOrigin);
    const target = requestTargetOrigin(req);
    return Boolean(origin && target && origin === target);
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
