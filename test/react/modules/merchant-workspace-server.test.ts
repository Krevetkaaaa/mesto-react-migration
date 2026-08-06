import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadMerchantRoute,
  performMerchantAction,
} from "../../../app/modules/merchant-workspace.server";

const merchantId = "20000000-0000-4000-8000-000000000001";
const venueId = "30000000-0000-4000-8000-000000000001";

const merchantUser = {
  id: merchantId,
  username: "merchant.owner",
  name: "Мария",
  email: "merchant@example.test",
  hasEmail: true,
  phone: "",
  role: "merchant",
  status: "active",
  mustChangePassword: false,
};

const venue = {
  id: venueId,
  slug: "quiet-garden",
  title: "Тихий сад",
  city: "Симферополь",
  category: "Ресторан",
  cuisine: "Европейская",
  description: "Описание",
  address: "Улица, 1",
  phone: "",
  website: "",
  hours: "10:00–22:00",
  average_check: "1 200 ₽",
  features: ["Wi-Fi"],
  photos: ["https://images.example.test/venue.jpg"],
  source: "editorial",
  status: "published",
  created_at: null,
  updated_at: null,
};

const dashboard = {
  user: merchantUser,
  venues: [venue],
  memberships: [{ user_id: merchantId, venue_id: venueId, membership_role: "owner" }],
  menu: [],
  promotions: [],
  reviews: [],
  stats: { venues: 1, menuItems: 0, activePromotions: 0, reviews: 0 },
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
      Cookie: "mesto_session=signed",
      Origin: "https://mesto.example",
      "Sec-Fetch-Site": "same-origin",
    },
    body: new URLSearchParams(body),
  });
}

function requestPath(input: RequestInfo | URL) {
  const url = input instanceof Request
    ? input.url
    : typeof input === "string"
      ? input
      : input.href;
  return new URL(url).pathname;
}

function assertResponse(value: unknown): asserts value is Response {
  if (!(value instanceof Response)) throw new Error("Expected response");
}

async function responseLike(value: unknown) {
  if (value instanceof Response) {
    const responseData = await value.json() as unknown;
    return {
      data: responseData,
      headers: value.headers,
      status: value.status,
    };
  }
  const result = value as {
    data?: unknown;
    init?: { headers?: HeadersInit; status?: number };
  };
  return {
    data: result.data,
    headers: new Headers(result.init?.headers),
    status: result.init?.status ?? 200,
  };
}

describe("merchant workspace server orchestration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("canonicalizes /merchant before querying private workspace data", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const response = await loadMerchantRoute(new Request("https://mesto.example/merchant"));
    assertResponse(response);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/merchant/overview");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the merchant login guard for anonymous protected routes", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ message: "Authentication required" }, 401)));
    const response = await responseLike(await loadMerchantRoute(new Request("https://mesto.example/merchant/menu")));
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ status: "anonymous", message: "", workspace: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("loads and runtime-validates one authoritative workspace snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(dashboard)));
    const response = await responseLike(await loadMerchantRoute(new Request("https://mesto.example/merchant/overview", {
      headers: { Cookie: "mesto_session=signed" },
    })));
    expect(response.status).toBe(200);
    expect(typeof (response.data as { loadedAt?: unknown }).loadedAt).toBe("number");
    expect(response.data).toMatchObject({
      status: "ready",
      workspace: {
        user: { role: "merchant" },
        venues: [{ id: venueId, averageCheck: "1 200 ₽" }],
      },
    });
  });

  it("rejects a customer login and clears the newly issued session", async () => {
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestPath(input);
      paths.push(path);
      if (path === "/api/auth/login") {
        return Promise.resolve(json({
          authenticated: true,
          user: { ...merchantUser, role: "customer" },
        }, 200, { "Set-Cookie": "mesto_session=customer; Path=/; HttpOnly" }));
      }
      return Promise.resolve(json({ ok: true }, 200, {
        "Set-Cookie": "mesto_session=; Path=/; HttpOnly; Max-Age=0",
      }));
    }));

    const response = await responseLike(await performMerchantAction(formRequest("/merchant", {
      intent: "merchant.login",
      login: "anna@example.test",
      password: "Password123",
    })));
    expect(response.status).toBe(403);
    expect(response.data).toMatchObject({ ok: false, intent: "merchant.login" });
    expect(paths).toEqual(["/api/auth/login", "/api/auth/logout"]);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("dispatches a venue draft through the typed workspace adapter", async () => {
    let capturedBody: unknown;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      capturedBody = JSON.parse(init.body) as unknown;
      return Promise.resolve(json({ venue: { ...venue, title: "Новый сад" } }));
    }));

    const response = await responseLike(await performMerchantAction(formRequest("/merchant", {
      intent: "venue.update",
      venueId,
      title: " Новый сад ",
      category: "Ресторан",
      cuisine: "Европейская",
      description: "Описание",
      address: "Улица, 1",
      phone: "",
      website: "https://example.test",
      hours: "10:00–22:00",
      averageCheck: "1 200 ₽",
      features: "Wi-Fi",
    })));
    expect(response.status).toBe(200);
    expect(capturedBody).toMatchObject({
      id: venueId,
      title: "Новый сад",
      features: ["Wi-Fi"],
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("prefers browser-normalized promotion timestamps over server-local datetime values", async () => {
    let capturedBody: unknown;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
      capturedBody = JSON.parse(init.body) as unknown;
      return Promise.resolve(json({
        promotion: {
          id: "60000000-0000-4000-8000-000000000002",
          venue_id: venueId,
          title: "Ужин в саду",
          description: "Сезонное предложение",
          starts_at: "2026-08-10T09:00:00.000Z",
          ends_at: "2026-08-31T19:00:00.000Z",
          status: "active",
        },
      }));
    }));

    const response = await responseLike(await performMerchantAction(formRequest("/merchant", {
      intent: "promotion.create",
      venueId,
      title: "Ужин в саду",
      description: "Сезонное предложение",
      startsAt: "2026-08-10T12:00",
      startsAtIso: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-31T22:00",
      endsAtIso: "2026-08-31T19:00:00.000Z",
      status: "active",
    })));

    expect(response.status).toBe(200);
    expect(capturedBody).toMatchObject({
      startsAt: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-31T19:00:00.000Z",
    });
  });
});
