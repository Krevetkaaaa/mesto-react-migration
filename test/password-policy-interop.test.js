const test = require('node:test');
const assert = require('node:assert/strict');

const commonJsPolicy = require('../password-policy-core.js');

test('CommonJS and ESM password policy entrypoints expose the same contract', async () => {
  const esmPolicy = await import('../password-policy.mjs');
  const exportNames = [
    'PASSWORD_MIN_LENGTH',
    'PASSWORD_PATTERN',
    'PASSWORD_HINT',
    'PASSWORD_REQUIREMENTS_LEAD',
    'TEMPORARY_PASSWORD_HINT',
    'PASSWORD_ERROR_MESSAGE',
    'NEW_PASSWORD_ERROR_MESSAGE',
    'TEMPORARY_PASSWORD_ERROR_MESSAGE',
    'NEW_PASSWORD_VALIDATION_MESSAGE',
    'TEMPORARY_PASSWORD_VALIDATION_MESSAGE',
  ];

  for (const name of exportNames) {
    assert.equal(esmPolicy[name], commonJsPolicy[name], `${name} drifted between module formats`);
  }
  for (const candidate of ['short', 'onlyletterslong', '1234567890', 'Strong-pass-10']) {
    assert.equal(
      esmPolicy.isStrongPassword(candidate),
      commonJsPolicy.isStrongPassword(candidate),
      `password result drifted for ${candidate}`,
    );
  }
});
