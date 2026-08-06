const { boolean, json, methodNotAllowed, readJson, text, uuid } = require('../../lib/http');
const { merchantHandlerError, setMerchantResponseHeaders } = require('../../lib/merchant-operations');
const { merchantWorkspace, requireVenue } = require('../../lib/venue-access');

module.exports = async function handler(req, res) {
  setMerchantResponseHeaders(res);
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['POST', 'PATCH', 'DELETE']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
    const body = await readJson(req, 250_000);
    const id = req.method === 'POST' ? '' : uuid(body.id);
    if (req.method !== 'POST' && !id) return json(res, 400, { message: 'Укажите корректную позицию меню.' });
    let venueId = uuid(body.venueId);
    if (req.method !== 'POST') {
      const items = await workspace.store.menuForVenues(workspace.venueIds, workspace.profile.id);
      const existing = items.find((item) => item.id === id);
      if (!existing) return json(res, 404, { message: 'Позиция меню не найдена.' });
      venueId = existing.venue_id;
    }
    if (!requireVenue(workspace, res, venueId, 'menu')) return;
    if (req.method === 'DELETE') {
      await workspace.store.deleteMenuItem(id, workspace.profile.id);
      return json(res, 200, { ok: true });
    }
    const price = body.price === '' || body.price == null ? null : Number(body.price);
    if (price !== null && (!Number.isFinite(price) || price < 0)) return json(res, 400, { message: 'Укажите корректную цену.' });
    const payload = {
      venue_id: venueId,
      section: text(body.section, 100, 'Основное меню'),
      title: text(body.title, 160),
      description: text(body.description, 600),
      price,
      photo_url: /^https?:\/\//i.test(String(body.photoUrl || '')) ? text(body.photoUrl, 500) : '',
      is_available: body.isAvailable === undefined ? true : boolean(body.isAvailable),
      sort_order: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0
    };
    if (!payload.title) return json(res, 400, { message: 'Укажите название позиции.' });
    return json(res, id ? 200 : 201, { item: await workspace.store.saveMenuItem(payload, id, workspace.profile.id) });
  } catch (error) {
    return merchantHandlerError(res, error, 'Не удалось сохранить меню.');
  }
};
