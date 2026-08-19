import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import type { Favorite, FavoriteSnapshot } from "../lib/domain";
import { normalizeFavoriteCommand, normalizeVenueKey } from "../lib/favorite-normalization";

export interface SaveFavoriteCommand {
  venueKey: string;
  venueId?: string | null;
  externalVenueId?: string | null;
  snapshot: FavoriteSnapshot;
}

export interface Favorites {
  list(): Promise<readonly Favorite[]>;
  save(command: SaveFavoriteCommand): Promise<Favorite>;
  remove(venueKey: string): Promise<void>;
}

export interface FakeFavoritesOptions {
  favorites?: readonly Favorite[];
  now?: () => string;
}

export class FakeFavorites extends ControllableFake implements Favorites {
  private readonly entries = new Map<string, Favorite>();
  private readonly now: () => string;

  constructor(options: FakeFavoritesOptions = {}) {
    super();
    for (const favorite of options.favorites ?? []) {
      this.entries.set(favorite.venueKey, cloneValue(favorite));
    }
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async list() {
    await this.throwPlannedFailure();
    return cloneValue([...this.entries.values()]);
  }

  async save(command: SaveFavoriteCommand) {
    await this.throwPlannedFailure();
    const normalized = normalizeFavoriteCommand(command);
    const favorite: Favorite = {
      ...normalized,
      createdAt: this.now(),
    };
    this.entries.set(normalized.venueKey, favorite);
    return cloneValue(favorite);
  }

  async remove(venueKey: string) {
    await this.throwPlannedFailure();
    this.entries.delete(normalizeVenueKey(venueKey));
  }
}
