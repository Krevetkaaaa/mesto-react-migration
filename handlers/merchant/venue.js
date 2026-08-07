const { json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { attemptPostCommit, merchantHandlerError, setMerchantResponseHeaders } = require('../../lib/merchant-operations');
const { enforceRateLimit } = require('../../lib/rate-limit');
const { merchantWorkspace, requireVenue } = require('../../lib/venue-access');
const { invalidatePublicVenueCache } = require('../../lib/public-cache');

module.exports = async function handler(req, res) {
  setMerchantResponseHeaders(res);
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
    if (!await enforceRateLimit(req, res, {
      policy: 'mutation', scope: 'merchant-venue', identifier: workspace.profile.id
    })) return;
    const body = await readJson(req, 750_000);
    const venue = requireVenue(workspace, res, body.id, 'venue');
    if (!venue) return;
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    const patch = {};
    if (has('title')) patch.title = text(body.title, 160);
    if (has('category')) patch.category = text(body.category, 100);
    if (has('description')) patch.description = text(body.description, 2500);
    if (has('address')) patch.address = text(body.address, 300);
    if (has('phone')) patch.phone = text(body.phone, 60);
    if (has('website')) {
      const website = text(body.website, 300);
      if (website && !/^https?:\/\//i.test(website)) return json(res, 400, { message: 'Ссылка на сайт должна начинаться с http:// или https://.' });
      patch.website = website;
    }
    if (has('hours')) patch.hours = text(body.hours, 200);
    if (has('averageCheck')) patch.average_check = text(body.averageCheck, 100);
    if (has('cuisine')) patch.cuisine = text(body.cuisine, 100);
    if (has('features')) {
      if (!Array.isArray(body.features)) return json(res, 400, { message: 'Особенности должны быть переданы списком.' });
      patch.features = body.features.map((item) => text(item, 100)).filter(Boolean).slice(0, 20);
    }
    if (!Object.keys(patch).length) return json(res, 200, { venue });
    const updated = await workspace.store.saveVenue(patch, venue.id);
    await attemptPostCommit(() => workspace.store.audit({ actor_id: workspace.profile.id, actor_label: workspace.profile.display_name, actor_role: 'merchant', action: 'venue.updated', entity_type: 'venue', entity_id: venue.id }));
    await attemptPostCommit(() => invalidatePublicVenueCache({ id: venue.id, slug: updated?.slug || venue.slug, reason: 'venue.updated' }));
    return json(res, 200, { venue: updated });
  } catch (error) {
    return merchantHandlerError(res, error, 'Не удалось сохранить заведение.');
  }
};
