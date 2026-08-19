(function installPasswordPolicy(root) {
  const policyKey = Symbol.for('mesto.password-policy');
  let policy = root?.[policyKey];

  if (!policy) {
    const PASSWORD_MIN_LENGTH = 10;
    const PASSWORD_PATTERN = '(?=.*[A-Za-zА-Яа-яЁё])(?=.*[0-9]).{10,}';
    const PASSWORD_HINT = 'Минимум 10 символов, буква и цифра';
    const PASSWORD_REQUIREMENTS_LEAD = 'Используйте не менее 10 символов, хотя бы одну букву и одну цифру.';
    const TEMPORARY_PASSWORD_HINT = 'Не менее 10 символов, буква и цифра. Если поле пустое, безопасный пароль создаст сервер.';
    const PASSWORD_REQUIREMENT = 'должен содержать минимум 10 символов, букву и цифру.';
    const passwordPattern = new RegExp(`^(?:${PASSWORD_PATTERN})$`, 'u');

    policy = Object.freeze({
      PASSWORD_MIN_LENGTH,
      PASSWORD_PATTERN,
      PASSWORD_HINT,
      PASSWORD_REQUIREMENTS_LEAD,
      TEMPORARY_PASSWORD_HINT,
      PASSWORD_ERROR_MESSAGE: `Пароль ${PASSWORD_REQUIREMENT}`,
      NEW_PASSWORD_ERROR_MESSAGE: `Новый пароль ${PASSWORD_REQUIREMENT}`,
      TEMPORARY_PASSWORD_ERROR_MESSAGE: `Временный пароль ${PASSWORD_REQUIREMENT}`,
      NEW_PASSWORD_VALIDATION_MESSAGE: 'New password is too weak',
      TEMPORARY_PASSWORD_VALIDATION_MESSAGE: 'Temporary password is too weak',
      isStrongPassword(value) {
        return passwordPattern.test(String(value ?? ''));
      },
    });

    Object.defineProperty(root, policyKey, {
      configurable: false,
      enumerable: false,
      value: policy,
      writable: false,
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = policy;
  }
})(typeof globalThis === 'undefined' ? undefined : globalThis);
