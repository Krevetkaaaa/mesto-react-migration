const { json, methodNotAllowed, readJson, text, uuid } = require('../../lib/http');
const { merchantWorkspace, requireVenue } = require('../../lib/venue-access');

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = async function handler(req, res) {
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['POST', 'PATCH', 'DELETE']);
  try {
    const workspace = await merchantWorkspace(req, res);
    if (!workspace) return;
    const body = await readJson(req, 250_000);
    const id = req.method === 'POST' ? '' : uuid(body.id);
    if (req.method !== 'POST' && !id) return json(res, 400, { message: 'Укажите корректную акцию.' });
    let venueId = uuid(body.venueId);
    if (req.method !== 'POST') {
      const items = await workspace.store.promotionsForVenues(workspace.venueIds, workspace.profile.id);
      const existing = items.find((item) => item.id === id);
      if (!existing) return json(res, 404, { message: 'Акция не найдена.' });
      venueId = existing.venue_id;
    }
    if (!requireVenue(workspace, res, venueId, 'promotions')) return;
    if (req.method === 'DELETE') {
      await workspace.store.deletePromotion(id, workspace.profile.id);
      return json(res, 200, { ok: true });
    }
    const startsAt = dateValue(body.startsAt);
    const endsAt = dateValue(body.endsAt);
    if (body.startsAt && !startsAt) return json(res, 400, { message: 'Укажите корректную дату начала.' });
    if (body.endsAt && !endsAt) return json(res, 400, { message: 'Укажите корректную дату окончания.' });
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) return json(res, 400, { message: 'Дата окончания не может быть раньше даты начала.' });
    const payload = {
      venue_id: venueId,
      title: text(body.title, 160),
      description: text(body.description, 1000),
      starts_at: startsAt,
      ends_at: endsAt,
      status: ['draft', 'active', 'archived'].includes(body.status) ? body.status : 'draft'
    };
    if (!payload.title) return json(res, 400, { message: 'Укажите название акции.' });
    return json(res, id ? 200 : 201, { promotion: await workspace.store.savePromotion(payload, id, workspace.profile.id) });
  } catch (error) {
    return json(res, error.statusCode || 500, { message: error.message || 'Не удалось сохранить акцию.' });
  }
};
