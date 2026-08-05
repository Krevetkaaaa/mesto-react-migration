const test = require('node:test');
const assert = require('node:assert/strict');
const { hasPermission, membershipPermissions, requireVenue } = require('../lib/venue-access');

const venueId = '9aa8f050-486d-4d77-95d9-2dba1d633d07';

test('membership roles expose only their intended permissions', () => {
  assert.deepEqual(membershipPermissions({ membership_role: 'analyst' }), ['reviews', 'analytics']);
  assert.equal(membershipPermissions({ membership_role: 'content_editor' }).includes('menu'), true);
  assert.equal(membershipPermissions({ membership_role: 'content_editor' }).includes('reviews'), false);
  assert.deepEqual(membershipPermissions({ membership_role: 'analyst', permissions: ['venue', 'menu', 'promotions', 'reviews', 'analytics'] }), ['reviews', 'analytics']);
  assert.deepEqual(membershipPermissions({ membership_role: 'unexpected-role' }), []);
});

test('venue access checks assignment, existence and permission', () => {
  const workspace = {
    venueIds: [venueId],
    venues: [{ id: venueId, title: 'Тестовое место' }],
    memberships: [{ venue_id: venueId, membership_role: 'analyst' }]
  };
  assert.equal(hasPermission(workspace, venueId, 'reviews'), true);
  assert.equal(hasPermission(workspace, venueId, 'menu'), false);

  const responses = [];
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return body; } };
  assert.equal(requireVenue(workspace, res, venueId, 'menu'), null);
  assert.equal(responses.at(-1).code, 403);
  assert.equal(requireVenue(workspace, res, venueId, 'reviews').title, 'Тестовое место');
});
