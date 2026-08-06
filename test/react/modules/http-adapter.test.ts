import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createBrowserHttpClient,
  createServerHttpClient,
} from "../../../app/adapters/http";
import { ApplicationError } from "../../../app/lib/application-error";

function jsonResponse(
  body: unknown,
  options: { status?: number; headers?: HeadersInit } = {},
) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers,
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url;
  return String(input);
}

describe("typed HTTP adapter", () => {
  it("uses same-origin browser credentials and serializes query/body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: fetchMock,
    });

    await client.request({
      method: "POST",
      path: "/api/example",
      query: { city: "Ялта", tag: ["a", "b"], omitted: undefined },
      body: { title: "Место" },
      schema: z.object({ ok: z.literal(true) }),
    });

    const [input, init] = fetchMock.mock.calls[0]!;
    const url = new URL(requestUrl(input));
    expect(url.origin).toBe("https://mesto.example");
    expect(url.pathname).toBe("/api/example");
    expect(url.searchParams.get("city")).toBe("Ялта");
    expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(init?.body).toBe(JSON.stringify({ title: "Место" }));
  });

  it("forwards only the SSR request allowlist and requires a UUID request id", async () => {
    const captured: Headers[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      captured.push(new Headers(init?.headers));
      return Promise.resolve(jsonResponse({ ok: true }));
    });
    const validRequestId = "10000000-0000-4000-8000-000000000001";
    const client = createServerHttpClient({
      request: new Request("https://mesto.example/catalog", {
        headers: {
          Cookie: "mesto_session=signed",
          "Accept-Language": "ru-RU",
          Origin: "https://mesto.example",
          "Sec-Fetch-Site": "same-origin",
          "X-Request-ID": validRequestId,
          Authorization: "Bearer must-not-leak",
          "X-Arbitrary": "must-not-leak",
        },
      }),
      fetch: fetchMock,
    });

    await client.request({ path: "/api/example", schema: z.object({ ok: z.literal(true) }) });

    expect(captured[0]?.get("cookie")).toBe("mesto_session=signed");
    expect(captured[0]?.get("accept-language")).toBe("ru-RU");
    expect(captured[0]?.get("origin")).toBe("https://mesto.example");
    expect(captured[0]?.get("sec-fetch-site")).toBe("same-origin");
    expect(captured[0]?.get("x-request-id")).toBe(validRequestId);
    expect(captured[0]?.get("authorization")).toBeNull();
    expect(captured[0]?.get("x-arbitrary")).toBeNull();

    const invalidIdHeaders: Headers[] = [];
    const invalidClient = createServerHttpClient({
      request: new Request("https://mesto.example/catalog", {
        headers: { "X-Request-ID": "trace-but-not-a-uuid" },
      }),
      fetch: vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        invalidIdHeaders.push(new Headers(init?.headers));
        return Promise.resolve(jsonResponse({ ok: true }));
      }),
    });
    await invalidClient.request({ path: "/api/example", schema: z.object({ ok: z.literal(true) }) });
    expect(invalidIdHeaders[0]?.get("x-request-id")).toBeNull();
  });

  it("derives the SSR target origin from the authoritative request", async () => {
    let capturedUrl = "";
    let capturedCookie: string | null = null;
    const options = {
      request: new Request("https://mesto.example/catalog", {
        headers: { Cookie: "mesto_session=signed", Host: "evil.example" },
      }),
      origin: "https://evil.example",
      fetch: vi.fn<typeof fetch>().mockImplementation((input, init) => {
        capturedUrl = requestUrl(input);
        capturedCookie = new Headers(init?.headers).get("cookie");
        return Promise.resolve(jsonResponse({ ok: true }));
      }),
    };
    const client = createServerHttpClient(options);

    await client.request({ path: "/api/example", schema: z.object({ ok: z.literal(true) }) });

    expect(new URL(capturedUrl).origin).toBe("https://mesto.example");
    expect(capturedCookie).toBe("mesto_session=signed");
  });

  it("copies every Set-Cookie to the SSR sink and no other response header", async () => {
    const responseHeaders = new Headers();
    responseHeaders.append("Set-Cookie", "mesto_session=one; Path=/; HttpOnly");
    responseHeaders.append("Set-Cookie", "mesto_aux=two; Path=/; HttpOnly");
    responseHeaders.set("X-Internal", "must-not-propagate");
    const sink = new Headers();
    const client = createServerHttpClient({
      request: new Request("https://mesto.example/login"),
      responseHeaders: sink,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, {
        headers: responseHeaders,
      })),
    });

    await client.request({ path: "/api/auth/login", schema: z.object({ ok: z.literal(true) }) });

    expect(sink.getSetCookie()).toEqual([
      "mesto_session=one; Path=/; HttpOnly",
      "mesto_aux=two; Path=/; HttpOnly",
    ]);
    expect(sink.get("x-internal")).toBeNull();
  });

  it.each([
    [400, "validation"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [429, "rate-limited"],
    [503, "unavailable"],
    [405, "unknown"],
    [500, "unknown"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    const requestId = "10000000-0000-4000-8000-000000000009";
    const client = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(
        { message: "Mapped failure", code: "FAILURE" },
        { status, headers: { "Retry-After": "12", "X-Request-ID": requestId } },
      )),
    });

    await expect(client.request({
      path: "/api/example",
      schema: z.object({ ok: z.boolean() }),
    })).rejects.toMatchObject({
      name: "ApplicationError",
      kind,
      status,
      code: "FAILURE",
      requestId,
      retryAfterSeconds: 12,
    });
  });

  it("normalizes network, invalid JSON, invalid schema and body-read failures", async () => {
    const schema = z.object({ ok: z.literal(true) });
    const network = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("socket closed")),
    });
    await expect(network.request({ path: "/api/example", schema })).rejects.toMatchObject({
      kind: "unavailable",
    });

    const invalidJson = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json")),
    });
    await expect(invalidJson.request({ path: "/api/example", schema })).rejects.toMatchObject({
      kind: "unavailable",
      message: "HTTP service returned invalid JSON",
    });

    const invalidSchema = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: false })),
    });
    await expect(invalidSchema.request({ path: "/api/example", schema })).rejects.toMatchObject({
      kind: "unavailable",
      message: "HTTP response failed runtime validation",
    });

    const failedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("stream failed"));
      },
    });
    const unreadable = createBrowserHttpClient({
      origin: "https://mesto.example",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(failedBody)),
    });
    await expect(unreadable.request({ path: "/api/example", schema })).rejects.toMatchObject({
      kind: "unavailable",
      message: "HTTP response body could not be read",
    });
  });

  it("normalizes invalid URL/path and JSON serialization failures", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const invalidOrigin = createBrowserHttpClient({ origin: "not a URL", fetch: fetchMock });
    await expect(invalidOrigin.request({
      path: "/api/example",
      schema: z.unknown(),
    })).rejects.toBeInstanceOf(ApplicationError);

    const traversal = createBrowserHttpClient({ origin: "https://mesto.example", fetch: fetchMock });
    await expect(traversal.request({
      path: "/api/../outside",
      schema: z.unknown(),
    })).rejects.toMatchObject({ kind: "validation" });

    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(traversal.request({
      method: "POST",
      path: "/api/example",
      body: circular,
      schema: z.unknown(),
    })).rejects.toMatchObject({ kind: "validation" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
