import { describe, expect, it } from "vitest";

import { ApplicationError } from "../../../app/lib/application-error";
import type {
  AdminDashboard,
  CatalogVenue,
  MerchantAccount,
  MerchantWorkspaceSnapshot,
  User,
  Venue,
} from "../../../app/lib/domain";
import { FakeAdminConsole } from "../../../app/modules/admin-console";
import { FakeFavorites } from "../../../app/modules/favorites";
import { FakeMerchantWorkspace } from "../../../app/modules/merchant-workspace";
import { FakeSession } from "../../../app/modules/session";
import { FakeSubmissions } from "../../../app/modules/submissions";
import { FakeVenueCatalog } from "../../../app/modules/venue-catalog";

const userId = "10000000-0000-4000-8000-000000000001";
const secondUserId = "10000000-0000-4000-8000-000000000002";
const merchantId = "20000000-0000-4000-8000-000000000001";
const venueId = "30000000-0000-4000-8000-000000000001";
const secondVenueId = "30000000-0000-4000-8000-000000000002";
const menuId = "50000000-0000-4000-8000-000000000001";
const promotionId = "60000000-0000-4000-8000-000000000001";
const reviewId = "70000000-0000-4000-8000-000000000001";
const submissionId = "80000000-0000-4000-8000-000000000001";
const mixedCaseUuid = "3ABCDEF0-1234-4ABC-8ABC-ABCDEF123456";

function customer(overrides: Partial<User> = {}): User {
  return {
    id: userId,
    username: "anna",
    name: "Anna",
    email: "anna@example.test",
    hasEmail: true,
    phone: "",
    role: "customer",
    status: "active",
    mustChangePassword: false,
    ...overrides,
  };
}

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: venueId,
    slug: "quiet-garden",
    title: "Quiet Garden",
    city: "Simferopol",
    category: "Restaurant",
    cuisine: "European",
    description: "A quiet place for dinner.",
    address: "Main Street 1",
    phone: "",
    website: "",
    hours: "10:00-22:00",
    averageCheck: "1200",
    features: ["Wi-Fi"],
    photos: [],
    source: "editorial",
    status: "published",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function catalogVenue(overrides: Partial<CatalogVenue> = {}): CatalogVenue {
  return {
    key: "quiet-garden",
    databaseId: venueId,
    slug: "quiet-garden",
    name: "Quiet Garden",
    city: "Simferopol",
    address: "Main Street 1",
    description: "A quiet European restaurant",
    categories: ["Restaurant", "European"],
    category: "Restaurant",
    cuisine: "European",
    hours: "10:00-22:00",
    averageCheck: "1200",
    phones: [],
    website: "",
    features: [],
    coordinates: [],
    photos: [],
    mapsUrl: "",
    source: "mesto",
    rating: null,
    reviewCount: null,
    ...overrides,
  };
}

function merchantWorkspace(role: "owner" | "manager" | "content_editor" | "analyst" = "owner"):
MerchantWorkspaceSnapshot {
  return {
    user: customer({
      id: merchantId,
      username: "merchant.owner",
      email: "merchant@example.test",
      role: "merchant",
    }),
    venues: [venue()],
    memberships: [{ id: `${merchantId}:${venueId}`, userId: merchantId, venueId, role }],
    menuItems: [{
      id: menuId,
      venueId,
      section: "Main",
      title: "Fish",
      description: "",
      price: 1200,
      photoUrl: "",
      isAvailable: true,
      sortOrder: 1,
    }],
    promotions: [{
      id: promotionId,
      venueId,
      title: "Summer menu",
      description: "",
      startsAt: null,
      endsAt: null,
      status: "active",
    }],
    reviews: [{
      id: reviewId,
      venueId,
      venueTitle: "Quiet Garden",
      authorName: "Anna",
      rating: 5,
      body: "Published review",
      status: "approved",
      createdAt: null,
      moderationNote: "",
    }],
    stats: { venues: 99, menuItems: 99, activePromotions: 99, reviews: 99 },
  };
}

function adminDashboard(): AdminDashboard {
  return {
    stats: { venues: 0, pendingVenues: 0, pendingReviews: 0, merchants: 0, cities: 0 },
    venues: [venue()],
    submissions: [{
      id: submissionId,
      title: "New Place",
      city: "Yalta",
      category: "Cafe",
      cuisine: "",
      description: "A community venue proposal",
      address: "Coast Street 2",
      phone: "+7 900 000-00-00",
      website: "https://new-place.example",
      hours: "09:00-21:00",
      averageCheck: "900",
      features: ["Terrace"],
      photos: ["https://images.example/new-place.jpg"],
      contactName: "Anna",
      contactEmail: "anna@example.test",
      status: "pending",
      createdAt: null,
      moderationNote: "",
    }],
    reviews: [],
    databaseConfigured: true,
  };
}

