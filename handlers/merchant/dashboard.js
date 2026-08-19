const { json, methodNotAllowed } = require('../../lib/http');
const { publicUser } = require('../../lib/identity');
const { merchantHandlerError, setMerchantResponseHeaders } = require('../../lib/merchant-operations');
const { request } = require('../../lib/supabase');
const { merchantWorkspace, venueIdsForPermission } = require('../../lib/venue-access');

module.exports = async function handler(req, res) {
  setMerchantResponseHeaders(res);
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
    const menuVenueIds = venueIdsForPermission(workspace, 'menu');
    const promotionVenueIds = venueIdsForPermission(workspace, 'promotions');
    const reviewVenueIds = venueIdsForPermission(workspace, 'reviews');
    const [menu, promotions, reviews] = await Promise.all([
      workspace.store.menuForVenues(menuVenueIds, workspace.profile.id),
      workspace.store.promotionsForVenues(promotionVenueIds, workspace.profile.id),
      reviewVenueIds.length ? request('reviews', { query: { select: '*', venue_id: `in.(${reviewVenueIds.join(',')})`, order: 'created_at.desc', limit: 300 } }) : []
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
    return merchantHandlerError(res, error, 'Не удалось загрузить кабинет.');
  }
};
