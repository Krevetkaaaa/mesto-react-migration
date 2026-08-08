import { afterEach, describe, expect, it, vi } from "vitest";

import { EDITORIAL_VENUES } from "../../../app/data/editorial-venues";
import { HOME_FEATURED_VENUES } from "../../../app/data/home-featured-venues";
import { PUBLIC_CITY_SLUGS } from "../../../app/modules/catalog-url-state";
import { loader as robotsLoader } from "../../../app/routes/robots";
import { loader as sitemapLoader } from "../../../app/routes/sitemap";

function loaderArgs<T extends (args: never) => unknown>(
  _loader: T,
  request: Request,
): Parameters<T>[0] {
  return { request } as Parameters<T>[0];
}

function fetchInputUrl(input: string | URL | Request) {
  if (typeof input === "string") return new URL(input);
  return new URL(input instanceof URL ? input.href : input.url);
}

describe("public crawler resources", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves robots.txt from the trusted public origin and excludes private surfaces", async () => {
    vi.stubEnv("MESTO_PUBLIC_ORIGIN", "https://mesto.example.test/ignored");
    const response = robotsLoader(loaderArgs(
      robotsLoader,
      new Request("http://internal.example.test/robots.txt"),
    ));
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Disallow: /api");
    expect(body).toContain("Sitemap: https://mesto.example.test/sitemap.xml");
  });

  it("serves one complete sitemap from the dedicated non-paginated slug endpoint", async () => {
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(new Response(JSON.stringify({
        databaseConfigured: true,
        complete: true,
        slugs: ["database-only-place"],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await sitemapLoader(loaderArgs(
      sitemapLoader,
      new Request("https://mesto.example.test/sitemap.xml", {
        headers: {
          Cookie: "mesto_session=must-not-reach-public-sitemap",
          "X-Request-ID": "123e4567-e89b-42d3-a456-426614174000",
          "X-Vercel-Protection-Bypass": "preview-secret",
        },
      }),
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    expect(body).toContain("<loc>https://mesto.example.test/</loc>");
    expect(body).toContain("<loc>https://mesto.example.test/venue/database-only-place</loc>");
    for (const city of PUBLIC_CITY_SLUGS) {
      expect(body).toContain(`<loc>https://mesto.example.test/city/${city}</loc>`);
    }
    for (const venue of [...EDITORIAL_VENUES, ...HOME_FEATURED_VENUES]) {
      expect(body).toContain(`<loc>https://mesto.example.test/venue/${venue.slug}</loc>`);
    }
    expect(body).not.toContain("/admin");
    expect(body).not.toContain("/profile");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBeDefined();
    const apiUrl = fetchInputUrl(input!);
    expect(apiUrl.pathname).toBe("/api/venue-sitemap");
    expect(apiUrl.search).toBe("");
    expect(init?.redirect).toBe("manual");
    expect(init?.credentials).toBe("omit");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-request-id")).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(headers.get("x-vercel-protection-bypass")).toBe("preview-secret");
    expect(headers.get("cookie")).toBeNull();
  });

  it("canonicalizes sitemap query variants before any catalog read", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await sitemapLoader(loaderArgs(
      sitemapLoader,
      new Request("https://mesto.example.test/sitemap.xml?nonce=cache-bypass"),
    ));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/sitemap.xml");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves an honest editorial-only sitemap without shared caching when the database is unconfigured", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      databaseConfigured: false,
      complete: true,
      slugs: [],
    }), { status: 200 }))));

    const response = await sitemapLoader(loaderArgs(
      sitemapLoader,
      new Request("https://mesto.example.test/sitemap.xml"),
    ));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(body).toContain(`<loc>https://mesto.example.test/venue/${EDITORIAL_VENUES[0]?.slug}</loc>`);
  });

  it("returns 503 without cacheable XML when the slug endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("catalog unavailable"))));

    const response = await sitemapLoader(loaderArgs(
      sitemapLoader,
      new Request("https://mesto.example.test/sitemap.xml"),
    ));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).not.toContain("<urlset");
  });

  it("rejects incomplete or non-canonical slug payloads as unavailable", async () => {
    for (const payload of [
      { databaseConfigured: true, complete: false, slugs: ["database-place"] },
      { databaseConfigured: true, complete: true, slugs: ["Database-Place"] },
    ]) {
      vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
        new Response(JSON.stringify(payload), { status: 200 }),
      )));
      const response = await sitemapLoader(loaderArgs(
        sitemapLoader,
        new Request("https://mesto.example.test/sitemap.xml"),
      ));

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    }
  });
});
