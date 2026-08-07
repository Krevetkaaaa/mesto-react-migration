import { data, redirect } from "react-router";

import { createHttpAdminConsole } from "../adapters/admin-console-http";
import { createServerHttpClient } from "../adapters/http";
import { isApplicationError } from "../lib/application-error";
import type { MembershipRole, MerchantAccount, OneTimeCredentials } from "../lib/domain";
import type { AdminVenueDraft, AdminWorkspaceSnapshot } from "./admin-console";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
  Vary: "Cookie",
} as const;

export type AdminLoaderData =
  | { status: "anonymous"; message: string; workspace: null }
  | { status: "ready"; message: ""; workspace: AdminRouteWorkspace }
  | { status: "unavailable"; message: string; workspace: null };

export type AdminRouteWorkspace = Omit<AdminWorkspaceSnapshot, "merchants"> & {
  merchants:
    | { status: "ready"; items: readonly MerchantAccount[] }
    | { status: "unavailable"; error: { message: string } };
};

export interface AdminActionData {
  ok: boolean;
  intent: string;
  message: string;
  credentials?: OneTimeCredentials;
  credentialContext?: {
    name: string;
    email: string;
  };
}

export function adminRouteHeaders() {
  return PRIVATE_HEADERS;
}

function consoleFor(request: Request, responseHeaders?: Headers) {
  return createHttpAdminConsole(createServerHttpClient({
    request,
    ...(responseHeaders ? { responseHeaders } : {}),
  }));
}

