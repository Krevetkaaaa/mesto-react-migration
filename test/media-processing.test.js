const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  MAX_IMAGE_BYTES,
  MediaValidationError,
  detectImageContentType,
  processMedia,
  validDimensions
} = require('../lib/media-processing');

test('detects actual image signatures without consulting client MIME', () => {
  assert.equal(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(detectImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectImageContentType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectImageContentType(Buffer.from('<svg></svg>')), '');
});

test('decodes an actual image and creates metadata-stripped WebP derivatives', async () => {
  const source = await sharp({
    create: { width: 1_200, height: 800, channels: 3, background: '#7f5539' }
  }).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();

  const processed = await processMedia(source);
  assert.deepEqual(processed.original, {
    contentType: 'image/jpeg', width: 1_200, height: 800, bytes: source.length
  });
  assert.deepEqual(Object.keys(processed.variants), ['thumb', 'card', 'hero']);
  for (const variant of Object.values(processed.variants)) {
    const metadata = await sharp(variant.bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.orientation, undefined);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.ok(variant.width > 0 && variant.height > 0 && variant.size === variant.bytes.length);
  }
});

test('rejects oversized, forged, corrupt, and decompression-bomb dimensions', async () => {
  await assert.rejects(() => processMedia(Buffer.alloc(MAX_IMAGE_BYTES + 1)), (error) => (
    error instanceof MediaValidationError && error.code === 'MEDIA_TOO_LARGE' && error.statusCode === 413
  ));
  await assert.rejects(() => processMedia(Buffer.from('<svg><script>alert(1)</script></svg>')), (error) => (
    error instanceof MediaValidationError && error.code === 'MEDIA_TYPE_UNSUPPORTED'
  ));
  await assert.rejects(() => processMedia(Buffer.from([0xff, 0xd8, 0xff, 0x00])), (error) => (
    error instanceof MediaValidationError && error.code === 'MEDIA_DECODE_FAILED'
  ));
  assert.equal(validDimensions({ width: 8_193, height: 10 }), false);
  assert.equal(validDimensions({ width: 8_000, height: 5_001 }), false);
});
