import { z } from "zod";

import type { HttpClient } from "./http";
import { favoriteWireSchema } from "./wire-schemas";
import { normalizeFavoriteCommand, normalizeVenueKey } from "../lib/favorite-normalization";
import type { Favorites, SaveFavoriteCommand } from "../modules/favorites";

const favoritesResponseSchema = z.object({
  favorites: z.array(favoriteWireSchema),
}).loose();
const favoriteResponseSchema = z.object({ favorite: favoriteWireSchema }).loose();
const okResponseSchema = z.object({ ok: z.literal(true) }).loose();

class HttpFavorites implements Favorites {
  constructor(private readonly http: HttpClient) {}

  async list() {
    const response = await this.http.request({
      path: "/api/favorites",
      schema: favoritesResponseSchema,
    });
    return response.favorites;
  }

  async save(command: SaveFavoriteCommand) {
    const normalized = normalizeFavoriteCommand(command);
    const response = await this.http.request({
      method: "POST",
      path: "/api/favorites",
      body: {
        venueKey: normalized.venueKey,
        venueId: normalized.venueId,
        externalVenueId: normalized.externalVenueId,
        snapshot: normalized.snapshot,
      },
      schema: favoriteResponseSchema,
    });
    return response.favorite;
  }

  async remove(venueKey: string) {
    const normalized = normalizeVenueKey(venueKey);
    await this.http.request({
      method: "DELETE",
      path: "/api/favorites",
      body: { venueKey: normalized },
      schema: okResponseSchema,
    });
  }
}

export function createHttpFavorites(http: HttpClient): Favorites {
  return new HttpFavorites(http);
}
