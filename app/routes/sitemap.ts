import type { Route } from "./+types/sitemap";
import { createServerHttpClient } from "../adapters/http";
import { loadHttpVenueSitemap } from "../adapters/venue-sitemap-http";
import { EDITORIAL_VENUES } from "../data/editorial-venues";
import { HOME_FEATURED_VENUES } from "../data/home-featured-venues";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { PUBLIC_CITY_SLUGS } from "../modules/catalog-url-state";
import { normalizeVenueSlug } from "../modules/venue-catalog";

const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=900, stale-while-revalidate=3600";
const SITEMAP_MAX_URLS = 50_000;
const NO_STORE = "no-store, max-age=0";

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sitemapApiRequest(request: Request) {
  const headers = new Headers({ Accept: "application/json" });
  for (const name of ["x-request-id", "x-vercel-protection-bypass"] as const) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return { url: request.url, headers };
}

function canonicalSlugs(values: readonly string[]) {
  const seen = new Set<string>();
  return values.map((value) => {
    const normalized = normalizeVenueSlug(value);
    if (normalized !== value || seen.has(normalized)) {
      throw new Error("Sitemap API returned a non-canonical venue slug");
    }
    seen.add(normalized);
    return normalized;
  });
}

async function loadDatabaseSlugs(request: Request) {
  const parsed = await loadHttpVenueSitemap(
    createServerHttpClient({ request: sitemapApiRequest(request) }),
    request.signal,
  );
  return {
    databaseConfigured: parsed.databaseConfigured,
    slugs: canonicalSlugs(parsed.slugs),
  };
}

function unavailableSitemap() {
  return new Response("Sitemap temporarily unavailable.\n", {
    status: 503,
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  if (new URL(request.url).search) {
    return new Response(null, {
      status: 308,
      headers: {
        "Cache-Control": NO_STORE,
        Location: "/sitemap.xml",
      },
    });
  }

  const origin = resolvePublicOrigin(request);
  let database;
  try {
    database = await loadDatabaseSlugs(request);
  } catch {
    return unavailableSitemap();
  }
  const slugs = new Set([
    ...EDITORIAL_VENUES.map(({ slug }) => slug),
    ...HOME_FEATURED_VENUES.map(({ slug }) => slug),
    ...database.slugs,
  ]);
  const paths = [
    "/",
    "/help",
    "/catalog",
    ...PUBLIC_CITY_SLUGS.map((slug) => `/city/${slug}`),
    ...Array.from(slugs, (slug) => `/venue/${encodeURIComponent(slug)}`),
  ];
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length > SITEMAP_MAX_URLS) return unavailableSitemap();
  const urls = uniquePaths
    .map((path) => `  <url><loc>${xmlEscape(`${origin}${path}`)}</loc></url>`)
    .join("\n");
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Cache-Control": database.databaseConfigured ? SITEMAP_CACHE_CONTROL : NO_STORE,
      "Content-Type": "application/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const sitemapInternals = {
  canonicalSlugs,
  loadDatabaseSlugs,
  sitemapApiRequest,
};
