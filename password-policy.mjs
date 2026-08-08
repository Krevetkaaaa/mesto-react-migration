export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_PATTERN = "(?=.*[A-Za-zА-Яа-яЁё])(?=.*[0-9]).{10,}";
export const PASSWORD_HINT = "Минимум 10 символов, буква и цифра";
export const PASSWORD_REQUIREMENTS_LEAD = "Используйте не менее 10 символов, хотя бы одну букву и одну цифру.";
export const TEMPORARY_PASSWORD_HINT = "Не менее 10 символов, буква и цифра. Если поле пустое, безопасный пароль создаст сервер.";

const PASSWORD_REQUIREMENT = "должен содержать минимум 10 символов, букву и цифру.";
export const PASSWORD_ERROR_MESSAGE = `Пароль ${PASSWORD_REQUIREMENT}`;
export const NEW_PASSWORD_ERROR_MESSAGE = `Новый пароль ${PASSWORD_REQUIREMENT}`;
export const TEMPORARY_PASSWORD_ERROR_MESSAGE = `Временный пароль ${PASSWORD_REQUIREMENT}`;
export const NEW_PASSWORD_VALIDATION_MESSAGE = "New password is too weak";
export const TEMPORARY_PASSWORD_VALIDATION_MESSAGE = "Temporary password is too weak";

const passwordPattern = new RegExp(`^(?:${PASSWORD_PATTERN})$`, "u");

export function isStrongPassword(value) {
  return passwordPattern.test(String(value ?? ""));
}
