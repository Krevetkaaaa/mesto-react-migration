import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  headers as helpHeaders,
  links as helpLinks,
  loader as helpLoader,
  meta as helpMeta,
} from "../../../app/routes/public-help";
import {
  headers as homeHeaders,
  links as homeLinks,
  loader as homeLoader,
  meta as homeMeta,
} from "../../../app/routes/public-home";
import { SECURITY_HEADERS } from "../../../app/lib/security-headers";
import { loadPublicCatalog, loadPublicVenue } from "../../../app/modules/public-catalog.server";

const fixtureSummary = {
  total: 3,
  byCategory: { "Рестораны": 2, "Кофейни": 1 },
  byCity: { "Симферополь": 2, "Ялта": 1 },
  source: "database",
  databaseConfigured: true,
};

function argsFor<T extends (args: never) => unknown>(
  _handler: T,
  value: Record<string, unknown>,
): Parameters<T>[0] {
  return value as Parameters<T>[0];
}

async function loadHomeData(request: Request) {
  const result = await homeLoader(argsFor(homeLoader, { request }));
  if (result instanceof Response) {
    throw new Error(`Expected home data, received redirect ${result.status}`);
  }
  return result;
}

describe("public route server contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(
      JSON.stringify(fixtureSummary),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ))));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("derives canonical URLs from the trusted request URL", async () => {
    const request = new Request("https://preview.example.test/source?ignored=true");

    const homeData = await loadHomeData(request);
    expect(homeData).toMatchObject({
      canonicalUrl: "https://preview.example.test/",
      openGraphImageUrl: "https://preview.example.test/assets/mesto-hero.png",
      catalogSummary: fixtureSummary,
    });
    expect(homeData.featuredVenues.slice(0, 3).map(({ key, slug }) => ({ key, slug }))).toEqual([
      { key: "marea", slug: "barkas" },
      { key: "zerno", slug: "zerno" },
      { key: "sova", slug: "gio-restaurant-bar" },
    ]);
    expect(helpLoader(argsFor(helpLoader, { request }))).toEqual({
      canonicalUrl: "https://preview.example.test/help",
      openGraphImageUrl: "https://preview.example.test/assets/mesto-hero.png",
    });
  });

  it("keeps route slugs out of legacy editorial identity and roots detail assets", async () => {
    const detail = await loadPublicVenue(
      new Request("https://preview.example.test/venue/barkas"),
      "barkas",
    );

    expect(detail).toMatchObject({
      venueKey: "marea",
      externalVenueId: "marea",
      venue: {
        slug: "barkas",
        photos: ["/assets/venue-restaurant-unsplash.jpg"],
      },
    });
  });

  it("roots editorial catalog images before nested city routes render them", async () => {
    const snapshot = await loadPublicCatalog(
      new Request("https://preview.example.test/city/simferopol"),
      "Симферополь",
    );
    const editorial = snapshot.items.filter(({ databaseId }) => databaseId === null);

    expect(editorial.length).toBeGreaterThan(0);
    expect(editorial.flatMap(({ photos }) => photos).every((photo) => photo.startsWith("/assets/"))).toBe(true);
  });

  it("uses only the origin portion of a valid configured public URL", () => {
    vi.stubEnv("MESTO_PUBLIC_ORIGIN", "https://mesto.example.test/ignored/path");
    const request = new Request("http://internal.example.test/help");

    expect(helpLoader(argsFor(helpLoader, { request })).canonicalUrl).toBe(
      "https://mesto.example.test/help",
    );
  });

  it.each([
    ["auth", "/login"],
    ["login", "/login"],
    ["register", "/register"],
    ["profile", "/profile"],
    ["favorites", "/favorites"],
  ])("redirects the legacy open=%s entry without public caching", async (open, destination) => {
    const result = await homeLoader(argsFor(homeLoader, {
      request: new Request(`https://mesto.example.test/?open=${open}#guide`),
    }));

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("Expected a redirect response");
    expect(result.status).toBe(302);
    expect(result.headers.get("location")).toBe(destination);
    expect(result.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("rejects a non-HTTP configured origin and falls back to the request", async () => {
    vi.stubEnv("MESTO_PUBLIC_ORIGIN", "file:///tmp/not-public");
    const request = new Request("https://safe.example.test/");

    expect((await loadHomeData(request)).canonicalUrl).toBe(
      "https://safe.example.test/",
    );
  });

  it("publishes canonical and Open Graph metadata for both routes", async () => {
    const homeRequest = new Request("https://mesto.example.test/");
    const homeData = await loadHomeData(homeRequest);
    const helpRequest = new Request("https://mesto.example.test/help");
    const helpData = helpLoader(argsFor(helpLoader, { request: helpRequest }));

    for (const { canonicalUrl, descriptors } of [
      {
        canonicalUrl: "https://mesto.example.test/",
        descriptors: homeMeta(argsFor(homeMeta, { data: homeData })),
      },
      {
        canonicalUrl: "https://mesto.example.test/help",
        descriptors: helpMeta(argsFor(helpMeta, { data: helpData })),
      },
    ]) {
      expect(descriptors).toEqual(expect.arrayContaining([
        expect.objectContaining({ tagName: "link", rel: "canonical", href: canonicalUrl }),
        expect.objectContaining({ property: "og:url", content: canonicalUrl }),
        expect.objectContaining({
          property: "og:image",
          content: "https://mesto.example.test/assets/mesto-hero.png",
        }),
      ]));
    }
  });

  it("keeps the frozen stylesheet order", () => {
    expect(homeLinks().filter(({ rel }) => rel === "stylesheet").map(({ href }) => href)).toEqual([
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
      "/styles.css?v=auth-merchant-3",
      "/gastro-theme.css?v=premium-foundation-3",
      "/ambient-premium.css?v=premium-2",
      "/phone-premium.css?v=premium-1",
      "/editorial-sections.css?v=premium-2",
    ]);
    expect(helpLinks().filter(({ rel }) => rel === "stylesheet").map(({ href }) => href)).toEqual([
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
      "/help.css?v=theme-1",
    ]);
  });

  it("tags the cached home document and preserves private compatibility redirects", () => {
    expect(homeHeaders()).toEqual({
      ...SECURITY_HEADERS,
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
      "Vercel-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      "Vercel-Cache-Tag": "mesto-venues",
    });
    expect(homeHeaders({
      loaderHeaders: new Headers({ "Cache-Control": "private, no-store, max-age=0" }),
    })).toEqual({
      ...SECURITY_HEADERS,
      "Cache-Control": "private, no-store, max-age=0",
    });
  });

  it("keeps the help document public without coupling it to venue invalidation", () => {
    expect(helpHeaders()).toEqual({
      ...SECURITY_HEADERS,
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    });
  });
});