function formText(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function optionalText(form: FormData, name: string) {
  const value = formText(form, name).trim();
  return value ? value : undefined;
}

function formTexts(form: FormData, name: string) {
  return form.getAll(name).filter((value): value is string => typeof value === "string");
}

function membershipRole(form: FormData): MembershipRole {
  const role = formText(form, "membershipRole");
  return role === "manager" || role === "content_editor" || role === "analyst" ? role : "owner";
}

function venueDraft(form: FormData): AdminVenueDraft {
  const source = formText(form, "source");
  const status = formText(form, "status");
  const slug = optionalText(form, "slug");
  const cuisine = optionalText(form, "cuisine");
  const address = optionalText(form, "address");
  const phone = optionalText(form, "phone");
  const website = optionalText(form, "website");
  const hours = optionalText(form, "hours");
  const averageCheck = optionalText(form, "averageCheck");
  return {
    title: formText(form, "title"),
    city: formText(form, "city"),
    category: formText(form, "category"),
    description: formText(form, "description"),
    ...(slug ? { slug } : {}),
    ...(cuisine ? { cuisine } : {}),
    ...(address ? { address } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    ...(hours ? { hours } : {}),
    ...(averageCheck ? { averageCheck } : {}),
    features: formTexts(form, "features"),
    photos: formTexts(form, "photos"),
    source: source === "community" || source === "merchant" ? source : "editorial",
    status: status === "draft" || status === "archived" ? status : "published",
  };
}

function errorStatus(error: unknown) {
  if (!isApplicationError(error)) return 500;
  return error.status && error.status >= 400 && error.status < 600 ? error.status : 500;
}

function adminErrorMessage(error: unknown, fallback: string) {
  if (!isApplicationError(error)) return fallback;
  if (error.kind === "unauthorized") return "Сессия администратора завершена. Войдите снова.";
  if (error.kind === "forbidden") return "У этого аккаунта нет доступа к административной панели.";
  if (error.kind === "rate-limited") return "Слишком много запросов. Повторите попытку немного позже.";
  if (error.kind === "unavailable") return "Административная панель временно недоступна. Попробуйте ещё раз.";
  if (error.kind === "validation" || error.kind === "conflict" || error.kind === "not-found") return error.message;
  return fallback;
}

function success(intent: string, message: string, headers: Headers, extra: Partial<AdminActionData> = {}) {
  return data<AdminActionData>({ ok: true, intent, message, ...extra }, { headers });
}

function failure(intent: string, error: unknown, fallback: string, headers: Headers) {
  return data<AdminActionData>({
    ok: false,
    intent,
    message: adminErrorMessage(error, fallback),
  }, {
    status: errorStatus(error),
    headers,
  });
}

export async function loadAdminRoute(request: Request) {
  if (new URL(request.url).pathname === "/admin") {
    return redirect("/admin/overview", { headers: PRIVATE_HEADERS });
  }

  const admin = consoleFor(request);
  try {
    const session = await admin.currentSession();
    if (session.status === "anonymous") {
      return data<AdminLoaderData>({ status: "anonymous", message: "", workspace: null }, {
        headers: PRIVATE_HEADERS,
      });
    }
    const workspace = await admin.load();
    const serializableWorkspace: AdminRouteWorkspace = workspace.merchants.status === "ready"
      ? workspace
      : {
          ...workspace,
          merchants: {
            status: "unavailable",
            error: { message: "Рестораторы временно недоступны." },
          },
        };
    return data<AdminLoaderData>({ status: "ready", message: "", workspace: serializableWorkspace }, {
      headers: PRIVATE_HEADERS,
    });
  } catch (error) {
    if (isApplicationError(error) && (error.kind === "unauthorized" || error.kind === "forbidden")) {
      return data<AdminLoaderData>({
        status: "anonymous",
        message: error.kind === "forbidden" ? "У этого аккаунта нет доступа к административной панели." : "",
        workspace: null,
      }, { headers: PRIVATE_HEADERS });
    }
    return data<AdminLoaderData>({
      status: "unavailable",
      message: adminErrorMessage(error, "Не удалось загрузить административную панель."),
      workspace: null,
    }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function performAdminAction(request: Request) {
  const form = await request.formData();
  const intent = formText(form, "intent");
  const responseHeaders = new Headers(PRIVATE_HEADERS);
  const admin = consoleFor(request, responseHeaders);

  try {
    switch (intent) {
      case "admin.login":
        await admin.signIn({ login: formText(form, "login"), password: formText(form, "password") });
        return redirect("/admin/overview", { headers: responseHeaders });
      case "admin.logout":
        await admin.signOut();
        return redirect("/admin", { headers: responseHeaders });
      case "submission.approve":
      case "submission.reject":
      case "review.approve":
      case "review.reject": {
        const target = intent.startsWith("submission") ? "submission" : "review";
        const decision = intent.endsWith("approve") ? "approved" : "rejected";
        await admin.execute({
          type: "moderate",
          command: { target, decision, id: formText(form, "id"), note: formText(form, "note") },
        });
        const message = target === "submission"
          ? decision === "approved" ? "Заявка одобрена и опубликована" : "Заявка отклонена"
          : decision === "approved" ? "Отзыв опубликован" : "Отзыв отклонён";
        return success(intent, message, responseHeaders);
      }
      case "venue.create":
      case "venue.update":
        await admin.execute({
          type: "venue.save",
          command: intent === "venue.create"
            ? { kind: "create", draft: venueDraft(form) }
            : { kind: "update", id: formText(form, "id"), draft: venueDraft(form) },
        });
        return success(intent, "Карточка заведения сохранена.", responseHeaders);
      case "venue.delete":
        await admin.execute({ type: "venue.delete", id: formText(form, "id") });
        return success(intent, "Карточка заведения удалена.", responseHeaders);
      case "merchant.create": {
        const email = optionalText(form, "email");
        const password = optionalText(form, "password");
        const result = await admin.execute({
          type: "merchant.create",
          command: {
            displayName: formText(form, "displayName"),
            username: formText(form, "username"),
            ...(email ? { email } : {}),
            ...(password ? { password } : {}),
            venueIds: formTexts(form, "venueIds"),
            membershipRole: membershipRole(form),
          },
        });
        if (result.type !== "merchant.created") throw new Error("Unexpected merchant result");
        return success(intent, "Аккаунт ресторатора создан.", responseHeaders, {
          credentials: result.value.credentials,
          credentialContext: {
            name: formText(form, "displayName"),
            email: formText(form, "email"),
          },
        });
      }
      case "merchant.update":
        await admin.execute({
          type: "merchant.update",
          command: {
            userId: formText(form, "userId"),
            displayName: formText(form, "displayName"),
            assignments: {
              venueIds: formTexts(form, "venueIds"),
              membershipRole: membershipRole(form),
            },
          },
        });
        return success(intent, "Аккаунт ресторатора обновлён.", responseHeaders);
      case "merchant.status": {
        const status = formText(form, "status") === "suspended" ? "suspended" : "active";
        await admin.execute({ type: "merchant.status", userId: formText(form, "userId"), status });
        return success(intent, status === "active" ? "Доступ восстановлен." : "Доступ приостановлен.", responseHeaders);
      }
      case "merchant.password.reset": {
        const password = optionalText(form, "password");
        const result = await admin.execute({
          type: "merchant.password.reset",
          userId: formText(form, "userId"),
          ...(password ? { password } : {}),
        });
        if (result.type !== "merchant.password.reset") throw new Error("Unexpected password reset result");
        return success(intent, result.warning
          ? "Пароль изменён, но отзыв прежних сессий не подтверждён. Проверьте состояние аккаунта."
          : "Временный пароль создан.", responseHeaders, {
          credentials: result.credentials,
          credentialContext: { name: formText(form, "displayName"), email: formText(form, "email") },
        });
      }
      default:
        return data<AdminActionData>({ ok: false, intent, message: "Неизвестное действие административной панели." }, {
          status: 400,
          headers: responseHeaders,
        });
    }
  } catch (error) {
    if (intent === "admin.login" && isApplicationError(error) && error.kind === "unauthorized") {
      return data<AdminActionData>({ ok: false, intent, message: "Неверный логин или пароль." }, {
        status: errorStatus(error),
        headers: responseHeaders,
      });
    }
    return failure(intent, error, "Не удалось сохранить изменения.", responseHeaders);
  }
}
