const { email, json, methodNotAllowed, readJson, text } = require('../lib/http');
const { contactEmail, requireUser } = require('../lib/identity');
const { createMediaStorage } = require('../lib/media-storage');
const { enforceRateLimit } = require('../lib/rate-limit');
const { configuration, createStore } = require('../lib/supabase');
const { mediaIds, releaseOwnedMedia } = require('./uploads');

async function cleanupFailedSubmission(profile, ids, store) {
  if (!ids?.length) return;
  await releaseOwnedMedia({
    store: store || createStore(),
    storage: createMediaStorage(configuration()),
    ownerId: profile.id,
    ids
  }).catch(() => null);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'mutation', scope: 'submission-create', identifier: profile.id
  })) return;

  let requestedMediaIds = [];
  let store;
  try {
    const body = await readJson(req, 1_500_000);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json(res, 400, { message: 'The request body must be a JSON object.', code: 'INVALID_BODY' });
    }
    requestedMediaIds = mediaIds(body.mediaIds === undefined ? [] : body.mediaIds);
    if (!requestedMediaIds) return json(res, 400, { message: 'Некорректный список фотографий.', code: 'MEDIA_IDS_INVALID' });
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
      features: Array.isArray(body.features) ? body.features.map((item) => text(item, 100)).filter(Boolean).slice(0, 20) : []
    };
    if (!payload.contact_name || !payload.contact_email || !payload.title || !payload.city || !payload.category || !payload.description) {
      await cleanupFailedSubmission(profile, requestedMediaIds);
      return json(res, 400, { message: 'Заполните имя, почту, название, город, категорию и описание.' });
    }

    store = createStore();
    const submission = await store.createVenueSubmissionWithMedia(payload, requestedMediaIds, profile.id);
    if (!submission?.id) throw Object.assign(new Error('Submission transaction returned no receipt'), { statusCode: 502 });
    return json(res, 201, {
      message: 'Заявка отправлена на модерацию.',
      submission: { id: submission.id, status: submission.status }
    });
  } catch (error) {
    await cleanupFailedSubmission(profile, requestedMediaIds, store);
    const message = error.code === 'SUPABASE_NOT_CONFIGURED'
      ? 'Приём заявок временно недоступен: база ещё подключается.'
      : error.message;
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : error.message === 'INVALID_JSON' ? 400 : error.statusCode || 500;
    return json(res, status, { message, ...(error.message === 'INVALID_JSON' ? { code: 'INVALID_JSON' } : {}) });
  }
};
