const crypto = require('node:crypto');
const { json, methodNotAllowed, readJson, text } = require('../lib/http');
const { requireUser } = require('../lib/identity');
const { createStore } = require('../lib/supabase');

const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
const uploadBuckets = new Map();

function uploadLimited(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  const current = uploadBuckets.get(key);
  if (!current || now - current.startedAt > 60 * 60_000) {
    uploadBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

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
  if (uploadLimited(req)) return json(res, 429, { message: 'Лимит загрузок исчерпан. Попробуйте через час.' });
  try {
    const body = await readJson(req, 8_500_000);
    const contentType = text(body.type, 50);
    const extension = allowedTypes.get(contentType);
    const match = String(body.data || '').match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!extension || !match || match[1].toLowerCase() !== contentType.toLowerCase()) return json(res, 400, { message: 'Поддерживаются только JPG, PNG и WebP.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 6 * 1024 * 1024) return json(res, 413, { message: 'Файл должен быть не больше 6 МБ.' });
    if (!validImageSignature(bytes, contentType)) return json(res, 400, { message: 'Файл повреждён или его формат не соответствует изображению.' });
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
