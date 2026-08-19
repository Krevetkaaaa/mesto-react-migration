import { z } from "zod";

import type { HttpClient } from "./http";
import {
  catalogVenueWireSchema,
  menuItemWireSchema,
  promotionWireSchema,
  venueWireSchema,
} from "./wire-schemas";
import { normalizeCatalogSearch } from "../lib/catalog-normalization";
import { requireUuid } from "../lib/identifiers";
import {
  normalizeVenueSlug,
  type CatalogSearch,
  type VenueCatalog,
} from "../modules/venue-catalog";
import { ApplicationError } from "../lib/application-error";

const catalogResponseSchema = z.object({
  found: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  results: z.number().int().positive(),
  nextSkip: z.number().int().nonnegative().nullable(),
  databaseConfigured: z.boolean(),
  items: z.array(catalogVenueWireSchema),
}).loose();

const contentResponseSchema = z.object({
  menu: z.array(menuItemWireSchema),
  promotions: z.array(promotionWireSchema),
}).loose();

const venueResponseSchema = z.object({
  venue: venueWireSchema.refine((venue) => {
    try {
      return venue.status === "published" && normalizeVenueSlug(venue.slug) === venue.slug;
    } catch {
      return false;
    }
  }, "Expected a published venue with a canonical slug"),
}).loose();

class HttpVenueCatalog implements VenueCatalog {
  constructor(private readonly http: HttpClient) {}

  async search(query: CatalogSearch = {}) {
    const normalized = normalizeCatalogSearch(query);
    const response = await this.http.request({
      path: "/api/venues",
      query: {
        city: normalized.city,
        results: normalized.limit,
        skip: normalized.offset,
        ...(normalized.query ? { query: normalized.query } : {}),
        ...(normalized.category && normalized.category !== "all"
          ? { category: normalized.category }
          : {}),
      },
      ...(normalized.signal ? { signal: normalized.signal } : {}),
      schema: catalogResponseSchema,
    });
    return {
      items: response.items,
      total: response.found,
      offset: response.skip,
      limit: response.results,
      nextOffset: response.nextSkip,
      databaseConfigured: response.databaseConfigured,
    };
  }

  async content(venueId: string) {
    const normalizedVenueId = requireUuid(venueId, "Venue id");
    const response = await this.http.request({
      path: "/api/venue-content",
      query: { venueId: normalizedVenueId },
      schema: contentResponseSchema,
    });
    return {
      menuItems: response.menu,
      promotions: response.promotions,
    };
  }

  async getBySlug(slug: string) {
    const normalizedSlug = normalizeVenueSlug(slug);
    const response = await this.http.request({
      path: `/api/venues/${encodeURIComponent(normalizedSlug)}`,
      schema: venueResponseSchema,
    });
    if (response.venue.slug !== normalizedSlug) {
      throw new ApplicationError(
        "unavailable",
        "Venue response did not match the requested slug",
      );
    }
    return response.venue;
  }
}

export function createHttpVenueCatalog(http: HttpClient): VenueCatalog {
  return new HttpVenueCatalog(http);
}
