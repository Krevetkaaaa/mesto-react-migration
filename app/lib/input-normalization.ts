import { validationError } from "./application-error";

export function sanitizeText(value: string, limit: number) {
  let safe = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    safe += code <= 0x1f || character === "<" || character === ">" ? " " : character;
  }
  return safe
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

export function enumValueOr<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return isEnumValue(value, allowed) ? value : fallback;
}

export function requireEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (!isEnumValue(value, allowed)) {
    throw validationError(`${label} is invalid`);
  }
  return value;
}
