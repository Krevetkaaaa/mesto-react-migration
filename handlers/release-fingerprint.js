const { createHash } = require('node:crypto');

const { json, methodNotAllowed } = require('../lib/http');
const { validateReleaseEnvironment } = require('../lib/release-env');

function fingerprint(identity) {
  return createHash('sha256')
    .update(JSON.stringify([
      identity.environment,
      identity.deploymentId,
      identity.projectId,
      identity.deploymentHost,
      identity.redisNamespace,
      identity.redisProvidersFingerprint,
      identity.supabaseProjectRef
    ]))
    .digest('base64url');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const release = validateReleaseEnvironment(process.env, { target: process.env.VERCEL_ENV });
    return json(res, 200, {
      kind: 'mesto.release-provider-identity',
      ...release.providerIdentity,
      fingerprint: fingerprint(release.providerIdentity)
    });
  } catch {
    return json(res, 503, {
      code: 'RELEASE_ENV_INVALID',
      message: 'Release provider identity is unavailable.'
    });
  }
};

module.exports.fingerprint = fingerprint;
