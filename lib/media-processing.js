let sharpFactory;

function sharp(...args) {
  sharpFactory ||= require('sharp');
  return sharpFactory(...args);
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_EDGE = 8_192;
const VARIANTS = Object.freeze({
  thumb: Object.freeze({ width: 320, height: 240, quality: 78 }),
  card: Object.freeze({ width: 768, height: 512, quality: 82 }),
  hero: Object.freeze({ width: 1_600, height: 900, quality: 84 })
});

class MediaValidationError extends Error {
  constructor(code, message, statusCode = 400, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MediaValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function detectImageContentType(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

function validDimensions(metadata) {
  const width = Number(metadata?.width);
  const height = Number(metadata?.height);
  return Number.isInteger(width)
    && Number.isInteger(height)
    && width > 0
    && height > 0
    && width <= MAX_IMAGE_EDGE
    && height <= MAX_IMAGE_EDGE
    && width * height <= MAX_IMAGE_PIXELS;
}

async function processMedia(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!bytes.length) throw new MediaValidationError('MEDIA_EMPTY', 'The uploaded image is empty');
  if (bytes.length > MAX_IMAGE_BYTES) throw new MediaValidationError('MEDIA_TOO_LARGE', 'The uploaded image exceeds 6 MiB', 413);
  const contentType = detectImageContentType(bytes);
  if (!contentType) throw new MediaValidationError('MEDIA_TYPE_UNSUPPORTED', 'Only JPEG, PNG, and WebP images are supported');

  let source;
  let metadata;
  try {
    source = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      sequentialRead: true
    });
    metadata = await source.metadata();
  } catch (error) {
    throw new MediaValidationError('MEDIA_DECODE_FAILED', 'The uploaded image cannot be decoded safely', 400, error);
  }
  const expectedFormat = contentType.replace('image/', '').replace('jpeg', 'jpeg');
  if (!validDimensions(metadata) || metadata.format !== expectedFormat) {
    throw new MediaValidationError('MEDIA_DIMENSIONS_INVALID', 'The uploaded image dimensions are invalid or exceed 40 megapixels');
  }

  const variants = {};
  try {
    for (const [name, config] of Object.entries(VARIANTS)) {
      const result = await source.clone()
        .rotate()
        .resize({
          width: config.width,
          height: config.height,
          fit: 'cover',
          position: 'attention',
          withoutEnlargement: true
        })
        .webp({ quality: config.quality, effort: 4, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      variants[name] = {
        bytes: result.data,
        width: result.info.width,
        height: result.info.height,
        size: result.info.size,
        contentType: 'image/webp'
      };
    }
  } catch (error) {
    throw new MediaValidationError('MEDIA_PROCESSING_FAILED', 'The uploaded image could not be processed safely', 400, error);
  }

  return {
    original: {
      contentType,
      width: metadata.width,
      height: metadata.height,
      bytes: bytes.length
    },
    variants
  };
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_IMAGE_PIXELS,
  VARIANTS,
  MediaValidationError,
  detectImageContentType,
  processMedia,
  validDimensions
};
