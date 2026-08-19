import type { CatalogVenue } from "../lib/domain";
import { HOME_FEATURED_VENUES } from "../data/home-featured-venues";
import { loadPublicCatalog } from "./public-catalog.server";

const MAX_DATABASE_FEATURED_VENUES = 3;

function homeCatalogRequest(request: Request) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url, {
    headers: request.headers,
    method: "GET",
    signal: request.signal,
  });
}

function appendUniqueDatabaseVenues(
  editorial: readonly CatalogVenue[],
  database: readonly CatalogVenue[],
) {
  const keys = new Set(editorial.map(({ key }) => key));
  const slugs = new Set(editorial.map(({ slug }) => slug));
  const additional: CatalogVenue[] = [];

  for (const venue of database) {
    if (keys.has(venue.key) || slugs.has(venue.slug)) continue;
    additional.push(venue);
    keys.add(venue.key);
    slugs.add(venue.slug);
    if (additional.length === MAX_DATABASE_FEATURED_VENUES) break;
  }

  return [...editorial, ...additional];
}

/**
 * Keeps the three approved editorial cards stable while adding up to three
 * current database venues when the shared catalog provider is configured.
 * Identity is explicit (`key`/`slug`), never inferred from a display title.
 */
export async function loadHomeFeaturedVenues(request: Request) {
  const editorial = Array.from(HOME_FEATURED_VENUES);
  const snapshot = await loadPublicCatalog(homeCatalogRequest(request), "Симферополь");
  if (!snapshot.databaseConfigured) return editorial;
  return appendUniqueDatabaseVenues(editorial, snapshot.items);
}

export const homeFeaturedVenueInternals = {
  appendUniqueDatabaseVenues,
  homeCatalogRequest,
};
