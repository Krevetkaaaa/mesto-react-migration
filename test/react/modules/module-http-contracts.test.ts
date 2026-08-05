import { describe, expect, it } from "vitest";

import { createHttpAdminConsole } from "../../../app/adapters/admin-console-http";
import { createHttpFavorites } from "../../../app/adapters/favorites-http";
import type { HttpClient, HttpRequest } from "../../../app/adapters/http";
import { createHttpMerchantWorkspace } from "../../../app/adapters/merchant-workspace-http";
import { createHttpSession } from "../../../app/adapters/session-http";
import { createHttpSubmissions } from "../../../app/adapters/submissions-http";
import { createHttpVenueCatalog } from "../../../app/adapters/venue-catalog-http";
import { ApplicationError } from "../../../app/lib/application-error";

const userId = "10000000-0000-4000-8000-000000000001";
const merchantId = "20000000-0000-4000-8000-000000000001";
const venueId = "30000000-0000-4000-8000-000000000001";
const menuId = "50000000-0000-4000-8000-000000000001";
const promotionId = "60000000-0000-4000-8000-000000000001";
const reviewId = "70000000-0000-4000-8000-000000000001";
const submissionId = "80000000-0000-4000-8000-000000000001";

const rawUser = {
  id: userId,
  username: "anna",
  name: "Анна",
  email: "anna@example.test",
  hasEmail: true,
  phone: "",
  role: "customer",
  status: "active",
  mustChangePassword: false,
};

const rawMerchantUser = {
  ...rawUser,
  id: merchantId,
  username: "merchant.owner",
  role: "merchant",
};

const rawVenue = {
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
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-02T00:00:00.000Z",
};

const rawMenuItem = {
  id: menuId,
  venue_id: venueId,
  section: "Основное меню",
  title: "Рыба",
  description: "",
  price: 1200,
  photo_url: "",
  is_available: true,
  sort_order: 1,
};

const rawPromotion = {
  id: promotionId,
  venue_id: venueId,
  title: "Сезонное меню",
  description: "",
  starts_at: null,
  ends_at: null,
  status: "active",
};

interface RecordedRequest {
  method: string;
  path: string;
  query: HttpRequest<unknown>["query"];
  body: unknown;
}

class RecordingHttpClient implements HttpClient {
  readonly requests: RecordedRequest[] = [];

  constructor(private readonly responses: unknown[]) {}

  async request<T>(request: HttpRequest<T>): Promise<T> {
    await Promise.resolve();
    this.requests.push({
      method: request.method ?? "GET",
      path: request.path,
      query: request.query,
      body: request.body,
    });
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return request.schema.parse(response);
  }
}

