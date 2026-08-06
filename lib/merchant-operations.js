const { json } = require('./http');

const POSTGRES_VALIDATION_CODES = new Set(['22P02', '23502', '23503', '23514']);

function setMerchantResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
}

function errorStatus(error) {
  const status = Number(error?.statusCode);
  return Number.isInteger(status) ? status : 0;
}

function postgresCode(error) {
  return String(error?.details?.code || '').trim().toUpperCase();
}

function classifyMerchantError(error) {
  if (error?.message === 'PAYLOAD_TOO_LARGE') return 'payload-too-large';
  if (error?.message === 'INVALID_JSON') return 'invalid-json';

  const status = errorStatus(error);
  const databaseCode = postgresCode(error);
  if (status === 409 || databaseCode === '23505') return 'conflict';
  if (POSTGRES_VALIDATION_CODES.has(databaseCode)) return 'validation';
  if (
    error?.code === 'SUPABASE_NOT_CONFIGURED'
    || status === 401
    || status === 403
    || status === 404
    || status === 408
    || status === 429
    || status >= 500
    || error instanceof TypeError
  ) return 'unavailable';
  return 'unknown';
}

function merchantHandlerError(res, error, fallbackMessage) {
  switch (classifyMerchantError(error)) {
    case 'payload-too-large':
      return json(res, 413, { message: 'Запрос слишком большой.', code: 'PAYLOAD_TOO_LARGE' });
    case 'invalid-json':
      return json(res, 400, { message: 'Запрос содержит некорректный JSON.', code: 'INVALID_JSON' });
    case 'validation':
      return json(res, 400, { message: 'Проверьте введённые данные.', code: 'MERCHANT_VALIDATION_FAILED' });
    case 'conflict':
      return json(res, 409, { message: 'Данные уже изменились. Обновите страницу и повторите действие.', code: 'MERCHANT_CONFLICT' });
    case 'unavailable':
      return json(res, 503, { message: 'Сервис кабинета временно недоступен.', code: 'MERCHANT_SERVICE_UNAVAILABLE' });
    default:
      return json(res, 500, { message: fallbackMessage, code: 'MERCHANT_OPERATION_FAILED' });
  }
}

async function attemptPostCommit(operation) {
  try {
    await operation();
    return true;
  } catch {
    return false;
  }
}

module.exports = { attemptPostCommit, classifyMerchantError, merchantHandlerError, setMerchantResponseHeaders };
