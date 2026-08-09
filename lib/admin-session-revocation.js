const crypto = require('node:crypto');

const {
  ADMIN_SESSION_MAX_AGE,
  SESSION_COOKIE,
  parseCookies,
  validateAdminSessionSecret,
  verifySession
} = require('./security');

const KEY_PREFIX = 'mesto:admin-session-revocation:';
const PROVIDER_TIMEOUT_MS = 2_500;

class AdminSessionRevocationError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'AdminSessionRevocationError';
    this.code = code;
    this.statusCode = 503;
  }
}

function sessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || '';
}

function verifiedSession(req) {
  try {
    const token = sessionToken(req);
    if (!token) return null;
    const secret = validateAdminSessionSecret(process.env.MESTO_ADMIN_SESSION_SECRET);
    const session = verifySession(token, secret);
    return session ? { session, token } : null;
  } catch {
    return null;
  }
}

function sessionKey({ session, token }) {
  const identifier = session.jti ? `jti:${session.jti}` : `token:${token}`;
  const digest = crypto.createHash('sha256').update(identifier).digest('base64url');
  return `${KEY_PREFIX}${digest}`;
}

function remainingSeconds(session, now = Date.now) {
  return Math.max(1, Math.min(ADMIN_SESSION_MAX_AGE, session.exp - Math.floor(now() / 1000)));
}

function createMemoryAdminSessionRevocationAdapter({ now = Date.now } = {}) {
  const revoked = new Map();
  return {
    kind: 'memory',
    async isRevoked({ key }) {
      const expiresAt = revoked.get(key);
      if (!expiresAt) return false;
      if (expiresAt <= now()) {
        revoked.delete(key);
        return false;
      }
      return true;
    },
    async revoke({ key, ttlSeconds }) {
      revoked.set(key, now() + ttlSeconds * 1_000);
    },
    reset() {
      revoked.clear();
    }
  };
}

function validateRedisConfiguration({ url, token }) {
  let endpoint;
  try {
    endpoint = new URL(String(url || ''));
  } catch {
    throw new AdminSessionRevocationError(
      'ADMIN_SESSION_CONFIGURATION_ERROR',
      'Admin session revocation URL is invalid'
    );
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new AdminSessionRevocationError(
      'ADMIN_SESSION_CONFIGURATION_ERROR',
      'Admin session revocation URL must be a credential-free HTTPS origin'
    );
  }
  if (!String(token || '').trim()) {
    throw new AdminSessionRevocationError(
      'ADMIN_SESSION_CONFIGURATION_ERROR',
      'Admin session revocation token is missing'
    );
  }
  return { endpoint: endpoint.toString().replace(/\/$/, ''), token: String(token).trim() };
}

function createUpstashRedisAdminSessionRevocationAdapter({ url, token, fetchImpl = global.fetch } = {}) {
  const config = validateRedisConfiguration({ url, token });
  if (typeof fetchImpl !== 'function') {
    throw new AdminSessionRevocationError(
      'ADMIN_SESSION_CONFIGURATION_ERROR',
      'Admin session revocation transport is unavailable'
    );
  }

  async function command(arguments_) {
    let response;
    try {
      response = await fetchImpl(config.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(arguments_),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
      });
    } catch (error) {
      throw new AdminSessionRevocationError(
        'ADMIN_SESSION_PROVIDER_UNAVAILABLE',
        'Admin session revocation provider is unavailable',
        error
      );
    }
    if (!response.ok) {
      throw new AdminSessionRevocationError(
        'ADMIN_SESSION_PROVIDER_UNAVAILABLE',
        'Admin session revocation provider rejected the request'
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AdminSessionRevocationError(
        'ADMIN_SESSION_PROVIDER_INVALID_RESPONSE',
        'Admin session revocation provider returned invalid JSON',
        error
      );
    }
    if (!payload || !Object.hasOwn(payload, 'result')) {
      throw new AdminSessionRevocationError(
        'ADMIN_SESSION_PROVIDER_INVALID_RESPONSE',
        'Admin session revocation provider returned an invalid response'
      );
    }
    return payload.result;
  }

  return {
    kind: 'upstash-redis',
    async isRevoked({ key }) {
      const result = Number(await command(['EXISTS', key]));
      if (result !== 0 && result !== 1) {
        throw new AdminSessionRevocationError(
          'ADMIN_SESSION_PROVIDER_INVALID_RESPONSE',
          'Admin session revocation provider returned an invalid decision'
        );
      }
      return result === 1;
    },
    async revoke({ key, ttlSeconds }) {
      const result = await command(['SET', key, '1', 'EX', String(ttlSeconds)]);
      if (result !== 'OK') {
        throw new AdminSessionRevocationError(
          'ADMIN_SESSION_PROVIDER_INVALID_RESPONSE',
          'Admin session revocation provider did not persist the revocation'
        );
      }
    }
  };
}

