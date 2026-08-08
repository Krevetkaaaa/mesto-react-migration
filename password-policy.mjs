import './password-policy-core.js';

const policy = globalThis[Symbol.for('mesto.password-policy')];

if (!policy) {
  throw new Error('Password policy core failed to initialize.');
}

export const PASSWORD_MIN_LENGTH = policy.PASSWORD_MIN_LENGTH;
export const PASSWORD_PATTERN = policy.PASSWORD_PATTERN;
export const PASSWORD_HINT = policy.PASSWORD_HINT;
export const PASSWORD_REQUIREMENTS_LEAD = policy.PASSWORD_REQUIREMENTS_LEAD;
export const TEMPORARY_PASSWORD_HINT = policy.TEMPORARY_PASSWORD_HINT;
export const PASSWORD_ERROR_MESSAGE = policy.PASSWORD_ERROR_MESSAGE;
export const NEW_PASSWORD_ERROR_MESSAGE = policy.NEW_PASSWORD_ERROR_MESSAGE;
export const TEMPORARY_PASSWORD_ERROR_MESSAGE = policy.TEMPORARY_PASSWORD_ERROR_MESSAGE;
export const NEW_PASSWORD_VALIDATION_MESSAGE = policy.NEW_PASSWORD_VALIDATION_MESSAGE;
export const TEMPORARY_PASSWORD_VALIDATION_MESSAGE = policy.TEMPORARY_PASSWORD_VALIDATION_MESSAGE;
export const isStrongPassword = policy.isStrongPassword;
