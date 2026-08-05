const { json, methodNotAllowed } = require('../../lib/http');
const { publicUser } = require('../../lib/identity');
const { request } = require('../../lib/supabase');
const { merchantWorkspace } = require('../../lib/venue-access');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
    const [menu, promotions, reviews] = await Promise.all([
      workspace.store.menuForVenues(workspace.venueIds, workspace.profile.id),
      workspace.store.promotionsForVenues(workspace.venueIds, workspace.profile.id),
      workspace.venueIds.length ? request('reviews', { query: { select: '*', venue_id: `in.(${workspace.venueIds.join(',')})`, order: 'created_at.desc', limit: 300 } }) : []
    ]);
    return json(res, 200, {
      user: publicUser(workspace.profile),
      venues: workspace.venues,
      memberships: workspace.memberships,
      menu,
      promotions,
      reviews,
      stats: { venues: workspace.venues.length, menuItems: menu.length, activePromotions: promotions.filter((item) => item.status === 'active').length, reviews: reviews.length }
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось загрузить кабинет.' });
  }
};
