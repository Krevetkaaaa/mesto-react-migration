const { json, queryValue, text } = require('./http');
const { sessionCookie } = require('./identity');
const { resolveOrCreateOAuthProfile } = require('./oauth-identity');
const { authorizationUrl, completeProviderIdentity, providerAvailable } = require('./oauth-providers');
const {
  appendSetCookies,
  clearOAuthCookie,
  createOAuthTransaction,
  readOAuthTransaction
} = require('./oauth-state');

function redirect(res, target) {
  res.statusCode = 302;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Location', target);
  return res.end();
}

function oauthFailureRedirect(res, provider, error) {
  const knownCodes = new Set([
    'OAUTH_STATE_INVALID',
    'OAUTH_CODE_MISSING',
    'VK_DEVICE_ID_REQUIRED',
    'OAUTH_EMAIL_REQUIRED',
    'OAUTH_EMAIL_CONFLICT',
    'OAUTH_ACCOUNT_INACTIVE',
    'OAUTH_IDENTITY_ORPHANED',
    'OAUTH_IDENTITY_SCHEMA_MISSING',
    'OAUTH_PROVIDER_NOT_CONFIGURED',
    'OAUTH_SESSION_SECRET_MISSING',
    'OAUTH_PROVIDER_DENIED',
    'PUBLIC_ORIGIN_MISSING',
    'PUBLIC_ORIGIN_INVALID'
  ]);
  const code = knownCodes.has(error?.code) ? error.code : 'OAUTH_FAILED';
  const query = new URLSearchParams({ oauthError: code, provider });
  return redirect(res, `/login?${query.toString()}`);
}

function oauthError(res, error) {
  const known = {
    OAUTH_STATE_INVALID: [400, 'Сессия авторизации истекла. Начните вход заново.'],
    OAUTH_CODE_MISSING: [400, 'Провайдер не вернул код авторизации.'],
    VK_DEVICE_ID_REQUIRED: [400, 'VK ID не вернул идентификатор устройства. Начните вход заново.'],
    OAUTH_EMAIL_REQUIRED: [422, 'Провайдер не передал подтверждённую почту. Разрешите доступ к почте и повторите вход.'],
    OAUTH_EMAIL_CONFLICT: [409, 'Аккаунт с этой почтой уже существует. Войдите прежним способом; автоматическое объединение отключено.'],
    OAUTH_ACCOUNT_INACTIVE: [403, 'Аккаунт приостановлен.'],
    OAUTH_IDENTITY_ORPHANED: [409, 'Связанный аккаунт повреждён. Обратитесь в поддержку.'],
    OAUTH_IDENTITY_SCHEMA_MISSING: [503, 'Хранилище внешних аккаунтов ещё не настроено.'],
    OAUTH_PROVIDER_NOT_CONFIGURED: [503, 'Этот способ входа ещё не настроен.'],
    OAUTH_SESSION_SECRET_MISSING: [503, 'Авторизация временно недоступна.'],
    USER_SESSION_SECRET_INVALID: [503, 'Авторизация временно недоступна.'],
    USER_SESSION_SECRET_REUSED: [503, 'Авторизация временно недоступна.'],
    PUBLIC_ORIGIN_MISSING: [503, 'Публичный адрес сервиса не настроен.'],
    PUBLIC_ORIGIN_INVALID: [503, 'Публичный адрес сервиса настроен некорректно.']
  };
  const [status, message] = known[error?.code] || [error?.statusCode === 400 ? 400 : 502, 'Не удалось завершить вход через внешний сервис.'];
  return json(res, status, { message, code: known[error?.code] ? error.code : 'OAUTH_FAILED' });
}

function startExternalOAuth(req, res, provider) {
  try {
    if (!providerAvailable(provider)) {
      return json(res, 503, { message: 'Этот способ входа ещё не настроен.', code: 'OAUTH_PROVIDER_NOT_CONFIGURED' });
    }
    const transaction = createOAuthTransaction(provider, queryValue(req.query?.returnTo, '/'));
    const target = authorizationUrl(provider, transaction);
    appendSetCookies(res, [transaction.cookie]);
    return redirect(res, target);
  } catch (error) {
    return oauthError(res, error);
  }
}

async function finishExternalOAuth(req, res, provider) {
  try {
    appendSetCookies(res, [clearOAuthCookie(provider)]);
    const providerError = text(queryValue(req.query?.error), 100);
    if (providerError) return oauthFailureRedirect(res, provider, Object.assign(new Error('OAUTH_PROVIDER_DENIED'), { code: 'OAUTH_PROVIDER_DENIED', statusCode: 400 }));
    const state = text(queryValue(req.query?.state), 500);
    const transaction = readOAuthTransaction(req, provider, state);
    const providerIdentity = await completeProviderIdentity(provider, transaction, {
      code: queryValue(req.query?.code),
      deviceId: queryValue(req.query?.device_id)
    });
    const profile = await resolveOrCreateOAuthProfile(providerIdentity);
    appendSetCookies(res, [sessionCookie(profile)]);
    return redirect(res, transaction.returnTo);
  } catch (error) {
    return oauthFailureRedirect(res, provider, error);
  }
}

module.exports = {
  finishExternalOAuth,
  oauthError,
  startExternalOAuth
};
