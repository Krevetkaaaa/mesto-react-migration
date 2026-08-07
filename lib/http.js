const { createHash } = require('node:crypto');

const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=120';

function json(res, status, payload, headers = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
  const explicitCachePolicy = Object.keys(headers).some((name) => name.toLowerCase() === 'cache-control');
  const existingCachePolicy = typeof res.getHeader === 'function' ? res.getHeader('Cache-Control') : null;
  if (!explicitCachePolicy && !existingCachePolicy) res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.status(status).json(payload);
}

function entityTag(payload) {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('base64url').slice(0, 32);
  return `W/"${digest}"`;
}

function requestHeader(req, name) {
  const headers = req?.headers || {};
  const direct = headers[String(name).toLowerCase()] ?? headers[name];
  return Array.isArray(direct) ? direct.join(',') : String(direct || '');
}

function matchesEntityTag(value, currentTag) {
  const normalizedCurrent = currentTag.replace(/^W\//, '');
  return String(value || '').split(',').some((candidate) => {
    const normalized = candidate.trim();
    return normalized === '*' || normalized.replace(/^W\//, '') === normalizedCurrent;
  });
}

function publicJson(req, res, payload, headers = {}) {
  const tag = entityTag(payload);
  const responseHeaders = {
    'Cache-Control': PUBLIC_CACHE_CONTROL,
    ETag: tag,
    ...headers
  };

  if (matchesEntityTag(requestHeader(req, 'if-none-match'), tag)) {
    Object.entries(responseHeaders).forEach(([name, value]) => res.setHeader(name, value));
    return res.status(304).end();
  }
  return json(res, 200, payload, responseHeaders);
}

function methodNotAllowed(res, methods) {
  res.setHeader('Allow', methods.join(', '));
  return json(res, 405, { message: 'Метод не поддерживается.' });
}

function readJson(req, maxBytes = 1_000_000) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('INVALID_JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function text(value, max = 300, fallback = '') {
  return String(value ?? fallback)
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function email(value) {
  const cleaned = text(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : '';
}

function boolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function queryValue(value, fallback = '') {
  return Array.isArray(value) ? value[0] ?? fallback : value ?? fallback;
}

function uuid(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized) ? normalized : '';
}

module.exports = {
  PUBLIC_CACHE_CONTROL,
  boolean,
  email,
  entityTag,
  json,
  methodNotAllowed,
  publicJson,
  queryValue,
  readJson,
  text,
  uuid
};
