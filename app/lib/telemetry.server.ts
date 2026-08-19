import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERCEL_ID_PATTERN = /^[A-Za-z0-9:._-]{1,160}$/u;
let firstInvocation = true;
const STATIC_ROUTES = new Set([
  "/",
  "/__react/health",
  "/catalog",
  "/favorites",
  "/help",
  "/login",
  "/profile",
  "/register",
  "/robots.txt",
  "/sitemap.xml",
]);

function telemetryEnabled() {
  return process.env.VERCEL === "1" || process.env.MESTO_TELEMETRY_LOGS === "1";
}

function routeTemplate(pathname: string) {
  if (pathname.startsWith("/city/")) return "/city/[citySlug]";
  if (pathname.startsWith("/venue/")) return "/venue/[venueSlug]";
  if (pathname.startsWith("/merchant/")) return "/merchant/[view]";
  if (pathname.startsWith("/admin/")) return "/admin/[view]";
  return STATIC_ROUTES.has(pathname) ? pathname : "/[unmatched]";
}

function safeProviderId(value: string | null) {
  return value && VERCEL_ID_PATTERN.test(value) ? value : undefined;
}

function write(level: "info" | "error", details: Record<string, unknown>) {
  if (!telemetryEnabled()) return;
  const output = JSON.stringify({ level, ...details });
  if (level === "error") console.error(output);
  else console.log(output);
}

export function documentRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id");
  return incoming && UUID_PATTERN.test(incoming) ? incoming : randomUUID();
}

export function beginDocumentRequest(request: Request, requestId: string) {
  const startedAt = performance.now();
  let finished = false;
  const coldStart = firstInvocation;
  firstInvocation = false;
  const parsed = new URL(request.url);
  const vercelId = safeProviderId(request.headers.get("x-vercel-id"));
  const base = {
    requestId,
    route: routeTemplate(parsed.pathname),
    method: request.method.toUpperCase(),
    ...(vercelId ? { vercelId } : {}),
  };
  write("info", { event: "ssr.request.start", coldStart, ...base });

  return {
    complete(status: number) {
      if (finished) return;
      finished = true;
      write("info", {
        event: "ssr.request.complete",
        ...base,
        status,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      });
    },
    fail(error: unknown, status = 500) {
      if (finished) return;
      finished = true;
      write("error", {
        event: "ssr.request.failed",
        ...base,
        status,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    },
  };
}

export function resetDocumentTelemetryForTests() {
  firstInvocation = true;
}

export const documentTelemetryInternals = { routeTemplate, safeProviderId };
