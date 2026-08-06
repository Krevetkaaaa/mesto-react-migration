import { data, redirect } from "react-router";

import { createServerHttpClient } from "../adapters/http";
import { createHttpMerchantWorkspace } from "../adapters/merchant-workspace-http";
import { createHttpSession } from "../adapters/session-http";
import { isApplicationError } from "../lib/application-error";
import type { MerchantWorkspaceSnapshot } from "../lib/domain";
import type {
  MenuItemDraft,
  PromotionDraft,
  VenuePatch,
} from "./merchant-workspace";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  Vary: "Cookie",
} as const;

export type MerchantLoaderData =
  | { status: "anonymous"; message: string; workspace: null }
  | { status: "ready"; message: ""; workspace: MerchantWorkspaceSnapshot; loadedAt: number }
  | { status: "unavailable"; message: string; workspace: null };

export interface MerchantActionData {
  ok: boolean;
  intent: string;
  message: string;
}

export function merchantRouteHeaders() {
  return PRIVATE_HEADERS;
}

function clients(request: Request, responseHeaders?: Headers) {
  const http = createServerHttpClient({
    request,
    ...(responseHeaders ? { responseHeaders } : {}),
  });
  return {
    session: createHttpSession(http),
    workspace: createHttpMerchantWorkspace(http),
  };
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function optionalText(form: FormData, name: string) {
  const value = formText(form, name);
  return value ? value : undefined;
}

function nullableDate(form: FormData, name: string) {
  const value = formText(form, name);
  return value ? value : null;
}

function nullableNumber(form: FormData, name: string) {
  const value = formText(form, name).trim();
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function errorStatus(error: unknown) {
  if (!isApplicationError(error)) return 500;
  return error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
}

function merchantErrorMessage(error: unknown, fallback: string) {
  if (!isApplicationError(error)) return fallback;
  if (error.kind === "unauthorized") return "Сессия завершена. Войдите снова.";
  if (error.kind === "forbidden") return "У этого аккаунта нет доступа к кабинету ресторатора.";
  if (error.kind === "rate-limited") return "Слишком много запросов. Повторите попытку немного позже.";
  if (error.kind === "unavailable") return "Кабинет временно недоступен. Попробуйте ещё раз.";
  if (error.kind === "validation" || error.kind === "conflict" || error.kind === "not-found") {
    return error.message;
  }
  return fallback;
}

function mutationResponse(intent: string, message: string, headers: Headers) {
  return data<MerchantActionData>({ ok: true, intent, message }, { headers });
}

function mutationError(intent: string, error: unknown, fallback: string, headers: Headers) {
  return data<MerchantActionData>({
    ok: false,
    intent,
    message: merchantErrorMessage(error, fallback),
  }, {
    status: errorStatus(error),
    headers,
  });
}

export async function loadMerchantRoute(request: Request) {
  if (new URL(request.url).pathname === "/merchant") {
    return redirect("/merchant/overview", { headers: PRIVATE_HEADERS });
  }
  try {
    const workspace = await clients(request).workspace.load();
    return data<MerchantLoaderData>({ status: "ready", message: "", workspace, loadedAt: Date.now() }, {
      headers: PRIVATE_HEADERS,
    });
  } catch (error) {
    if (isApplicationError(error) && (error.kind === "unauthorized" || error.kind === "forbidden")) {
      return data<MerchantLoaderData>({
        status: "anonymous",
        message: error.kind === "forbidden"
          ? "У этого аккаунта нет доступа к кабинету ресторатора."
          : "",
        workspace: null,
      }, {
        status: 200,
        headers: PRIVATE_HEADERS,
      });
    }
    return data<MerchantLoaderData>({
      status: "unavailable",
      message: merchantErrorMessage(error, "Не удалось загрузить кабинет ресторатора."),
      workspace: null,
    }, {
      status: 503,
      headers: PRIVATE_HEADERS,
    });
  }
}

function menuDraft(form: FormData): MenuItemDraft {
  const section = optionalText(form, "section");
  const description = optionalText(form, "description");
  const photoUrl = optionalText(form, "photoUrl");
  return {
    title: formText(form, "title"),
    price: nullableNumber(form, "price"),
    isAvailable: formText(form, "isAvailable") !== "false",
    sortOrder: Number(formText(form, "sortOrder") || 0),
    ...(section === undefined ? {} : { section }),
    ...(description === undefined ? {} : { description }),
    ...(photoUrl === undefined ? {} : { photoUrl }),
  };
}

function promotionDraft(form: FormData): PromotionDraft {
  const status = formText(form, "status");
  const description = optionalText(form, "description");
  const startsAt = optionalText(form, "startsAtIso") ?? nullableDate(form, "startsAt");
  const endsAt = optionalText(form, "endsAtIso") ?? nullableDate(form, "endsAt");
  return {
    title: formText(form, "title"),
    startsAt,
    endsAt,
    status: status === "active" || status === "archived" ? status : "draft",
    ...(description === undefined ? {} : { description }),
  };
}

function venuePatch(form: FormData): VenuePatch {
  return {
    title: formText(form, "title"),
    category: formText(form, "category"),
    cuisine: formText(form, "cuisine"),
    description: formText(form, "description"),
    address: formText(form, "address"),
    phone: formText(form, "phone"),
    website: formText(form, "website"),
    hours: formText(form, "hours"),
    averageCheck: formText(form, "averageCheck"),
    features: form.getAll("features").filter((value): value is string => typeof value === "string"),
  };
}

export async function performMerchantAction(request: Request) {
  const form = await request.formData();
  const intent = formText(form, "intent");
  const responseHeaders = new Headers(PRIVATE_HEADERS);
  const api = clients(request, responseHeaders);

  try {
    switch (intent) {
      case "merchant.login": {
        const user = await api.session.signIn({
          login: formText(form, "login"),
          password: formText(form, "password"),
        });
        if (user.role !== "merchant") {
          await api.session.signOut();
          return data<MerchantActionData>({
            ok: false,
            intent,
            message: "У этого аккаунта нет доступа к кабинету ресторатора.",
          }, {
            status: 403,
            headers: responseHeaders,
          });
        }
        return redirect("/merchant/overview", { headers: responseHeaders });
      }
      case "merchant.logout":
        await api.session.signOut();
        return redirect("/merchant", { headers: responseHeaders });
      case "merchant.password":
        await api.session.changePassword({
          password: formText(form, "password"),
          ...(formText(form, "currentPassword")
            ? { currentPassword: formText(form, "currentPassword") }
            : {}),
        });
        return mutationResponse(intent, "Новый пароль сохранён.", responseHeaders);
      case "venue.update":
        await api.workspace.execute({
          type: "venue.update",
          venueId: formText(form, "venueId"),
          patch: venuePatch(form),
        });
        return mutationResponse(intent, "Карточка заведения обновлена.", responseHeaders);
      case "menu.create":
      case "menu.update":
        await api.workspace.execute({
          type: "menu.save",
          command: intent === "menu.create"
            ? { kind: "create", venueId: formText(form, "venueId"), draft: menuDraft(form) }
            : { kind: "update", id: formText(form, "id"), draft: menuDraft(form) },
        });
        return mutationResponse(intent, "Позиция меню сохранена.", responseHeaders);
      case "menu.delete":
        await api.workspace.execute({ type: "menu.delete", id: formText(form, "id") });
        return mutationResponse(intent, "Позиция удалена.", responseHeaders);
      case "promotion.create":
      case "promotion.update":
        await api.workspace.execute({
          type: "promotion.save",
          command: intent === "promotion.create"
            ? { kind: "create", venueId: formText(form, "venueId"), draft: promotionDraft(form) }
            : { kind: "update", id: formText(form, "id"), draft: promotionDraft(form) },
        });
        return mutationResponse(intent, "Акция сохранена.", responseHeaders);
      case "promotion.delete":
        await api.workspace.execute({ type: "promotion.delete", id: formText(form, "id") });
        return mutationResponse(intent, "Акция удалена.", responseHeaders);
      default:
        return data<MerchantActionData>({
          ok: false,
          intent,
          message: "Неизвестное действие кабинета ресторатора.",
        }, {
          status: 400,
          headers: responseHeaders,
        });
    }
  } catch (error) {
    if (intent === "merchant.login" && isApplicationError(error) && error.kind === "unauthorized") {
      return data<MerchantActionData>({
        ok: false,
        intent,
        message: "Неверный логин или пароль.",
      }, {
        status: errorStatus(error),
        headers: responseHeaders,
      });
    }
    return mutationError(intent, error, "Не удалось сохранить изменения.", responseHeaders);
  }
}
