const { email, text } = require('./http');
const { safeEqual } = require('./oauth-state');

const PROVIDERS = Object.freeze({
  vk: {
    authorizeUrl: 'https://id.vk.ru/authorize',
    tokenUrl: 'https://id.vk.ru/oauth2/auth',
    userInfoUrl: 'https://id.vk.ru/oauth2/user_info',
    // The current VK application has basic profile access. Email requires a
    // separately verified VK application, so the backend safely supports an
    // internal non-deliverable alias instead of requesting an unavailable scope.
    scope: 'vkid.personal_info'
  },
  yandex: {
    authorizeUrl: 'https://oauth.yandex.ru/authorize',
    tokenUrl: 'https://oauth.yandex.ru/token',
    userInfoUrl: 'https://login.yandex.ru/info',
    scope: 'login:info login:email login:avatar'
  }
});

class OAuthProviderError extends Error {
  constructor(code = 'OAUTH_PROVIDER_FAILED', statusCode = 502) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function providerConfiguration(provider) {
  if (provider === 'vk') {
    const clientId = String(process.env.VK_ID_APP_ID || '').trim();
    return {
      configured: Boolean(clientId),
      clientId,
      serviceToken: String(process.env.VK_ID_SERVICE_TOKEN || '').trim()
    };
  }
  if (provider === 'yandex') {
    const clientId = String(process.env.YANDEX_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.YANDEX_OAUTH_CLIENT_SECRET || '').trim();
    return { configured: Boolean(clientId && clientSecret), clientId, clientSecret };
  }
  return { configured: false };
}

function providerAvailable(provider) {
  return Boolean(PROVIDERS[provider] && providerConfiguration(provider).configured);
}

function authorizationUrl(provider, transaction) {
  const definition = PROVIDERS[provider];
  const config = providerConfiguration(provider);
  if (!definition || !config.configured) throw new OAuthProviderError('OAUTH_PROVIDER_NOT_CONFIGURED', 503);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: transaction.callbackUrl,
    state: transaction.state,
    code_challenge: transaction.challenge,
    code_challenge_method: 'S256',
    scope: definition.scope
  });
  return `${definition.authorizeUrl}?${params.toString()}`;
}

async function responseJson(url, options) {
  let response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new OAuthProviderError();
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.error || payload.error_description) throw new OAuthProviderError();
  return payload;
}

async function exchangeVkCode({ code, deviceId, state, verifier, callbackUrl }) {
  const config = providerConfiguration('vk');
  if (!config.configured) throw new OAuthProviderError('OAUTH_PROVIDER_NOT_CONFIGURED', 503);
  if (!deviceId) throw new OAuthProviderError('VK_DEVICE_ID_REQUIRED', 400);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: callbackUrl,
    client_id: config.clientId,
    device_id: deviceId,
    state
  });
  if (config.serviceToken) body.set('service_token', config.serviceToken);
  const token = await responseJson(PROVIDERS.vk.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!token.access_token || typeof token.state !== 'string' || !safeEqual(token.state, state)) {
    throw new OAuthProviderError('OAUTH_PROVIDER_STATE_MISMATCH');
  }
  return token.access_token;
}

async function fetchVkIdentity(accessToken) {
  const config = providerConfiguration('vk');
  const payload = await responseJson(PROVIDERS.vk.userInfoUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, access_token: accessToken })
  });
  const user = payload.user;
  const subject = text(user?.user_id, 200);
  if (!subject) throw new OAuthProviderError();
  return {
    provider: 'vk',
    subject,
    email: email(user.email),
    displayName: text([user.first_name, user.last_name].filter(Boolean).join(' '), 120),
    preferredUsername: `vk-${subject}`,
    avatarUrl: /^https:\/\//i.test(String(user.avatar || '')) ? String(user.avatar) : ''
  };
}

async function exchangeYandexCode({ code, verifier, callbackUrl }) {
  const config = providerConfiguration('yandex');
  if (!config.configured) throw new OAuthProviderError('OAUTH_PROVIDER_NOT_CONFIGURED', 503);
  const token = await responseJson(PROVIDERS.yandex.tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      code_verifier: verifier
    })
  });
  if (!token.access_token) throw new OAuthProviderError();
  return token.access_token;
}

async function fetchYandexIdentity(accessToken) {
  const url = new URL(PROVIDERS.yandex.userInfoUrl);
  url.searchParams.set('format', 'json');
  const user = await responseJson(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `OAuth ${accessToken}` }
  });
  const subject = text(user.id, 200);
  if (!subject) throw new OAuthProviderError();
  const avatarId = text(user.default_avatar_id, 200);
  return {
    provider: 'yandex',
    subject,
    email: email(user.default_email || (Array.isArray(user.emails) ? user.emails[0] : '')),
    displayName: text(user.display_name || user.real_name || user.first_name || user.login, 120),
    preferredUsername: text(user.login, 48) || `yandex-${subject}`,
    avatarUrl: avatarId ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(avatarId)}/islands-200` : ''
  };
}

async function completeProviderIdentity(provider, transaction, callbackParameters) {
  const code = text(callbackParameters.code, 4_000);
  if (!code) throw new OAuthProviderError('OAUTH_CODE_MISSING', 400);
  if (provider === 'vk') {
    const accessToken = await exchangeVkCode({
      code,
      deviceId: text(callbackParameters.deviceId, 1_000),
      state: transaction.state,
      verifier: transaction.verifier,
      callbackUrl: transaction.callbackUrl
    });
    return fetchVkIdentity(accessToken);
  }
  if (provider === 'yandex') {
    const accessToken = await exchangeYandexCode({
      code,
      verifier: transaction.verifier,
      callbackUrl: transaction.callbackUrl
    });
    return fetchYandexIdentity(accessToken);
  }
  throw new OAuthProviderError('OAUTH_PROVIDER_UNSUPPORTED', 400);
}

module.exports = {
  OAuthProviderError,
  authorizationUrl,
  completeProviderIdentity,
  providerAvailable,
  providerConfiguration
};
