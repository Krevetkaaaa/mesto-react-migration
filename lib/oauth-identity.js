const crypto = require('node:crypto');
const { email, text } = require('./http');
const { createManagedUser, normalizeUsername } = require('./identity');
const { authRequest, createStore, request } = require('./supabase');

class OAuthIdentityError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function managedPassword() {
  return `${crypto.randomBytes(36).toString('base64url')}Aa1!`;
}

function internalOAuthAlias(provider, subject) {
  const safeSubject = String(subject || '').trim().toLowerCase();
  const localSubject = /^[a-z0-9][a-z0-9._-]{0,47}$/.test(safeSubject)
    ? safeSubject
    : crypto.createHash('sha256').update(`${provider}:${safeSubject}`).digest('hex').slice(0, 32);
  return `${provider}-${localSubject}@oauth.mesto.invalid`;
}

function providerEmail(identity, provider, subject) {
  const supplied = email(identity?.email);
  if (supplied) return { address: supplied, isInternal: false };
  if (provider === 'vk') return { address: internalOAuthAlias(provider, subject), isInternal: true };
  throw new OAuthIdentityError('OAUTH_EMAIL_REQUIRED', 422);
}

function schemaError(error) {
  return error?.statusCode === 404 || /schema cache|could not find the table|relation .* does not exist|PGRST205/i.test(`${error?.message || ''} ${error?.details?.code || ''}`);
}

async function identityBySubject(provider, subject) {
  try {
    const rows = await request('external_identities', {
      query: {
        select: 'provider,provider_subject,user_id,created_at',
        provider: `eq.${provider}`,
        provider_subject: `eq.${subject}`,
        limit: 1
      }
    });
    return rows?.[0] || null;
  } catch (error) {
    if (schemaError(error)) throw new OAuthIdentityError('OAUTH_IDENTITY_SCHEMA_MISSING', 503);
    throw error;
  }
}

async function saveIdentity(provider, subject, userId) {
  try {
    const rows = await request('external_identities', {
      method: 'POST',
      prefer: 'return=representation',
      body: { provider, provider_subject: subject, user_id: userId }
    });
    return rows?.[0] || null;
  } catch (error) {
    if (schemaError(error)) throw new OAuthIdentityError('OAUTH_IDENTITY_SCHEMA_MISSING', 503);
    throw error;
  }
}

async function uniqueUsername(store, preferred, provider, subject) {
  const base = normalizeUsername(preferred, `${provider}-user`) || `${provider}-user`;
  const occupied = await store.profileByLogin(base);
  if (!occupied) return base;
  const digest = crypto.createHash('sha256').update(`${provider}:${subject}`).digest('hex').slice(0, 10);
  const candidate = `${base.slice(0, Math.max(3, 47 - digest.length))}-${digest}`;
  const collision = await store.profileByLogin(candidate);
  if (!collision) return candidate;
  return `${provider}-${digest}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 48);
}

async function activeMappedProfile(store, mapping) {
  const profile = mapping ? await store.profileById(mapping.user_id) : null;
  if (!profile) throw new OAuthIdentityError('OAUTH_IDENTITY_ORPHANED', 409);
  if (profile.status !== 'active') throw new OAuthIdentityError('OAUTH_ACCOUNT_INACTIVE', 403);
  await store.updateProfile(profile.id, { last_login_at: new Date().toISOString() }).catch(() => null);
  return profile;
}

async function resolveOrCreateOAuthProfile(identity) {
  const provider = text(identity?.provider, 30).toLowerCase();
  const subject = text(identity?.subject, 200);
  if (!['vk', 'yandex'].includes(provider) || !subject) {
    throw new OAuthIdentityError('OAUTH_IDENTITY_INVALID', 400);
  }
  const store = createStore();
  const mapping = await identityBySubject(provider, subject);
  if (mapping) return activeMappedProfile(store, mapping);

  const { address, isInternal } = providerEmail(identity, provider, subject);

  // An unlinked account with the same email is deliberately not merged. The
  // account owner must sign in by its original method before an explicit link.
  const emailConflict = await store.profileByLogin(address);
  if (emailConflict) throw new OAuthIdentityError('OAUTH_EMAIL_CONFLICT', 409);

  const username = await uniqueUsername(store, identity.preferredUsername || address.split('@')[0], provider, subject);
  let profile;
  try {
    profile = await createManagedUser({
      email: address,
      password: managedPassword(),
      displayName: text(identity.displayName, 120) || username,
      username,
      role: 'customer',
      status: 'active',
      emailIsInternal: isInternal
    });
  } catch (error) {
    if (error?.statusCode === 409 || error?.statusCode === 422 || /already|duplicate|unique/i.test(error?.message || '')) {
      throw new OAuthIdentityError('OAUTH_EMAIL_CONFLICT', 409);
    }
    throw error;
  }
  try {
    await saveIdentity(provider, subject, profile.id);
  } catch (error) {
    await authRequest(`admin/users/${profile.id}`, { method: 'DELETE' }).catch(() => null);
    const racedMapping = await identityBySubject(provider, subject).catch(() => null);
    if (racedMapping) return activeMappedProfile(store, racedMapping);
    throw error;
  }
  return profile;
}

module.exports = {
  OAuthIdentityError,
  identityBySubject,
  internalOAuthAlias,
  managedPassword,
  providerEmail,
  resolveOrCreateOAuthProfile
};
