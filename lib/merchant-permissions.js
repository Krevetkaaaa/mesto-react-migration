const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(['venue', 'menu', 'promotions', 'reviews', 'analytics']),
  manager: Object.freeze(['venue', 'menu', 'promotions', 'reviews', 'analytics']),
  content_editor: Object.freeze(['venue', 'menu', 'promotions']),
  analyst: Object.freeze(['reviews', 'analytics'])
});

function normalizeMembershipRole(value, fallback = '') {
  const role = String(value || '').trim().toLowerCase();
  return Object.hasOwn(ROLE_PERMISSIONS, role) ? role : fallback;
}

function permissionsForRole(value) {
  const role = normalizeMembershipRole(value);
  return role ? [...ROLE_PERMISSIONS[role]] : [];
}

module.exports = { ROLE_PERMISSIONS, normalizeMembershipRole, permissionsForRole };
