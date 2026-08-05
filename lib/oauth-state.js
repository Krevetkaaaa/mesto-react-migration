const crypto = require('node:crypto');
const { parseCookies } = require('./security');

const OAUTH_MAX_AGE_SECONDS = 10 * 60;
const PROVIDER_CALLBACKS = Object.freeze({
  vk: '/api/auth/oauth-vk-callback',
  yandex: '/api/auth/yandex/callback'
});

class OAuthStateError extends Error {
  constructor(code = 'OAUTH_STATE_INVALID') {
    super(code);
    this.code = code;
    this.statusCode = 400;
  }
}

class OAuthConfigurationError extends Error {
  constructor(code = 'OAUTH_NOT_CONFIGURED') {
    super(code);
    this.code = code;
    this.statusCode = 503;
  }
}

function oauthSecret() {
  const secret = String(process.env.MESTO_USER_SESSION_SECRET || '');
  if (secret.length < 32) throw new OAuthConfigurationError('OAUTH_SESSION_SECRET_MISSING');
  return secret;
}

function publicOrigin() {
  const configured = String(process.env.MESTO_PUBLIC_ORIGIN || '').trim();
  if (!configured) throw new OAuthConfigurationError('PUBLIC_ORIGIN_MISSING');
  try {
    const url = new URL(configured);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !localHttp)) {
      throw new Error('Unsupported public origin');
    }
    return url.origin;
  } catch {
    throw new OAuthConfigurationError('PUBLIC_ORIGIN_INVALID');
  }
}

function callbackPath(provider) {
  const path = PROVIDER_CALLBACKS[provider];
  if (!path) throw new OAuthConfigurationError('OAUTH_PROVIDER_UNSUPPORTED');
  return path;
}

function callbackUrl(provider) {
  return `${publicOrigin()}${callbackPath(provider)}`;
}

function strictReturnTarget(value) {
  const candidate = String(value || '/').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\') || /[\u0000-\u001f\u007f]/.test(candidate)) return '/';
  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return '/';
    const parsed = new URL(candidate, 'https://mesto.invalid');
    if (parsed.origin !== 'https://mesto.invalid') return '/';
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return '/';
  }
}

function signatureFor(encoded, secret = oauthSecret()) {
  return crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ''));
  const right = Buffer.from(String(rightValue || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signTransaction(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signatureFor(encoded)}`;
}

function verifyTransaction(token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature || !safeEqual(signature, signatureFor(encoded))) throw new OAuthStateError();
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthStateError();
  }
}

function pkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function cookieName(provider) {
  return `mesto_oauth_${provider}`;
}

function secureCookieAttribute() {
  return new URL(publicOrigin()).protocol === 'https:' ? '; Secure' : '';
}

function oauthCookie(provider, token, maxAge = OAUTH_MAX_AGE_SECONDS) {
  return `${cookieName(provider)}=${encodeURIComponent(token)}; Path=${callbackPath(provider)}; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearOAuthCookie(provider) {
  return oauthCookie(provider, '', 0);
}

function createOAuthTransaction(provider, returnTo = '/', nowMs = Date.now()) {
  callbackPath(provider);
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(64).toString('base64url');
  const issuedAt = Math.floor(nowMs / 1000);
  const payload = {
    provider,
    state,
    verifier,
    returnTo: strictReturnTarget(returnTo),
    iat: issuedAt,
    exp: issuedAt + OAUTH_MAX_AGE_SECONDS
  };
  return {
    state,
    verifier,
    challenge: pkceChallenge(verifier),
    returnTo: payload.returnTo,
    cookie: oauthCookie(provider, signTransaction(payload)),
    callbackUrl: callbackUrl(provider)
  };
}

function readOAuthTransaction(req, provider, presentedState, nowMs = Date.now()) {
  const token = parseCookies(req)[cookieName(provider)];
  const payload = verifyTransaction(token);
  const now = Math.floor(nowMs / 1000);
  if (
    payload.provider !== provider
    || typeof payload.state !== 'string'
    || payload.state.length < 32
    || typeof presentedState !== 'string'
    || !safeEqual(payload.state, presentedState)
    || !Number.isFinite(payload.iat)
    || !Number.isFinite(payload.exp)
    || payload.iat > now + 60
    || payload.exp <= now
    || payload.exp - payload.iat > OAUTH_MAX_AGE_SECONDS
    || typeof payload.verifier !== 'string'
    || payload.verifier.length < 43
  ) {
    throw new OAuthStateError();
  }
  return {
    provider,
    state: payload.state,
    verifier: payload.verifier,
    returnTo: strictReturnTarget(payload.returnTo),
    callbackUrl: callbackUrl(provider)
  };
}

function appendSetCookies(res, cookies) {
  const next = cookies.filter(Boolean);
  const current = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : undefined;
  const existing = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...existing, ...next]);
}

module.exports = {
  OAUTH_MAX_AGE_SECONDS,
  OAuthConfigurationError,
  OAuthStateError,
  appendSetCookies,
  callbackPath,
  callbackUrl,
  clearOAuthCookie,
  createOAuthTransaction,
  pkceChallenge,
  publicOrigin,
  readOAuthTransaction,
  safeEqual,
  strictReturnTarget
};
