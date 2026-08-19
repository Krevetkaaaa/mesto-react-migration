import { describe, expect, it } from "vitest";

import { createHttpVenueCatalog } from "../../../app/adapters/venue-catalog-http";
import type { HttpClient, HttpRequest } from "../../../app/adapters/http";
import { FakeVenueCatalog } from "../../../app/modules/venue-catalog";

const venueId = "30000000-0000-4000-8000-000000000001";

const rawVenue = {
  id: venueId,
  slug: "quiet-garden",
  title: "Quiet Garden",
  city: "Simferopol",
  category: "Restaurant",
  cuisine: "European",
  description: "Description",
  address: "Street, 1",
  phone: "",
  website: "",
  hours: "10:00–22:00",
  average_check: "1 200 ₽",
  features: ["Wi-Fi"],
  photos: [],
  source: "editorial",
  status: "published" as const,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-02T00:00:00.000Z",
};

class RecordingHttpClient implements HttpClient {
  readonly requests: HttpRequest<unknown>[] = [];

  constructor(private readonly response: unknown) {}

  uploadSigned(): Promise<void> {
    return Promise.resolve();
  }

  async request<T>(request: HttpRequest<T>): Promise<T> {
    await Promise.resolve();
    this.requests.push(request);
    return request.schema.parse(this.response);
  }
}

describe("VenueCatalog slug lookup", () => {
  it("requires a stable slug in every catalog list item", async () => {
    const valid = new RecordingHttpClient({
      found: 1,
      skip: 0,
      results: 50,
      nextSkip: null,
      databaseConfigured: true,
      items: [{
        id: `mesto-${venueId}`,
        databaseId: venueId,
        slug: "stable-database-key",
        name: "A renamed venue",
      }],
    });
    const missing = new RecordingHttpClient({
      found: 1,
      skip: 0,
      results: 50,
      nextSkip: null,
      databaseConfigured: true,
      items: [{
        id: `mesto-${venueId}`,
        databaseId: venueId,
        name: "A venue without a slug",
      }],
    });

    await expect(createHttpVenueCatalog(valid).search()).resolves.toMatchObject({
      items: [{ slug: "stable-database-key", name: "A renamed venue" }],
    });
    await expect(createHttpVenueCatalog(missing).search()).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("normalizes the slug and validates the published venue DTO", async () => {
    const http = new RecordingHttpClient({ venue: rawVenue });
    const venue = await createHttpVenueCatalog(http).getBySlug("  QUIET-GARDEN  ");

    expect(venue).toMatchObject({ id: venueId, slug: "quiet-garden", status: "published" });
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      path: "/api/venues/quiet-garden",
    });
  });

  it("encodes canonical Unicode slugs as one HTTP path segment", async () => {
    const http = new RecordingHttpClient({ venue: { ...rawVenue, slug: "тихий-сад" } });

    await createHttpVenueCatalog(http).getBySlug(" ТИХИЙ-САД ");

    expect(http.requests[0]?.path).toBe(
      "/api/venues/%D1%82%D0%B8%D1%85%D0%B8%D0%B9-%D1%81%D0%B0%D0%B4",
    );
  });

  it("rejects malformed slugs before transport", async () => {
    const http = new RecordingHttpClient({ venue: rawVenue });

    for (const slug of ["bad/slug", "bad--slug", "δοκιμή"]) {
      await expect(createHttpVenueCatalog(http).getBySlug(slug)).rejects.toMatchObject({
        kind: "validation",
      });
    }
    expect(http.requests).toEqual([]);
  });

  it.each([
    ["draft venue", { venue: { ...rawVenue, status: "draft" } }],
    ["malformed UUID", { venue: { ...rawVenue, id: "not-a-uuid" } }],
    ["malformed response slug", { venue: { ...rawVenue, slug: "bad--slug" } }],
  ])("rejects an invalid %s DTO", async (_name, response) => {
    const http = new RecordingHttpClient(response);
    await expect(createHttpVenueCatalog(http).getBySlug("quiet-garden")).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("rejects a valid published DTO for a different slug", async () => {
    const http = new RecordingHttpClient({ venue: { ...rawVenue, slug: "another-place" } });
    await expect(createHttpVenueCatalog(http).getBySlug("quiet-garden")).rejects.toMatchObject({
      kind: "unavailable",
    });
  });

  it("keeps fake lookup behavior aligned and never returns an unpublished venue", async () => {
    const published = {
      id: venueId,
      slug: "quiet-garden",
      title: "Quiet Garden",
      city: "Simferopol",
      category: "Restaurant",
      cuisine: "European",
      description: "Description",
      address: "Street, 1",
      phone: "",
      website: "",
      hours: "10:00–22:00",
      averageCheck: "1 200 ₽",
      features: ["Wi-Fi"],
      photos: [],
      source: "editorial",
      status: "published" as const,
      createdAt: null,
      updatedAt: null,
    };
    const catalog = new FakeVenueCatalog({
      venues: [published, { ...published, id: "40000000-0000-4000-8000-000000000001", slug: "hidden", status: "draft" }],
    });

    await expect(catalog.getBySlug(" QUIET-GARDEN ")).resolves.toMatchObject({ id: venueId });
    await expect(catalog.getBySlug("hidden")).rejects.toMatchObject({
      kind: "not-found",
      status: 404,
    });
  });
});
