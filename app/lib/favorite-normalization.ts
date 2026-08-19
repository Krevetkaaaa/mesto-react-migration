import { validationError } from "./application-error";
import type { FavoriteSnapshot } from "./domain";
import { normalizeUuid } from "./identifiers";
import { sanitizeText } from "./input-normalization";
import type { SaveFavoriteCommand } from "../modules/favorites";
import { normalizeVenueSlug } from "../modules/venue-catalog";

export interface NormalizedFavoriteCommand {
  venueKey: string;
  venueId: string | null;
  externalVenueId: string | null;
  snapshot: FavoriteSnapshot;
}

export function normalizeFavoriteCommand(command: SaveFavoriteCommand): NormalizedFavoriteCommand {
  const venueKey = sanitizeText(command.venueKey, 180);
  if (!venueKey) throw validationError("Venue key is required");
  const externalVenueId = sanitizeText(command.externalVenueId ?? "", 180);
  const image = command.snapshot.image;
  const snapshotSlug = command.snapshot.slug?.trim();
  return {
    venueKey,
    venueId: normalizeUuid(command.venueId),
    externalVenueId: externalVenueId || null,
    snapshot: {
      ...(snapshotSlug ? { slug: normalizeVenueSlug(snapshotSlug) } : {}),
      title: sanitizeText(command.snapshot.title, 160),
      type: sanitizeText(command.snapshot.type, 160),
      rating: sanitizeText(command.snapshot.rating, 20),
      image: /^https?:\/\//i.test(image) || /^\/?assets\//.test(image)
        ? sanitizeText(image, 500)
        : "",
      text: sanitizeText(command.snapshot.text, 500),
    },
  };
}

export function normalizeVenueKey(venueKey: string) {
  const normalized = sanitizeText(venueKey, 180);
  if (!normalized) throw validationError("Venue key is required");
  return normalized;
}
