import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogVenue } from "../../../app/lib/domain";
import {
  homeFeaturedVenueInternals,
  loadHomeFeaturedVenues,
} from "../../../app/modules/home-featured-venues.server";

function venue(key: string, slug = key): CatalogVenue {
  return {
    key,
    databaseId: `database-${key}`,
    slug,
    name: key,
    city: "Test city",
    address: "Test address",
    description: "Test description",
    categories: ["Test category"],
    category: "Test category",
    cuisine: "Test cuisine",
    hours: "10:00-20:00",
    averageCheck: "1000",
    phones: [],
    website: "",
    features: [],
    coordinates: [],
    photos: [],
    mapsUrl: "",
    source: "database",
    rating: null,
    reviewCount: null,
  };
}

function fetchInputUrl(input: string | URL | Request) {
  if (typeof input === "string") return new URL(input);
  return new URL(input instanceof URL ? input.href : input.url);
}

describe("home featured venue selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deduplicates database candidates by both key and slug", () => {
    const editorial = [venue("editorial-a", "stable-a"), venue("editorial-b", "stable-b")];
    const database = [
      venue("editorial-a", "new-slug"),
      venue("new-key", "stable-b"),
      venue("database-a", "database-a"),
      venue("database-a", "duplicate-key"),
      venue("database-b", "database-a"),
      venue("database-c", "database-c"),
    ];

    const result = homeFeaturedVenueInternals.appendUniqueDatabaseVenues(editorial, database);

    expect(result.map(({ key, slug }) => [key, slug])).toEqual([
      ["editorial-a", "stable-a"],
      ["editorial-b", "stable-b"],
      ["database-a", "database-a"],
      ["database-c", "database-c"],
    ]);
  });

  it("appends at most the first three eligible database venues", () => {
    const editorial = [venue("editorial", "editorial")];
    const database = Array.from({ length: 5 }, (_, index) => venue(`database-${index + 1}`));

    const result = homeFeaturedVenueInternals.appendUniqueDatabaseVenues(editorial, database);

    expect(result.map(({ key }) => key)).toEqual([
      "editorial",
      "database-1",
      "database-2",
      "database-3",
    ]);
    expect(result.slice(editorial.length)).toHaveLength(3);
  });

  it("builds a page-one catalog request without inherited home filters", () => {
    const controller = new AbortController();
    const request = homeFeaturedVenueInternals.homeCatalogRequest(new Request(
      "https://mesto.example.test/?page=20&q=coffee&category=cafe&parking=1#popular",
      {
        headers: { "X-Request-ID": "123e4567-e89b-42d3-a456-426614174000" },
        signal: controller.signal,
      },
    ));

    expect(request.method).toBe("GET");
    expect(new URL(request.url).search).toBe("");
    expect(request.headers.get("x-request-id")).toBe("123e4567-e89b-42d3-a456-426614174000");
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });

  it("loads exactly one database page even when the home URL asks for page twenty", async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      void input;
      return Promise.resolve(new Response(JSON.stringify({
        found: 0,
        skip: 0,
        results: 50,
        nextSkip: null,
        databaseConfigured: true,
        items: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await loadHomeFeaturedVenues(new Request(
      "https://mesto.example.test/?page=20&q=coffee&category=cafe&parking=1",
    ));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const input = fetchMock.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    const url = fetchInputUrl(input!);
    expect(url.pathname).toBe("/api/venues");
    expect(url.searchParams.get("skip")).toBe("0");
    expect(url.searchParams.get("results")).toBe("50");
    expect(url.searchParams.has("query")).toBe(false);
    expect(url.searchParams.has("category")).toBe(false);
  });
});
