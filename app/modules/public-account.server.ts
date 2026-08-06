import { data, redirect } from "react-router";

import { createHttpFavorites } from "../adapters/favorites-http";
import { createServerHttpClient } from "../adapters/http";
import { createHttpSession } from "../adapters/session-http";
import { isApplicationError } from "../lib/application-error";
import type { Favorite, User } from "../lib/domain";
import type { AuthProviders } from "./session";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
} as const;

export interface PublicAccountRouteData {
  user: User | null;
  favorites: readonly Favorite[];
  providers: AuthProviders;
  oauthError: string;
  returnTo: string;
}

export function publicAccountHeaders() {
  return PRIVATE_HEADERS;
}

export function safeAccountReturnTo(value: string | null, fallback = "/profile") {
  const candidate = value?.trim() || fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
      return fallback;
    }
    const parsed = new URL(candidate, "https://mesto.invalid");
    if (parsed.origin !== "https://mesto.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function clients(request: Request, responseHeaders?: Headers) {
  const http = createServerHttpClient({
    request,
    ...(responseHeaders ? { responseHeaders } : {}),
  });
  return {
    favorites: createHttpFavorites(http),
    session: createHttpSession(http),
  };
}

function loginTarget(request: Request) {
  const url = new URL(request.url);
  const requested = `${url.pathname}${url.search}`;
  return `/login?${new URLSearchParams({ returnTo: requested }).toString()}`;
}

function oauthErrorMessage(code: string | null) {
  if (!code) return "";
  if (code === "OAUTH_STATE_INVALID" || code === "OAUTH_EXPIRED") return "Сессия авторизации истекла. Начните вход заново.";
  if (code === "OAUTH_PROVIDER_DENIED" || code === "OAUTH_DENIED") return "Вход через внешний сервис отменён.";
  if (code === "OAUTH_EMAIL_REQUIRED") return "Провайдер не передал подтверждённую почту.";
  if (code === "OAUTH_EMAIL_CONFLICT") return "Аккаунт с этой почтой уже существует. Войдите прежним способом.";
  if (code === "OAUTH_ACCOUNT_INACTIVE") return "Аккаунт приостановлен.";
  if (code === "OAUTH_PROVIDER_NOT_CONFIGURED") return "Этот способ входа ещё не настроен.";
  if (code === "OAUTH_IDENTITY_SCHEMA_MISSING" || code === "OAUTH_SESSION_SECRET_MISSING") {
    return "Авторизация временно недоступна.";
  }
  return "Не удалось завершить вход через внешний сервис. Попробуйте ещё раз.";
}

export async function loadAuthRoute(request: Request) {
  const url = new URL(request.url);
  const api = clients(request);
  const [session, providers] = await Promise.all([
    api.session.current(),
    api.session.providers(),
  ]);
  if (session.status === "authenticated") return redirect("/profile", { headers: PRIVATE_HEADERS });
  return {
    user: null,
    favorites: [],
    providers,
    oauthError: oauthErrorMessage(url.searchParams.get("oauthError")),
    returnTo: safeAccountReturnTo(url.searchParams.get("returnTo")),
  };
}

export async function loadProtectedAccountRoute(request: Request) {
  const api = clients(request);
  const session = await api.session.current();
  if (session.status === "anonymous") return redirect(loginTarget(request), { headers: PRIVATE_HEADERS });
  const [favorites, providers] = await Promise.all([
    api.favorites.list(),
    api.session.providers(),
  ]);
  return {
    user: session.user,
    favorites,
    providers,
    oauthError: "",
    returnTo: "/profile",
  };
}

function authErrorMessage(error: unknown, mode: "login" | "register") {
  if (!isApplicationError(error)) {
    return "Не удалось связаться с сервисом авторизации. Попробуйте ещё раз.";
  }
  if (error.kind === "validation") return error.message;
  if (error.kind === "unauthorized") return "Неверный логин или пароль.";
  if (error.kind === "conflict") return "Аккаунт с такими данными уже существует.";
  if (error.kind === "rate-limited") return "Слишком много попыток. Повторите вход немного позже.";
  if (error.kind === "unavailable") return "Сервис авторизации временно недоступен. Попробуйте ещё раз.";
  return mode === "login"
    ? "Не удалось войти. Проверьте данные и попробуйте ещё раз."
    : "Не удалось создать аккаунт. Попробуйте ещё раз.";
}

function errorStatus(error: unknown) {
  if (!isApplicationError(error)) return 500;
  return error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function performAuthAction(request: Request, mode: "login" | "register") {
  const form = await request.formData();
  const responseHeaders = new Headers(PRIVATE_HEADERS);
  const api = clients(request, responseHeaders);
  const returnTo = safeAccountReturnTo(formText(form, "returnTo"));
  try {
    if (mode === "login") {
      await api.session.signIn({
        login: formText(form, "login"),
        password: formText(form, "password"),
      });
    } else {
      await api.session.register({
        name: formText(form, "name"),
        username: formText(form, "username"),
        email: formText(form, "email"),
        password: formText(form, "password"),
      });
    }
    return redirect(returnTo, { headers: responseHeaders });
  } catch (error) {
    return data({ error: authErrorMessage(error, mode) }, {
      status: errorStatus(error),
      headers: responseHeaders,
    });
  }
}

export async function performLogoutAction(request: Request) {
  const responseHeaders = new Headers(PRIVATE_HEADERS);
  await clients(request, responseHeaders).session.signOut();
  return redirect("/", { headers: responseHeaders });
}

export async function performFavoriteAction(request: Request) {
  const form = await request.formData();
  const responseHeaders = new Headers(PRIVATE_HEADERS);
  const api = clients(request, responseHeaders);
  const session = await api.session.current();
  if (session.status === "anonymous") return redirect(loginTarget(request), { headers: PRIVATE_HEADERS });
  const venueKey = formText(form, "venueKey");
  try {
    await api.favorites.remove(venueKey);
    return data({ ok: true as const, venueKey }, { headers: responseHeaders });
  } catch (error) {
    return data({
      ok: false as const,
      error: "Не удалось изменить избранное. Попробуйте ещё раз.",
    }, {
      status: errorStatus(error),
      headers: responseHeaders,
    });
  }
}
