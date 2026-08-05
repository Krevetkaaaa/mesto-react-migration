const { json, methodNotAllowed, readJson, text } = require('../../lib/http');
const { merchantWorkspace, requireVenue } = require('../../lib/venue-access');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
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
    await workspace.store.audit({ actor_id: workspace.profile.id, actor_label: workspace.profile.display_name, actor_role: 'merchant', action: 'venue.updated', entity_type: 'venue', entity_id: venue.id });
    return json(res, 200, { venue: updated });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось сохранить заведение.' });
  }
};