describe("HTTP module contracts", () => {
  it("maps every Session intent without leaking endpoint details to its public contract", async () => {
    const http = new RecordingHttpClient([
      {
        authenticated: true,
        user: rawUser,
        favorites: [{
          venue_key: "quiet-garden",
          venue_id: venueId,
          external_venue_id: null,
          snapshot: {},
          created_at: null,
        }],
      },
      { email: true, google: true, yandex: false, vk: true },
      { authenticated: true, user: rawUser },
      { authenticated: true, user: { ...rawUser, username: "test-user" } },
      { user: rawUser },
      { authenticated: true, user: rawUser },
      { ok: true },
    ]);
    const session = createHttpSession(http);

    await expect(session.current()).resolves.toMatchObject({
      status: "authenticated",
      favoriteKeys: ["quiet-garden"],
    });
    await session.providers();
    await session.signIn({ login: " ANNA ", password: "Password123" });
    await session.register({
      name: " Test User ",
      username: "Test User",
      email: "TEST@example.test",
      password: "Password123",
    });
    await session.changePassword({ password: "NewPassword123", currentPassword: "Password123" });
    await session.completeOAuth("google-access-token");
    await session.signOut();

    expect(http.requests.map((request) => request.path)).toEqual([
      "/api/auth/session",
      "/api/auth/providers",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/password",
      "/api/auth/oauth-session",
      "/api/auth/logout",
    ]);
    expect(http.requests[2]?.body).toEqual({ login: "anna", password: "Password123" });
    expect(http.requests[3]?.body).toMatchObject({ username: "test-user", email: "test@example.test" });
    expect(http.requests[5]?.body).toEqual({ accessToken: "google-access-token" });
    expect(session.oauthStartUrl("vk", "https://evil.example/path")).toBe(
      "/api/auth/oauth?provider=vk&returnTo=%2F",
    );
  });

  it("rejects an empty OAuth access token before transport", async () => {
    const http = new RecordingHttpClient([]);
    await expect(createHttpSession(http).completeOAuth("   ")).rejects.toMatchObject({
      kind: "validation",
    });
    expect(http.requests).toEqual([]);
  });

  it("maps catalog search/content and validates critical wire fields", async () => {
    const http = new RecordingHttpClient([
      {
        found: 1,
        skip: 10,
        results: 20,
        nextSkip: null,
        databaseConfigured: true,
        items: [{
          id: "mesto-quiet-garden",
          databaseId: venueId,
          name: "Тихий сад",
          city: "Симферополь",
          categories: ["Ресторан"],
        }],
      },
      { menu: [rawMenuItem], promotions: [rawPromotion] },
    ]);
    const catalog = createHttpVenueCatalog(http);

    await expect(catalog.search({
      query: "сад",
      city: "Симферополь",
      category: "Ресторан",
      offset: 10,
      limit: 20,
    })).resolves.toMatchObject({ total: 1, offset: 10, limit: 20 });
    await expect(catalog.content(venueId)).resolves.toMatchObject({
      menuItems: [{ id: menuId }],
      promotions: [{ id: promotionId, status: "active" }],
    });

    expect(http.requests[0]).toMatchObject({
      method: "GET",
      path: "/api/venues",
      query: {
        query: "сад",
        city: "Симферополь",
        category: "Ресторан",
        skip: 10,
        results: 20,
      },
    });
    expect(http.requests[1]).toMatchObject({
      path: "/api/venue-content",
      query: { venueId },
    });
  });

  it("normalizes catalog text and empty-search aliases before transport", async () => {
    const http = new RecordingHttpClient([{
      found: 0,
      skip: 0,
      results: 50,
      nextSkip: null,
      databaseConfigured: true,
      items: [],
    }]);

    await createHttpVenueCatalog(http).search({
      query: " \u0433\u0434\u0435 \u043f\u043e\u0435\u0441\u0442\u044c ",
      city: " Yalta<> ",
      category: " all ",
    });

    expect(http.requests[0]?.query).toEqual({ city: "Yalta", results: 50, skip: 0 });
  });

  it("maps Favorites and applies the same normalization as the backend", async () => {
    const rawFavorite = {
      venue_key: "quiet-garden",
      venue_id: venueId,
      external_venue_id: null,
      snapshot: { title: "Тихий сад", type: "Ресторан", rating: "5", image: "", text: "Текст" },
      created_at: "2026-08-01T00:00:00.000Z",
    };
    const http = new RecordingHttpClient([
      { favorites: [rawFavorite] },
      { favorite: rawFavorite },
      { ok: true },
    ]);
    const favorites = createHttpFavorites(http);

    await favorites.list();
    await favorites.save({
      venueKey: "  quiet<>garden  ",
      venueId: "not-a-uuid",
      snapshot: {
        title: " Тихий   сад ",
        type: "Ресторан",
        rating: "5",
        image: "/assets/not-accepted.jpg",
        text: "Текст",
      },
    });
    await favorites.remove("  quiet-garden  ");

    expect(http.requests[1]?.body).toMatchObject({
      venueKey: "quiet garden",
      venueId: null,
      snapshot: { title: "Тихий сад", image: "" },
    });
    expect(http.requests[2]).toMatchObject({
      method: "DELETE",
      path: "/api/favorites",
      body: { venueKey: "quiet-garden" },
    });
  });

  it("keeps image upload orchestration inside Submissions", async () => {
    const http = new RecordingHttpClient([
      { url: "https://storage.example.test/one.png" },
      { submission: { id: submissionId, status: "pending" } },
      { review: { id: reviewId, status: "pending" } },
    ]);
    const submissions = createHttpSubmissions(http);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

    await submissions.submitVenue({
      contactEmail: " PERSON@Example.TEST ",
      title: "Тихий сад",
      city: "Симферополь",
      category: "Ресторан",
      description: "Подробное описание",
      images: [{ name: "venue.png", type: "image/png", bytes: png }],
    });
    await submissions.submitReview({
      venueId,
      venueTitle: "Тихий сад",
      rating: 5,
      review: "Очень хорошее место для спокойного ужина.",
    });

    expect("uploadImage" in submissions).toBe(false);
    expect(http.requests.map((request) => request.path)).toEqual([
      "/api/uploads",
      "/api/submissions",
      "/api/reviews",
    ]);
    expect(http.requests[0]?.body).toMatchObject({
      name: "venue.png",
      type: "image/png",
      data: "data:image/png;base64,iVBORw0KGgoB",
    });
    expect(http.requests[1]?.body).toMatchObject({
      contactEmail: "person@example.test",
      photos: ["https://storage.example.test/one.png"],
    });
  });

  it("validates a supplied submission contact email before any request", async () => {
    const http = new RecordingHttpClient([]);
    const submissions = createHttpSubmissions(http);

    await expect(submissions.submitVenue({
      contactEmail: "not-an-email",
      title: "Venue",
      city: "City",
      category: "Cafe",
      description: "Detailed venue description",
    })).rejects.toMatchObject({ kind: "validation" });
    expect(http.requests).toEqual([]);
  });

  it("does not create a submission after an upload failure", async () => {
    const http = new RecordingHttpClient([
      { url: "https://storage.example.test/orphaned.png" },
      new ApplicationError("unavailable", "Second upload failed"),
    ]);
    const submissions = createHttpSubmissions(http);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

    await expect(submissions.submitVenue({
      title: "Тихий сад",
      city: "Симферополь",
      category: "Ресторан",
      description: "Подробное описание",
      images: [
        { name: "one.png", type: "image/png", bytes: png },
        { name: "two.png", type: "image/png", bytes: png },
      ],
    })).rejects.toMatchObject({ kind: "unavailable" });

    expect(http.requests.map((request) => request.path)).toEqual([
      "/api/uploads",
      "/api/uploads",
    ]);
  });

  it("rejects malformed critical UUIDs and coordinate tuples at runtime", async () => {
    const invalidCoordinates = new RecordingHttpClient([{
      found: 1,
      skip: 0,
      results: 50,
      nextSkip: null,
      databaseConfigured: true,
      items: [{ id: "mesto-invalid", databaseId: venueId, name: "Venue", coordinates: [34.1] }],
    }]);
    const invalidUuid = new RecordingHttpClient([{
      found: 1,
      skip: 0,
      results: 50,
      nextSkip: null,
      databaseConfigured: true,
      items: [{ id: "mesto-invalid", databaseId: "not-a-uuid", name: "Venue", coordinates: [] }],
    }]);

    await expect(createHttpVenueCatalog(invalidCoordinates).search()).rejects.toMatchObject({
      name: "ZodError",
    });
    await expect(createHttpVenueCatalog(invalidUuid).search()).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("dispatches MerchantWorkspace commands to exact endpoints", async () => {
    const http = new RecordingHttpClient([
      {
        user: rawMerchantUser,
        venues: [rawVenue],
        memberships: [{ user_id: merchantId, venue_id: venueId, membership_role: "owner" }],
        menu: [rawMenuItem],
        promotions: [rawPromotion],
        reviews: [{
          id: reviewId,
          venue_id: venueId,
          venue_title: "Тихий сад",
          author_name: "Анна",
          rating: 5,
          body: "Опубликованный отзыв",
          created_at: null,
        }],
        stats: { venues: 1, menuItems: 1, activePromotions: 1, reviews: 1 },
      },
      { venue: { ...rawVenue, title: "Новый сад" } },
      { item: rawMenuItem },
      { ok: true },
      { promotion: rawPromotion },
      { ok: true },
    ]);
    const workspace = createHttpMerchantWorkspace(http);

    const loaded = await workspace.load();
    expect(loaded.memberships[0]?.id).toBe(`${merchantId}:${venueId}`);
    expect(loaded.reviews[0]?.status).toBe("approved");
    await workspace.execute({ type: "venue.update", venueId, patch: { title: " Новый сад " } });
    await workspace.execute({
      type: "menu.save",
      command: { kind: "update", id: menuId, draft: { title: "Рыба", price: 1200 } },
    });
    await workspace.execute({ type: "menu.delete", id: menuId });
    await workspace.execute({
      type: "promotion.save",
      command: { kind: "update", id: promotionId, draft: { title: "Сезон", status: "active" } },
    });
    await workspace.execute({ type: "promotion.delete", id: promotionId });

    expect(http.requests.map((request) => [request.method, request.path])).toEqual([
      ["GET", "/api/merchant/dashboard"],
      ["PATCH", "/api/merchant/venue"],
      ["PATCH", "/api/merchant/menu"],
      ["DELETE", "/api/merchant/menu"],
      ["PATCH", "/api/merchant/promotions"],
      ["DELETE", "/api/merchant/promotions"],
    ]);
  });

  it("deep-loads AdminConsole and localizes merchant-list failure", async () => {
    const dashboard = {
      stats: { venues: 1, pendingVenues: 1, pendingReviews: 1, merchants: 1, cities: 1 },
      venues: [rawVenue],
      submissions: [{
        id: submissionId,
        title: "Новая заявка",
        city: "Ялта",
        category: "Кафе",
        cuisine: "",
        description: "Описание",
        address: "",
        contact_name: "Анна",
        contact_email: "anna@example.test",
        status: "pending",
        created_at: null,
        moderation_note: "",
      }],
      reviews: [{
        id: reviewId,
        venue_id: venueId,
        venue_title: "Тихий сад",
        author_name: "Анна",
        rating: 5,
        body: "Отзыв",
        status: "pending",
        created_at: null,
        moderation_note: "",
      }],
      databaseConfigured: true,
    };
    const http = new RecordingHttpClient([
      dashboard,
      new ApplicationError("unavailable", "Merchant endpoint unavailable"),
    ]);
    const admin = createHttpAdminConsole(http);

    const loaded = await admin.load();
    expect(loaded.overview.venues).toHaveLength(1);
    expect(loaded.merchants).toMatchObject({ status: "unavailable" });
    expect(http.requests.map((request) => request.path)).toEqual([
      "/api/admin/dashboard",
      "/api/admin/merchants",
    ]);
  });

  it.each(["unauthorized", "forbidden"] as const)(
    "propagates %s from the admin merchant request",
    async (kind) => {
      const http = new RecordingHttpClient([
        {
          stats: { venues: 0, pendingVenues: 0, pendingReviews: 0, merchants: 0, cities: 0 },
          venues: [],
          submissions: [],
          reviews: [],
          databaseConfigured: true,
        },
        new ApplicationError(kind, "Admin session is invalid"),
      ]);

      await expect(createHttpAdminConsole(http).load()).rejects.toMatchObject({ kind });
    },
  );

  it("dispatches AdminConsole commands with backend-compatible bodies", async () => {
    const createdMerchant = {
      id: merchantId,
      display_name: "Мария",
      username: "merchant.owner",
      email: "merchant@example.test",
      status: "active",
      created_at: null,
      last_login_at: null,
      memberships: [],
    };
    const http = new RecordingHttpClient([
      { result: { status: "approved" } },
      { venue: rawVenue },
      { ok: true },
      {
        merchant: createdMerchant,
        credentials: { login: "merchant.owner", password: "Temporary123" },
      },
      { ok: true },
      { ok: true },
      { credentials: { password: "ResetPass123" } },
    ]);
    const admin = createHttpAdminConsole(http);

    await admin.execute({
      type: "moderate",
      command: { target: "submission", id: submissionId, decision: "approved" },
    });
    await admin.execute({
      type: "venue.save",
      command: {
        kind: "update",
        id: venueId,
        draft: {
          title: "Тихий сад",
          city: "Симферополь",
          category: "Ресторан",
          description: "Описание",
        },
      },
    });
    await admin.execute({ type: "venue.delete", id: venueId });
    const created = await admin.execute({
      type: "merchant.create",
      command: {
        displayName: "Мария",
        username: "merchant.owner",
        email: "merchant@example.test",
        venueIds: [venueId],
        membershipRole: "owner",
      },
    });
    expect(created).toMatchObject({
      type: "merchant.created",
      value: { merchantId, credentials: { login: "merchant.owner" } },
    });
    await admin.execute({
      type: "merchant.update",
      command: {
        userId: merchantId,
        displayName: "Мария Волкова",
        assignments: { venueIds: [venueId], membershipRole: "manager" },
      },
    });
    await admin.execute({ type: "merchant.status", userId: merchantId, status: "suspended" });
    await admin.execute({ type: "merchant.password.reset", userId: merchantId });

    expect(http.requests.map((request) => [request.method, request.path])).toEqual([
      ["PATCH", "/api/admin/submissions"],
      ["PATCH", "/api/admin/venues"],
      ["DELETE", "/api/admin/venues"],
      ["POST", "/api/admin/merchants"],
      ["PATCH", "/api/admin/merchants"],
      ["PATCH", "/api/admin/merchants"],
      ["PATCH", "/api/admin/merchants"],
    ]);
    expect(http.requests[4]?.body).toEqual({
      userId: merchantId,
      displayName: "Мария Волкова",
      venueIds: [venueId],
      membershipRole: "manager",
    });
  });
});