function configuration(environment = process.env) {
  const production = environment.NODE_ENV === 'production' || environment.VERCEL_ENV === 'production';
  const provider = String(
    environment.MESTO_ADMIN_SESSION_REVOCATION_PROVIDER
    || environment.MESTO_RATE_LIMIT_PROVIDER
    || (production ? '' : 'memory')
  ).trim().toLowerCase();

  if (provider === 'memory') {
    if (production) {
      throw new AdminSessionRevocationError(
        'ADMIN_SESSION_CONFIGURATION_ERROR',
        'Memory admin session revocation is not allowed in production'
      );
    }
    return { provider };
  }
  if (provider === 'upstash-redis') {
    const validated = validateRedisConfiguration({
      url: environment.MESTO_ADMIN_SESSION_REDIS_URL || environment.MESTO_RATE_LIMIT_REDIS_URL,
      token: environment.MESTO_ADMIN_SESSION_REDIS_TOKEN || environment.MESTO_RATE_LIMIT_REDIS_TOKEN
    });
    return { provider, ...validated };
  }
  throw new AdminSessionRevocationError(
    'ADMIN_SESSION_CONFIGURATION_ERROR',
    production
      ? 'Shared admin session revocation is not configured for production'
      : 'MESTO_ADMIN_SESSION_REVOCATION_PROVIDER must be memory or upstash-redis'
  );
}

let configuredAdapter;
let configuredSignature;

function getConfiguredAdapter(environment = process.env) {
  const config = configuration(environment);
  const signature = JSON.stringify({
    provider: config.provider,
    endpoint: config.endpoint || '',
    tokenHash: config.token ? crypto.createHash('sha256').update(config.token).digest('base64url') : ''
  });
  if (configuredAdapter && configuredSignature === signature) return configuredAdapter;
  configuredAdapter = config.provider === 'memory'
    ? createMemoryAdminSessionRevocationAdapter()
    : createUpstashRedisAdminSessionRevocationAdapter({
      url: config.endpoint,
      token: environment.MESTO_ADMIN_SESSION_REDIS_TOKEN || environment.MESTO_RATE_LIMIT_REDIS_TOKEN
    });
  configuredSignature = signature;
  return configuredAdapter;
}

async function activeAdminSession(req, adapter) {
  const verified = verifiedSession(req);
  if (!verified) return null;
  const selectedAdapter = adapter || getConfiguredAdapter();
  const revoked = await selectedAdapter.isRevoked({
    key: sessionKey(verified),
    session: verified.session
  });
  return revoked ? null : verified.session;
}

async function verifyIssuedSessionCookie(cookie, adapter) {
  const session = await activeAdminSession({ headers: { cookie } }, adapter);
  if (!session) {
    throw new AdminSessionRevocationError(
      'ADMIN_SESSION_PROVIDER_INVALID_RESPONSE',
      'New admin session could not be verified'
    );
  }
  return session;
}

async function revokeAdminSession(req, adapter) {
  const verified = verifiedSession(req);
  if (!verified) return null;
  const selectedAdapter = adapter || getConfiguredAdapter();
  await selectedAdapter.revoke({
    key: sessionKey(verified),
    session: verified.session,
    ttlSeconds: remainingSeconds(verified.session)
  });
  return verified.session;
}

function resetAdminSessionRevocationForTests() {
  configuredAdapter = undefined;
  configuredSignature = undefined;
}

module.exports = {
  AdminSessionRevocationError,
  activeAdminSession,
  configuration,
  createMemoryAdminSessionRevocationAdapter,
  createUpstashRedisAdminSessionRevocationAdapter,
  resetAdminSessionRevocationForTests,
  revokeAdminSession,
  validateRedisConfiguration,
  verifyIssuedSessionCookie
};
