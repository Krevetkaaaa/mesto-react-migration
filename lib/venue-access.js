const { json } = require('./http');
const { requireUser } = require('./identity');
const { permissionsForRole } = require('./merchant-permissions');
const { createStore } = require('./supabase');

async function merchantWorkspace(req, res) {
  const profile = await requireUser(req, res, ['merchant']);
  if (!profile) return null;
  const store = createStore();
  const memberships = await store.listMemberships(profile.id);
  const venueIds = memberships.map((item) => item.venue_id);
  const venues = await store.venuesByIds(venueIds);
  return { profile, memberships, venueIds, venues, store };
}

function membershipPermissions(membership) {
  return permissionsForRole(membership?.membership_role);
}

function hasPermission(workspace, venueId, permission) {
  const membership = workspace.memberships.find((item) => item.venue_id === String(venueId || ''));
  return Boolean(membership && (!permission || membershipPermissions(membership).includes(permission)));
}

function requireVenue(workspace, res, venueId, permission) {
  const normalizedId = String(venueId || '');
  if (!workspace.venueIds.includes(normalizedId)) {
    json(res, 403, { message: 'Это заведение не назначено вашему аккаунту.', code: 'VENUE_FORBIDDEN' });
    return null;
  }
  const venue = workspace.venues.find((item) => item.id === normalizedId);
  if (!venue) {
    json(res, 404, { message: 'Назначенное заведение больше не существует.', code: 'VENUE_NOT_FOUND' });
    return null;
  }
  if (permission && !hasPermission(workspace, normalizedId, permission)) {
    json(res, 403, { message: 'У аккаунта нет права на это действие.', code: 'PERMISSION_REQUIRED' });
    return null;
  }
  return venue;
}

module.exports = { hasPermission, membershipPermissions, merchantWorkspace, requireVenue };
