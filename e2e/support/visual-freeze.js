// Exact Chrome keeps geometry deterministic, but Windows 11 and the GitHub
// Windows Server runner still rasterize some text edges differently. The
// observed cross-host maximum is 2,615 pixels on a multi-megapixel image;
// 3,000 keeps that sub-pixel variance portable without accepting layout drift.
const CROSS_HOST_VISUAL_DIFF_PIXELS = 3_000;

module.exports = { CROSS_HOST_VISUAL_DIFF_PIXELS };
