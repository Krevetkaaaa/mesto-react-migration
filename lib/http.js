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

function bodyError(code, statusCode) {
  return Object.assign(new Error(code), { statusCode });
}

function declaredContentLength(req) {
  const headers = req?.headers || {};
  let value = headers['content-length'];
  if (value === undefined) {
    const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-length');
    value = entry?.[1];
  }
  if (value === undefined || value === null || value === '') return { present: false, value: 0 };
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : value.join(',');

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return { invalid: true, present: true, value: 0 };
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return { invalid: true, present: true, value: 0 };
  return { invalid: false, present: true, value: parsed };
}

function rawBuffer(value) {
  if (typeof value === 'string') return Buffer.from(value);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function validateAuthoritativeLength(actualBytes, contentLength, maxBytes) {
  // Actual received bytes are authoritative: a forged small header must not
  // make an oversized request acceptable.
  if (actualBytes > maxBytes) throw bodyError('PAYLOAD_TOO_LARGE', 413);
  if (contentLength.invalid) throw bodyError('INVALID_CONTENT_LENGTH', 400);
  if (contentLength.present && contentLength.value !== actualBytes) {
    throw bodyError('CONTENT_LENGTH_MISMATCH', 400);
  }
}

function parseRawJson(buffer) {
  if (buffer.length === 0) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw bodyError('INVALID_JSON', 400);
  }
}

function discardRemainingStream(req) {
  if (typeof req.resume !== 'function' || req.destroyed) return;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned || typeof req.removeListener !== 'function') return;
    cleaned = true;
    req.removeListener('end', cleanup);
    req.removeListener('close', cleanup);
    req.removeListener('error', cleanup);
  };
  req.once('end', cleanup);
  req.once('close', cleanup);
  req.once('error', cleanup);
  req.resume();
}

function readJsonStream(req, maxBytes, contentLength) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      if (typeof req.removeListener !== 'function') return;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
    };
    const rejectOnce = (error, discard = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (discard) discardRemainingStream(req);
      reject(error);
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    function onData(chunk) {
      if (settled) return;
      let bytes;
      try {
        bytes = rawBuffer(chunk) || Buffer.from(String(chunk));
      } catch {
        rejectOnce(bodyError('INVALID_BODY_CHUNK', 400), true);
        return;
      }
      totalBytes += bytes.length;
      if (totalBytes > maxBytes) {
        rejectOnce(bodyError('PAYLOAD_TOO_LARGE', 413), true);
        return;
      }
      chunks.push(bytes);
    }
    function onEnd() {
      if (settled) return;
      try {
        validateAuthoritativeLength(totalBytes, contentLength, maxBytes);
        resolveOnce(parseRawJson(Buffer.concat(chunks, totalBytes)));
      } catch (error) {
        rejectOnce(error);
      }
    }
    function onError(error) {
      rejectOnce(error);
    }
    function onAborted() {
      rejectOnce(bodyError('REQUEST_ABORTED', 400));
    }

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAborted);
  });
}

function readJson(req, maxBytes = 1_000_000) {
  const contentLength = declaredContentLength(req);
  const raw = rawBuffer(req?.rawBody);
  if (raw) {
    try {
      validateAuthoritativeLength(raw.length, contentLength, maxBytes);
      return Promise.resolve(parseRawJson(raw));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // @vercel/node exposes req.body through a lazy own getter. Reading it first
  // discards the only trustworthy size evidence; its restored stream still
  // contains the original request bytes.
  const bodyDescriptor = Object.getOwnPropertyDescriptor(req, 'body');
  if (bodyDescriptor?.get && typeof req.on === 'function') {
    return readJsonStream(req, maxBytes, contentLength);
  }

  const body = bodyDescriptor && Object.prototype.hasOwnProperty.call(bodyDescriptor, 'value')
    ? bodyDescriptor.value
    : undefined;
  const bodyBytes = rawBuffer(body);
  if (bodyBytes) {
    try {
      validateAuthoritativeLength(bodyBytes.length, contentLength, maxBytes);
      return Promise.resolve(parseRawJson(bodyBytes));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  if (body === undefined && typeof req.on === 'function') {
    return readJsonStream(req, maxBytes, contentLength);
  }

  // Some runtimes only expose an already parsed value. The original byte
  // count cannot be reconstructed, so use both the declaration and serialized
  // representation as conservative upper bounds without claiming a mismatch.
  if (contentLength.invalid) return Promise.reject(bodyError('INVALID_CONTENT_LENGTH', 400));
  if (contentLength.present && contentLength.value > maxBytes) {
    return Promise.reject(bodyError('PAYLOAD_TOO_LARGE', 413));
  }
  if (body === undefined) return Promise.resolve({});
  try {
    const serialized = JSON.stringify(body);
    if (typeof serialized !== 'string') throw bodyError('INVALID_JSON', 400);
    if (Buffer.byteLength(serialized) > maxBytes) throw bodyError('PAYLOAD_TOO_LARGE', 413);
    return Promise.resolve(body);
  } catch (error) {
    return Promise.reject(error?.statusCode ? error : bodyError('INVALID_JSON', 400));
  }
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
