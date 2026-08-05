const { json, methodNotAllowed, readJson, text, uuid } = require('../lib/http');
const { requireUser } = require('../lib/identity');
const { createStore } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  try {
    const body = await readJson(req, 250_000);
    const rating = Number.parseInt(body.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(res, 400, { message: 'Выберите оценку от 1 до 5.' });
    const payload = {
      venue_id: uuid(body.venueId) || null,
      external_venue_id: text(body.externalVenueId, 160) || null,
      venue_title: text(body.venueTitle, 160),
      author_name: profile.display_name || text(body.authorName, 120, 'Гость'),
      rating,
      body: text(body.review, 3000),
      status: 'pending',
      submitted_by: profile.id
    };
    if (!payload.venue_title || payload.body.length < 20) return json(res, 400, { message: 'Напишите отзыв длиной не менее 20 символов.' });
    const store = createStore();
    const review = await store.createReviewSubmission(payload);
    return json(res, 201, { message: 'Отзыв отправлен на модерацию.', review: { id: review.id, status: review.status } });
  } catch (error) {
    const message = error.code === 'SUPABASE_NOT_CONFIGURED' ? 'Приём отзывов временно недоступен: база ещё подключается.' : error.message;
    return json(res, error.statusCode || 500, { message });
  }
};
