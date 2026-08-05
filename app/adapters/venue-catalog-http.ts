import { z } from "zod";

import type { HttpClient } from "./http";
import {
  catalogVenueWireSchema,
  menuItemWireSchema,
  promotionWireSchema,
} from "./wire-schemas";
import { normalizeCatalogSearch } from "../lib/catalog-normalization";
import { requireUuid } from "../lib/identifiers";
import type {
  CatalogSearch,
  VenueCatalog,
} from "../modules/venue-catalog";

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
}

export function createHttpVenueCatalog(http: HttpClient): VenueCatalog {
  return new HttpVenueCatalog(http);
}
