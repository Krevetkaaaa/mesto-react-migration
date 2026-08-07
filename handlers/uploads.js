const crypto = require('node:crypto');
const { json, methodNotAllowed, readJson, text } = require('../lib/http');
const { acceptableImageDimensions } = require('../lib/image-dimensions');
const { requireUser } = require('../lib/identity');
const { enforceRateLimit } = require('../lib/rate-limit');
const { createStore } = require('../lib/supabase');

const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

function validImageSignature(bytes, contentType) {
  if (contentType === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return bytes.length > 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const profile = await requireUser(req, res);
  if (!profile) return;
  if (!await enforceRateLimit(req, res, {
    policy: 'upload',
    scope: 'uploads',
    identifier: profile.id,
    message: 'Лимит загрузок исчерпан. Попробуйте через час.'
  })) return;
  try {
    const body = await readJson(req, 8_500_000);
    const contentType = text(body.type, 50);
    const extension = allowedTypes.get(contentType);
    const encoded = String(body.data || '');
    if (encoded.length > MAX_BASE64_LENGTH + 100) return json(res, 413, { message: 'Файл должен быть не больше 6 МБ.' });
    const match = encoded.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!extension || !match || match[1].toLowerCase() !== contentType.toLowerCase()) return json(res, 400, { message: 'Поддерживаются только JPG, PNG и WebP.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return json(res, 413, { message: 'Файл должен быть не больше 6 МБ.' });
    if (!validImageSignature(bytes, contentType)) return json(res, 400, { message: 'Файл повреждён или его формат не соответствует изображению.' });
    if (!acceptableImageDimensions(bytes, contentType)) return json(res, 400, { message: 'Не удалось проверить разрешение изображения или оно слишком большое.' });
    const safeName = text(body.name, 80, 'photo').replace(/[^a-zа-яё0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'photo';
    const path = `${profile.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}.${extension}`;
    const store = createStore();
    const url = await store.upload(path, bytes, contentType);
    return json(res, 201, { url });
  } catch (error) {
    const message = error.code === 'SUPABASE_NOT_CONFIGURED' ? 'Загрузка фотографий временно недоступна: база ещё подключается.' : error.message;
    return json(res, error.statusCode || 500, { message });
  }
};
