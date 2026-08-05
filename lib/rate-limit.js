const crypto = require('node:crypto');

const buckets = new Map();
let calls = 0;

function clientAddress(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
}

function rateLimit(req, { scope, identifier = '', limit, windowMs }) {
  const now = Date.now();
  const rawKey = `${scope}|${clientAddress(req)}|${String(identifier).trim().toLowerCase()}`;
  const key = crypto.createHash('sha256').update(rawKey).digest('base64url');
  const current = buckets.get(key);
  const bucket = !current || now >= current.resetAt ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  calls += 1;
  if (calls % 250 === 0) {
    for (const [storedKey, value] of buckets) if (now >= value.resetAt) buckets.delete(storedKey);
  }
  return bucket.count > limit ? Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) : 0;
}

module.exports = { rateLimit };
