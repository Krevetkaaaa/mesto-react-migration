import { z, type ZodType } from "zod";

import {
  ApplicationError,
  isApplicationError,
  type ApplicationErrorKind,
} from "../lib/application-error";
import { isUuid } from "../lib/identifiers";

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type QueryScalar = string | number | boolean;
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export interface HttpRequest<T> {
  method?: HttpMethod;
  path: string;
  query?: Readonly<Record<string, QueryValue>>;
  body?: unknown;
  signal?: AbortSignal;
  schema: ZodType<T>;
}

export interface HttpClient {
  request<T>(request: HttpRequest<T>): Promise<T>;
}

interface ClientOptions {
  origin: string;
  fetch: typeof globalThis.fetch;
  credentials: RequestCredentials;
  forwardedHeaders: Headers;
  responseHeaders?: Headers;
}

export interface BrowserHttpClientOptions {
  origin?: string;
  fetch?: typeof globalThis.fetch;
}

export interface ServerHttpClientOptions {
  request: Pick<Request, "url" | "headers">;
  responseHeaders?: Headers;
  fetch?: typeof globalThis.fetch;
}

const errorPayloadSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
}).loose();

function statusKind(status: number): ApplicationErrorKind {
  if (status === 400 || status === 413 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate-limited";
  if (status === 408 || status === 502 || status === 503 || status === 504) return "unavailable";
  return "unknown";
}

function responseRequestId(response: Response) {
  const requestId = response.headers.get("x-request-id");
  return requestId && isUuid(requestId) ? requestId : undefined;
}

function retryAfterSeconds(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function responseError(response: Response, decoded: unknown) {
  const payload = errorPayloadSchema.safeParse(decoded);
  const message = payload.success && payload.data.message
    ? payload.data.message
    : `HTTP request failed with status ${response.status}`;
  const retryAfter = retryAfterSeconds(response.headers.get("retry-after"));
  const requestId = responseRequestId(response);
  return new ApplicationError(statusKind(response.status), message, {
    status: response.status,
    ...(payload.success && payload.data.code ? { code: payload.data.code } : {}),
    ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    ...(requestId === undefined ? {} : { requestId }),
  });
}

function appendQuery(url: URL, query: HttpRequest<unknown>["query"]) {
  if (!query) return;
  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) url.searchParams.append(key, String(value));
  }
}

function apiUrl(origin: string, request: HttpRequest<unknown>) {
  const base = new URL(origin);
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new ApplicationError("validation", "HTTP origin must use http or https");
  }
  if (request.path !== "/api" && !request.path.startsWith("/api/")) {
    throw new ApplicationError("validation", "Internal HTTP requests must target /api");
  }
  const url = new URL(request.path, base);
  if (url.origin !== base.origin) {
    throw new ApplicationError("validation", "Cross-origin HTTP requests are forbidden");
  }
  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
    throw new ApplicationError("validation", "Normalized HTTP path must remain under /api");
  }
  appendQuery(url, request.query);
  return url;
}

function responseCookies(headers: Headers) {
  const nodeHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof nodeHeaders.getSetCookie === "function") return nodeHeaders.getSetCookie();
  const cookie = headers.get("set-cookie");
  return cookie ? [cookie] : [];
}

class FetchHttpClient implements HttpClient {
  constructor(private readonly options: ClientOptions) {}

  async request<T>(request: HttpRequest<T>): Promise<T> {
    let url: URL;
    try {
      url = apiUrl(this.options.origin, request);
    } catch (error) {
      if (isApplicationError(error)) throw error;
      throw new ApplicationError("validation", "HTTP request URL is invalid", { cause: error });
    }
    const headers = new Headers(this.options.forwardedHeaders);
    headers.set("Accept", "application/json");
    const init: RequestInit = {
      method: request.method ?? "GET",
      credentials: this.options.credentials,
      headers,
      ...(request.signal ? { signal: request.signal } : {}),
    };
    if (request.body !== undefined) {
      headers.set("Content-Type", "application/json");
      try {
        const body = JSON.stringify(request.body);
        if (body === undefined) throw new TypeError("JSON body is not serializable");
        init.body = body;
      } catch (error) {
        throw new ApplicationError("validation", "HTTP request body is not serializable", {
          cause: error,
        });
      }
    }

    let response: Response;
    try {
      response = await this.options.fetch(url, init);
    } catch (error) {
      if (isApplicationError(error)) throw error;
      throw new ApplicationError("unavailable", "HTTP service is unavailable", {
        cause: error,
      });
    }

    if (this.options.responseHeaders) {
      for (const cookie of responseCookies(response.headers)) {
        this.options.responseHeaders.append("Set-Cookie", cookie);
      }
    }

    let body: string;
    try {
      body = await response.text();
    } catch (error) {
      const requestId = responseRequestId(response);
      throw new ApplicationError("unavailable", "HTTP response body could not be read", {
        status: response.status,
        cause: error,
        ...(requestId === undefined ? {} : { requestId }),
      });
    }
    let decoded: unknown;
    try {
      decoded = body ? JSON.parse(body) : undefined;
    } catch (error) {
      if (response.ok) {
        const requestId = responseRequestId(response);
        throw new ApplicationError("unavailable", "HTTP service returned invalid JSON", {
          status: response.status,
          cause: error,
          ...(requestId === undefined ? {} : { requestId }),
        });
      }
      decoded = undefined;
    }

    if (!response.ok) throw responseError(response, decoded);

    const parsed = request.schema.safeParse(decoded);
    if (!parsed.success) {
      const requestId = responseRequestId(response);
      throw new ApplicationError("unavailable", "HTTP response failed runtime validation", {
        status: response.status,
        cause: parsed.error,
        ...(requestId === undefined ? {} : { requestId }),
      });
    }
    return parsed.data;
  }
}

function browserOrigin() {
  if (typeof window === "undefined") {
    throw new ApplicationError("unknown", "Browser HTTP client requires a browser origin");
  }
  return window.location.origin;
}

export function createBrowserHttpClient(
  options: BrowserHttpClientOptions = {},
): HttpClient {
  return new FetchHttpClient({
    origin: options.origin ?? browserOrigin(),
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    credentials: "same-origin",
    forwardedHeaders: new Headers(),
  });
}

function serverForwardedHeaders(incomingHeaders: HeadersInit) {
  const incoming = new Headers(incomingHeaders);
  const forwarded = new Headers();
  const cookie = incoming.get("cookie");
  const language = incoming.get("accept-language");
  const origin = incoming.get("origin");
  const protectionBypass = incoming.get("x-vercel-protection-bypass");
  const requestId = incoming.get("x-request-id");
  const fetchSite = incoming.get("sec-fetch-site");
  if (cookie) forwarded.set("Cookie", cookie);
  if (language) forwarded.set("Accept-Language", language);
  if (origin && origin.length <= 2_048) forwarded.set("Origin", origin);
  if (fetchSite && fetchSite.length <= 32) forwarded.set("Sec-Fetch-Site", fetchSite);
  if (protectionBypass && protectionBypass.length <= 2_048) {
    forwarded.set("X-Vercel-Protection-Bypass", protectionBypass);
  }
  if (requestId && isUuid(requestId)) {
    forwarded.set("X-Request-ID", requestId);
  }
  return forwarded;
}

export function createServerHttpClient(options: ServerHttpClientOptions): HttpClient {
  return new FetchHttpClient({
    origin: new URL(options.request.url).origin,
    fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
    credentials: "omit",
    forwardedHeaders: serverForwardedHeaders(options.request.headers),
    ...(options.responseHeaders ? { responseHeaders: options.responseHeaders } : {}),
  });
}
