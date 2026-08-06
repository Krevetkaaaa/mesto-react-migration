import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadAuthRoute,
  loadProtectedAccountRoute,
  performAuthAction,
  safeAccountReturnTo,
} from "../../../app/modules/public-account.server";

const rawUser = {
  id: "10000000-0000-4000-8000-000000000001",
  username: "anna",
  name: "Анна",
  email: "anna@example.test",
  hasEmail: true,
  phone: "",
  role: "customer",
  status: "active",
  mustChangePassword: false,
};

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

function formRequest(path: string, body: Record<string, string>) {
  return new Request(`https://mesto.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://mesto.example",
      "Sec-Fetch-Site": "same-origin",
    },
    body: new URLSearchParams(body),
  });
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url;
  return typeof input === "string" ? input : input.href;
}

function assertResponse(value: unknown): asserts value is Response {
  if (!(value instanceof Response)) throw new Error("Expected response");
}

describe("public account server orchestration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads anonymous auth metadata and sanitizes return targets", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = new URL(requestUrl(input)).pathname;
      if (path === "/api/auth/session") return Promise.resolve(json({ message: "Authentication required" }, 401));
      if (path === "/api/auth/providers") return Promise.resolve(json({ email: true, google: false, yandex: true, vk: true }));
      return Promise.resolve(json({ message: "Unexpected path" }, 404));
    }));

    await expect(loadAuthRoute(new Request("https://mesto.example/login?returnTo=%2Ffavorites"))).resolves.toMatchObject({
      favorites: [],
      providers: { email: true, google: false, yandex: true, vk: true },
      returnTo: "/favorites",
      user: null,
    });
    expect(safeAccountReturnTo("https://evil.example/path")).toBe("/profile");
    expect(safeAccountReturnTo("//evil.example/path")).toBe("/profile");
    expect(safeAccountReturnTo("/venue/tihiy-sad?from=%2Fcatalog")).toBe("/venue/tihiy-sad?from=%2Fcatalog");
  });

  it("forwards same-origin proof and propagates the session cookie through a login redirect", async () => {
    const capturedHeaders: Headers[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      capturedHeaders.push(new Headers(init?.headers));
      return Promise.resolve(json(
        { authenticated: true, user: rawUser },
        200,
        { "Set-Cookie": "mesto_session=signed; Path=/; HttpOnly; SameSite=Lax" },
      ));
    }));

    const response = await performAuthAction(formRequest("/login", {
      login: "anna@example.test",
      password: "Password123",
      returnTo: "/favorites",
    }), "login");

    expect(response).toBeInstanceOf(Response);
    assertResponse(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/favorites");
    expect(response.headers.get("set-cookie")).toContain("mesto_session=signed");
    expect(capturedHeaders[0]?.get("origin")).toBe("https://mesto.example");
    expect(capturedHeaders[0]?.get("sec-fetch-site")).toBe("same-origin");
  });

  it("redirects anonymous protected requests without querying favorites", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input) => {
      paths.push(new URL(requestUrl(input)).pathname);
      return Promise.resolve(json({ message: "Authentication required" }, 401));
    }));

    const response = await loadProtectedAccountRoute(new Request("https://mesto.example/favorites?source=header"));
    expect(response).toBeInstanceOf(Response);
    assertResponse(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?returnTo=%2Ffavorites%3Fsource%3Dheader");
    expect(paths).toEqual(["/api/auth/session"]);
  });
});