function merchantAccount(): MerchantAccount {
  return {
    id: merchantId,
    displayName: "Maria",
    username: "merchant.owner",
    email: "merchant@example.test",
    status: "active",
    createdAt: null,
    lastLoginAt: null,
    memberships: [{
      id: `${merchantId}:${venueId}`,
      userId: merchantId,
      venueId,
      role: "owner",
      venue: venue(),
    }],
  };
}

describe("stateful module fakes", () => {
  it("moves Session between users without leaking user-scoped favorites", async () => {
    const first = customer();
    const second = customer({
      id: secondUserId,
      username: "boris",
      name: "Boris",
      email: "boris@example.test",
    });
    const suspended = customer({
      id: "10000000-0000-4000-8000-000000000003",
      username: "suspended",
      email: "suspended@example.test",
      status: "suspended",
    });
    const session = new FakeSession({
      accounts: [
        { login: "anna-login", password: "Password123", user: first },
        { login: "boris-login", password: "Password456", user: second },
        { login: "suspended-login", password: "Password789", user: suspended },
      ],
      currentLogin: "anna-login",
      favoriteKeysByUserId: {
        [first.id]: ["quiet-garden"],
        [second.id]: ["sea-cafe"],
      },
      oauthAccessTokens: {
        "oauth-boris": "boris@example.test",
        "oauth-suspended": "suspended@example.test",
      },
    });

    await expect(session.current()).resolves.toMatchObject({ favoriteKeys: ["quiet-garden"] });
    await session.signOut();
    await session.completeOAuth("oauth-boris");
    await expect(session.current()).resolves.toMatchObject({
      user: { id: secondUserId },
      favoriteKeys: ["sea-cafe"],
    });
    await session.changePassword({ currentPassword: "Password456", password: "NewPassword456" });
    await session.signOut();
    await expect(session.signIn({ login: "boris", password: "Password456" })).rejects.toMatchObject({
      kind: "unauthorized",
    });
    await expect(session.signIn({ login: "BORIS@EXAMPLE.TEST", password: "NewPassword456" }))
      .resolves.toMatchObject({ id: secondUserId });
    await expect(session.completeOAuth("   ")).rejects.toMatchObject({ kind: "validation" });
    await expect(session.completeOAuth("toString")).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(session.completeOAuth("oauth-suspended")).rejects.toMatchObject({
      kind: "forbidden",
      status: 403,
    });
    const inactiveSession = new FakeSession({
      accounts: [{ login: "suspended-login", password: "Password789", user: suspended }],
      currentLogin: "suspended-login",
    });
    await expect(inactiveSession.changePassword({
      currentPassword: "Password789",
      password: "NewPassword789",
    })).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("filters and paginates VenueCatalog while normalizing abort and UUID failures", async () => {
    const controller = new AbortController();
    controller.abort();
    const catalog = new FakeVenueCatalog({
      items: [
        catalogVenue(),
        catalogVenue({
          key: "sea-cafe",
          databaseId: secondVenueId,
          slug: "sea-cafe",
          name: "Sea Cafe",
          city: "Yalta",
          address: "Coast Road 2",
          category: "Cafe",
          categories: ["Cafe"],
        }),
      ],
      content: {
        [venueId]: { menuItems: merchantWorkspace().menuItems, promotions: merchantWorkspace().promotions },
      },
    });

    await expect(catalog.search({ city: "Yalta", limit: 1 })).resolves.toMatchObject({
      total: 1,
      items: [{ key: "sea-cafe" }],
      nextOffset: null,
    });
    await expect(catalog.search({ query: " \u0433\u0434\u0435 \u043f\u043e\u0435\u0441\u0442\u044c " }))
      .resolves.toMatchObject({ total: 2 });
    await expect(catalog.search({ query: " Coast<> " })).resolves.toMatchObject({
      total: 1,
      items: [{ key: "sea-cafe" }],
    });
    await expect(catalog.search({ query: "Garden!" })).resolves.toMatchObject({
      total: 1,
      items: [{ key: "quiet-garden" }],
    });
    await expect(catalog.search({ query: "Yalta" })).resolves.toMatchObject({ total: 0 });
    await expect(catalog.search({ category: "European" })).resolves.toMatchObject({ total: 0 });
    await expect(catalog.search({ offset: 100_001 })).resolves.toMatchObject({
      offset: 100_000,
      items: [],
    });
    await expect(catalog.content(secondVenueId)).resolves.toEqual({ menuItems: [], promotions: [] });
    await expect(catalog.search({ signal: controller.signal })).rejects.toMatchObject({ kind: "unavailable" });
    await expect(catalog.content("not-a-uuid")).rejects.toMatchObject({ kind: "validation" });
  });

  it("keeps Favorites state intact when the dependency fails before a mutation", async () => {
    const favorites = new FakeFavorites({ now: () => "2026-08-05T00:00:00.000Z" });
    await favorites.save({
      venueKey: "  quiet<>garden  ",
      venueId: mixedCaseUuid,
      externalVenueId: " ext<> id\u0001 ",
      snapshot: {
        title: " Quiet   Garden ",
        type: "Restaurant",
        rating: "5",
        image: "https://img.test/a<>  b",
        text: "Nice",
      },
    });
    favorites.failNext(new ApplicationError("unavailable", "Write failed"));

    await expect(favorites.remove("quiet garden")).rejects.toMatchObject({ kind: "unavailable" });
    await expect(favorites.list()).resolves.toMatchObject([{
      venueKey: "quiet garden",
      venueId: mixedCaseUuid.toLowerCase(),
      externalVenueId: "ext id",
      snapshot: { title: "Quiet Garden", image: "https://img.test/a b" },
      createdAt: "2026-08-05T00:00:00.000Z",
    }]);
  });

  it("prevalidates Submissions and records only successful normalized drafts", async () => {
    const submissions = new FakeSubmissions();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
    const draft = {
      contactEmail: " PERSON@Example.TEST ",
      title: " Quiet Garden ",
      city: "Simferopol",
      category: "Restaurant",
      description: "Detailed venue description",
      images: [{ name: "venue.png", type: "image/png" as const, bytes: png }],
    };
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x01,
    ]);
    const invalidMimeImage = { name: "venue.webp", type: "image/webp" as const, bytes: webp };
    Object.assign(invalidMimeImage, { type: "image/gif" });

    await submissions.submitVenue(draft);
    await submissions.submitReview({
      venueId: mixedCaseUuid,
      externalVenueId: " ext<> review ",
      venueTitle: "Quiet Garden",
      rating: 5,
      review: "A sufficiently detailed review body.",
    });
    png[8] = 0xff;
    await expect(submissions.submitVenue({ ...draft, contactEmail: "broken" }))
      .rejects.toMatchObject({ kind: "validation" });
    await expect(submissions.submitVenue({ ...draft, images: [invalidMimeImage] }))
      .rejects.toMatchObject({ kind: "validation" });
    submissions.failNext(new ApplicationError("unavailable", "Submission write failed"));
    await expect(submissions.submitVenue({ ...draft, images: [] }))
      .rejects.toMatchObject({ kind: "unavailable" });

    expect(submissions.venueSubmissions()).toHaveLength(1);
    expect(submissions.venueSubmissions()[0]?.draft).toMatchObject({
      contactEmail: "person@example.test",
      title: "Quiet Garden",
    });
    expect(submissions.venueSubmissions()[0]?.draft.images?.[0]?.bytes[8]).toBe(0x01);
    expect(submissions.reviewSubmissions()[0]?.draft).toMatchObject({
      venueId: mixedCaseUuid.toLowerCase(),
      externalVenueId: "ext review",
    });
  });

  it("enforces MerchantWorkspace permissions and rolls back failed commands", async () => {
    const workspace = new FakeMerchantWorkspace(merchantWorkspace());
    const created = await workspace.execute({
      type: "menu.save",
      command: { kind: "create", venueId, draft: { title: "Soup", price: 450 } },
    });
    expect(created).toMatchObject({ type: "menu.saved", item: { venueId, title: "Soup" } });
    if (created.type !== "menu.saved") throw new Error("Expected a menu result");
    expect(created.item.id).toMatch(/^[0-9a-f-]{36}$/i);

    workspace.failNext(new ApplicationError("unavailable", "Delete failed"));
    await expect(workspace.execute({ type: "menu.delete", id: created.item.id }))
      .rejects.toMatchObject({ kind: "unavailable" });
    const afterFailedDelete = await workspace.load();
    expect(afterFailedDelete.menuItems.some((item) => item.id === created.item.id)).toBe(true);
    expect(afterFailedDelete.stats).toEqual({
      venues: 1,
      menuItems: 2,
      activePromotions: 1,
      reviews: 1,
    });

    await expect(workspace.execute({
      type: "menu.save",
      command: { kind: "update", id: menuId, draft: { title: "Fish", price: -1 } },
    })).rejects.toMatchObject({ kind: "validation" });
    const afterRejectedUpdate = await workspace.load();
    expect(afterRejectedUpdate.menuItems.find((item) => item.id === menuId)?.price).toBe(1200);

    const invalidPromotion = { title: "Unexpected status", status: "active" as const };
    Object.assign(invalidPromotion, { status: "bogus" });
    await expect(workspace.execute({
      type: "promotion.save",
      command: { kind: "create", venueId, draft: invalidPromotion },
    })).resolves.toMatchObject({ type: "promotion.saved", promotion: { status: "draft" } });

    const analyst = new FakeMerchantWorkspace(merchantWorkspace("analyst"));
    await expect(analyst.execute({ type: "venue.update", venueId, patch: { title: "Changed" } }))
      .rejects.toMatchObject({ kind: "forbidden" });
  });

  it("localizes only recoverable AdminConsole secondary-load failures", async () => {
    const admin = new FakeAdminConsole({
      authenticated: true,
      dashboard: adminDashboard(),
      merchants: [merchantAccount()],
    });
    admin.failNextMerchants(new ApplicationError("unavailable", "Merchant list failed"));
    await expect(admin.load()).resolves.toMatchObject({ merchants: { status: "unavailable" } });
    await expect(admin.load()).resolves.toMatchObject({ merchants: { status: "ready" } });

    admin.failNextMerchants(new ApplicationError("unauthorized", "Session expired"));
    await expect(admin.load()).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("applies AdminConsole moderation atomically and isolates failed writes", async () => {
    const admin = new FakeAdminConsole({
      authenticated: true,
      dashboard: adminDashboard(),
      merchants: [merchantAccount()],
      now: () => "2026-08-05T00:00:00.000Z",
    });

    const invalidModeration = {
      target: "submission" as const,
      id: submissionId,
      decision: "approved" as const,
    };
    Object.assign(invalidModeration, { decision: "bogus" });
    await expect(admin.execute({ type: "moderate", command: invalidModeration }))
      .rejects.toMatchObject({ kind: "validation" });
    expect((await admin.load()).overview.submissions[0]?.status).toBe("pending");

    const venueDraft = {
      title: "Fallback Venue",
      city: "Yalta",
      category: "Cafe",
      description: "Venue with runtime-invalid enum inputs",
      source: "community" as const,
      status: "draft" as const,
    };
    Object.assign(venueDraft, { source: "bogus", status: "bogus" });
    await expect(admin.execute({
      type: "venue.save",
      command: { kind: "create", draft: venueDraft },
    })).resolves.toMatchObject({
      type: "venue.saved",
      venue: { source: "editorial", status: "published" },
    });

    const invalidMembership = {
      displayName: "Invalid Role",
      username: "invalid.role",
      venueIds: [venueId],
      membershipRole: "owner" as const,
    };
    Object.assign(invalidMembership, { membershipRole: "bogus" });
    await expect(admin.execute({
      type: "merchant.create",
      command: invalidMembership,
    })).rejects.toMatchObject({ kind: "validation" });

    const invalidMerchantStatus = {
      type: "merchant.status" as const,
      userId: merchantId,
      status: "active" as const,
    };
    Object.assign(invalidMerchantStatus, { status: "bogus" });
    await expect(admin.execute(invalidMerchantStatus)).rejects.toMatchObject({ kind: "validation" });

    await admin.execute({
      type: "moderate",
      command: { target: "submission", id: submissionId, decision: "approved", note: "Checked" },
    });
    const afterModeration = await admin.load();
    expect(afterModeration.overview.submissions[0]).toMatchObject({
      status: "approved",
      moderationNote: "Checked",
    });
    expect(afterModeration.overview.venues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: `new-place-${submissionId.slice(0, 8)}`,
        source: "community",
        phone: "+7 900 000-00-00",
        website: "https://new-place.example",
        hours: "09:00-21:00",
        averageCheck: "900",
        features: ["Terrace"],
        photos: ["https://images.example/new-place.jpg"],
      }),
    ]));

    admin.failNext(new ApplicationError("unavailable", "Delete failed"));
    await expect(admin.execute({ type: "venue.delete", id: venueId }))
      .rejects.toMatchObject({ kind: "unavailable" });
    expect((await admin.load()).overview.venues).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: venueId }),
    ]));

    await expect(admin.execute({
      type: "merchant.update",
      command: {
        userId: merchantId,
        displayName: "Changed Name",
        assignments: {
          venueIds: ["30000000-0000-4000-8000-000000000999"],
          membershipRole: "manager",
        },
      },
    })).rejects.toMatchObject({ kind: "validation" });
    const finalState = await admin.load();
    expect(finalState.merchants).toMatchObject({
      status: "ready",
      items: [expect.objectContaining({ displayName: "Maria" })],
    });
  });
});
