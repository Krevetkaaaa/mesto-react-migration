import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadAdminRoute,
  performAdminAction,
} from "../../../app/modules/admin-console.server";

const merchantId = "20000000-0000-4000-8000-000000000001";
const venueId = "30000000-0000-4000-8000-000000000001";

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function formRequest(body: Record<string, string | readonly string[]>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    const values: readonly string[] = typeof value === "string" ? [value] : value;
    for (const item of values) params.append(key, item);
  }
  return new Request("https://mesto.example/admin/merchants", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: "mesto_admin=signed",
      Origin: "https://mesto.example",
      "Sec-Fetch-Site": "same-origin",
    },
    body: params,
  });
}

function requestPath(input: RequestInfo | URL) {
  const url = input instanceof Request ? input.url : typeof input === "string" ? input : input.href;
  return new URL(url).pathname;
}

function assertResponse(value: unknown): asserts value is Response {
  if (!(value instanceof Response)) throw new Error("Expected response");
}

async function responseLike(value: unknown) {
  if (value instanceof Response) {
    return { data: await value.json() as unknown, headers: value.headers, status: value.status };
  }
  const result = value as { data?: unknown; init?: { headers?: HeadersInit; status?: number } };
  return {
    data: result.data,
    headers: new Headers(result.init?.headers),
    status: result.init?.status ?? 200,
  };
}

describe("admin console server orchestration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("canonicalizes /admin before querying private data", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await loadAdminRoute(new Request("https://mesto.example/admin"));
    assertResponse(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/overview");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the login guard for an anonymous route", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ message: "Authentication required" }, 401)));
    const response = await responseLike(await loadAdminRoute(new Request("https://mesto.example/admin/overview")));
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: "anonymous", message: "", workspace: null });
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("keeps the dashboard usable when only the merchant list is unavailable", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      paths.push(path);
      if (path === "/api/admin/session") {
        return Promise.resolve(json({ authenticated: true, user: { login: "editor", role: "admin" } }));
      }
      if (path === "/api/admin/dashboard") {
        return Promise.resolve(json({
          stats: { venues: 0, pendingVenues: 0, pendingReviews: 0, merchants: 0, cities: 0 },
          venues: [], submissions: [], reviews: [], databaseConfigured: true,
        }));
      }
      return Promise.resolve(json({ message: "Temporary failure" }, 503));
    }));

    const response = await responseLike(await loadAdminRoute(new Request("https://mesto.example/admin/overview", {
      headers: { Cookie: "mesto_admin=signed" },
    })));
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: "ready",
      workspace: {
        overview: { databaseConfigured: true },
        merchants: { status: "unavailable", error: { message: "Рестораторы временно недоступны." } },
      },
    });
    expect(paths).toEqual(["/api/admin/session", "/api/admin/dashboard", "/api/admin/merchants"]);
  });

  it("forwards a successful login cookie and redirects to the overview", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({
      user: { login: "editor", role: "admin" },
    }, 200, { "Set-Cookie": "mesto_admin=signed; Path=/; HttpOnly" })));
    const response = await performAdminAction(formRequest({
      intent: "admin.login", login: "editor", password: "AdminPass123",
    }));
    assertResponse(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/admin/overview");
    expect(response.headers.get("set-cookie")).toContain("mesto_admin=signed");
  });

  it("dispatches merchant creation and returns one-time credentials privately", async () => {
    let capturedBody: unknown;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected JSON body");
      capturedBody = JSON.parse(init.body) as unknown;
      return Promise.resolve(json({
        merchant: {
          id: merchantId,
          display_name: "Мария",
          username: "merchant.owner",
          email: "merchant@example.test",
          status: "active",
          created_at: null,
          last_login_at: null,
          memberships: [],
        },
        credentials: { login: "merchant.owner", password: "Temporary123" },
      }));
    }));

    const response = await responseLike(await performAdminAction(formRequest({
      intent: "merchant.create",
      displayName: "Мария",
      username: "merchant.owner",
      email: "merchant@example.test",
      venueIds: [venueId],
      membershipRole: "owner",
    })));
    expect(response.status).toBe(200);
    expect(capturedBody).toMatchObject({
      displayName: "Мария",
      username: "merchant.owner",
      venueIds: [venueId],
      membershipRole: "owner",
    });
    expect(response.data).toMatchObject({
      ok: true,
      intent: "merchant.create",
      credentials: { login: "merchant.owner", password: "Temporary123" },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });
});
