import { validationError } from "./application-error";
import { sanitizeText } from "./input-normalization";
import type {
  ChangePasswordCommand,
  RegisterCommand,
  SignInCommand,
} from "../modules/session";
import {
  isStrongPassword,
  NEW_PASSWORD_VALIDATION_MESSAGE,
  PASSWORD_ERROR_MESSAGE,
} from "../../password-policy.mjs";

export type OAuthProvider = "google" | "yandex" | "vk";

export { isStrongPassword } from "../../password-policy.mjs";

export function normalizeEmail(value: string) {
  const email = sanitizeText(value, 200).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeSignInCommand(command: SignInCommand): SignInCommand {
  const login = sanitizeText(command.login, 200).toLowerCase();
  if (!login || !command.password) throw validationError("Login and password are required");
  return { login, password: command.password };
}

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-яё0-9._-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function normalizeRegisterCommand(command: RegisterCommand): RegisterCommand {
  const name = sanitizeText(command.name, 120);
  const username = normalizeUsername(command.username);
  const email = normalizeEmail(command.email);
  if (!name || !/^[a-z0-9._-]{3,48}$/.test(username) || !email) {
    throw validationError("Name, email and username are invalid");
  }
  if (!isStrongPassword(command.password)) {
    throw validationError(PASSWORD_ERROR_MESSAGE);
  }
  return { name, username, email, password: command.password };
}

export function normalizeChangePasswordCommand(
  command: ChangePasswordCommand,
): ChangePasswordCommand {
  if (!isStrongPassword(command.password)) throw validationError(NEW_PASSWORD_VALIDATION_MESSAGE);
  return {
    password: command.password,
    ...(command.currentPassword === undefined
      ? {}
      : { currentPassword: command.currentPassword }),
  };
}

function safeReturnTarget(value = "/") {
  const candidate = value.trim() || "/";
  const hasControl = [...candidate].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || hasControl) {
    return "/";
  }
  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return "/";
    const parsed = new URL(candidate, "https://mesto.invalid");
    if (parsed.origin !== "https://mesto.invalid") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return "/";
  }
}

export function normalizeOAuthStart(provider: OAuthProvider, returnTo?: string) {
  if (!["google", "yandex", "vk"].includes(provider)) {
    throw validationError("OAuth provider is unsupported");
  }
  return { provider, returnTo: safeReturnTarget(returnTo) };
}

export function normalizeOAuthAccessToken(value: string) {
  const token = value.trim();
  if (!token || token.length > 16_384) {
    throw validationError("OAuth access token is invalid");
  }
  return token;
}
