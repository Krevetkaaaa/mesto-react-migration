const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_IMAGE_PIXELS,
  acceptableImageDimensions,
  imageDimensions
} = require('../lib/image-dimensions');

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x07, 0x08,
    height >> 8, height & 0xff,
    width >> 8, width & 0xff
  ]);
}

function webpExtended(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

function webpLossy(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8 ', 12, 'ascii');
  Buffer.from([0x9d, 0x01, 0x2a]).copy(bytes, 23);
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}

function webpLossless(width, height) {
  const bytes = Buffer.alloc(25);
  const encodedWidth = width - 1;
  const encodedHeight = height - 1;
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8L', 12, 'ascii');
  bytes[20] = 0x2f;
  bytes[21] = encodedWidth & 0xff;
  bytes[22] = ((encodedWidth >> 8) & 0x3f) | ((encodedHeight & 0x03) << 6);
  bytes[23] = (encodedHeight >> 2) & 0xff;
  bytes[24] = (encodedHeight >> 10) & 0x0f;
  return bytes;
}

test('reads dimensions from supported image headers', () => {
  assert.deepEqual(imageDimensions(png(1_200, 800), 'image/png'), { width: 1_200, height: 800 });
  assert.deepEqual(imageDimensions(jpeg(1_600, 900), 'image/jpeg'), { width: 1_600, height: 900 });
  assert.deepEqual(imageDimensions(webpExtended(2_048, 1_024), 'image/webp'), { width: 2_048, height: 1_024 });
  assert.deepEqual(imageDimensions(webpLossy(1_280, 720), 'image/webp'), { width: 1_280, height: 720 });
  assert.deepEqual(imageDimensions(webpLossless(640, 480), 'image/webp'), { width: 640, height: 480 });
});

test('rejects missing dimensions and decompression-bomb-sized images', () => {
  assert.equal(acceptableImageDimensions(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'), false);
  assert.equal(acceptableImageDimensions(png(8_193, 10), 'image/png'), false);
  assert.equal(acceptableImageDimensions(png(MAX_IMAGE_PIXELS / 5_000 + 1, 5_000), 'image/png'), false);
});

test('rejects fake or malformed container headers before trusting dimensions', () => {
  const malformedPng = png(1_200, 800);
  malformedPng.writeUInt32BE(12, 8);
  assert.equal(imageDimensions(malformedPng, 'image/png'), null);

  const missingJpegSoi = jpeg(1_600, 900);
  missingJpegSoi[0] = 0x00;
  assert.equal(imageDimensions(missingJpegSoi, 'image/jpeg'), null);

  const missingWebpRiff = webpExtended(2_048, 1_024);
  missingWebpRiff.write('FAKE', 0, 'ascii');
  assert.equal(imageDimensions(missingWebpRiff, 'image/webp'), null);
});

test('accepts ordinary images within both edge and pixel budgets', () => {
  assert.equal(acceptableImageDimensions(png(4_000, 3_000), 'image/png'), true);
});
