import { validationError } from "./application-error";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function normalizeUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isUuid(normalized) ? normalized : null;
}

export function requireUuid(value: string, label: string): string {
  const normalized = normalizeUuid(value);
  if (!normalized) throw validationError(`${label} must be a UUID`);
  return normalized;
}
