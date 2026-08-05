const { email, json, methodNotAllowed, readJson, text } = require('../lib/http');
const { contactEmail, requireUser } = require('../lib/identity');
const { configuration, createStore } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  try {
    const body = await readJson(req, 1_500_000);
    const photoPrefix = `${configuration().url}/storage/v1/object/public/venue-submissions/${profile.id}/`;
    const address = contactEmail(profile) || email(body.contactEmail);
    const payload = {
      contact_name: text(profile.display_name || profile.username, 120, 'Пользователь'),
      contact_email: address,
      title: text(body.title, 160),
      city: text(body.city, 80),
      category: text(body.category, 100),
      cuisine: text(body.cuisine, 100),
      description: text(body.description, 2000),
      address: text(body.address, 300),
      phone: text(body.phone, 60),
      website: /^https?:\/\//i.test(String(body.website || '')) ? text(body.website, 300) : '',
      hours: text(body.hours, 200),
      average_check: text(body.averageCheck, 100),
      features: Array.isArray(body.features) ? body.features.map((item) => text(item, 100)).filter(Boolean).slice(0, 20) : [],
      photos: Array.isArray(body.photos) ? body.photos.map((url) => text(url, 700)).filter((url) => url.startsWith(photoPrefix)).slice(0, 6) : [],
      status: 'pending',
      submitted_by: profile.id
    };
    if (!payload.contact_name || !payload.contact_email || !payload.title || !payload.city || !payload.category || !payload.description) {
      return json(res, 400, { message: 'Заполните имя, почту, название, город, категорию и описание.' });
    }
    const store = createStore();
    const submission = await store.createVenueSubmission(payload);
    return json(res, 201, { message: 'Заявка отправлена на модерацию.', submission: { id: submission.id, status: submission.status } });
  } catch (error) {
    const message = error.code === 'SUPABASE_NOT_CONFIGURED' ? 'Приём заявок временно недоступен: база ещё подключается.' : error.message;
    return json(res, error.statusCode || 500, { message });
  }
};
