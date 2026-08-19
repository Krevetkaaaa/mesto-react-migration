const { json, readJson } = require('./http');
const { requireSameOrigin } = require('./same-origin');
const { AdminSessionRevocationError, activeAdminSession } = require('./admin-session-revocation');

const POSTGRES_VALIDATION_CODES = new Set(['22P02', '23502', '23503', '23514']);

function setAdminResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
}

async function requireAdmin(req, res) {
  if (!requireSameOrigin(req, res)) return null;
  let session;
  try {
    session = await activeAdminSession(req);
  } catch (error) {
    if (!(error instanceof AdminSessionRevocationError)) throw error;
    json(res, 503, {
      message: 'Проверка административной сессии временно недоступна.',
      code: 'ADMIN_SESSION_UNAVAILABLE'
    });
    return null;
  }
  if (!session) {
    json(res, 401, { message: 'Требуется вход администратора.', code: 'ADMIN_AUTH_REQUIRED' });
    return null;
  }
  return session;
}

function invalidBodyError() {
  return Object.assign(new Error('INVALID_BODY'), { statusCode: 400, code: 'INVALID_BODY' });
}

async function readAdminBody(req, maxBytes) {
  const body = await readJson(req, maxBytes);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalidBodyError();
  let encoded;
  try {
    encoded = JSON.stringify(body);
  } catch {
    throw invalidBodyError();
  }
  if (Buffer.byteLength(encoded) > maxBytes) {
    throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
  return body;
}

function errorStatus(error) {
  const status = Number(error?.statusCode);
  return Number.isInteger(status) ? status : 0;
}

function postgresCode(error) {
  return String(error?.details?.code || '').trim().toUpperCase();
}

function handleApiError(res, error) {
  const status = errorStatus(error);
  const databaseCode = postgresCode(error);

  if (error?.message === 'PAYLOAD_TOO_LARGE') {
    return json(res, 413, { message: 'Запрос слишком большой.', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (error?.message === 'INVALID_JSON') {
    return json(res, 400, { message: 'Запрос содержит некорректный JSON.', code: 'INVALID_JSON' });
  }
  if (error?.code === 'INVALID_BODY') {
    return json(res, 400, { message: 'Тело запроса должно быть JSON-объектом.', code: 'INVALID_BODY' });
  }
  if (status === 409 || databaseCode === '23505') {
    return json(res, 409, { message: 'Данные уже изменились или конфликтуют с существующей записью.', code: 'ADMIN_CONFLICT' });
  }
  if (POSTGRES_VALIDATION_CODES.has(databaseCode) || status === 400 || status === 422) {
    return json(res, 400, { message: 'Проверьте введённые данные.', code: 'ADMIN_VALIDATION_FAILED' });
  }
  if (status === 429) {
    return json(res, 429, { message: 'Слишком много запросов. Повторите позже.', code: 'ADMIN_RATE_LIMITED' });
  }
  if (
    error?.code === 'SUPABASE_NOT_CONFIGURED'
    || status === 401
    || status === 403
    || status === 404
    || status === 408
    || status >= 500
    || error instanceof TypeError
  ) {
    return json(res, 503, { message: 'Сервис администрирования временно недоступен.', code: 'ADMIN_SERVICE_UNAVAILABLE' });
  }
  return json(res, 500, { message: 'Не удалось выполнить административную операцию.', code: 'ADMIN_OPERATION_FAILED' });
}

async function attemptPostCommit(operation) {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  attemptPostCommit,
  handleApiError,
  readAdminBody,
  requireAdmin,
  setAdminResponseHeaders
};
