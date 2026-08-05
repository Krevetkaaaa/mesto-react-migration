import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import type { CatalogVenue, MenuItem, Promotion } from "../lib/domain";
import { requireUuid } from "../lib/identifiers";
import { normalizeCatalogSearch } from "../lib/catalog-normalization";

export interface CatalogSearch {
  query?: string;
  city?: string;
  category?: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface CatalogPage {
  items: readonly CatalogVenue[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  databaseConfigured: boolean;
}

export interface VenueContent {
  menuItems: readonly MenuItem[];
  promotions: readonly Promotion[];
}

export interface VenueCatalog {
  search(query?: CatalogSearch): Promise<CatalogPage>;
  content(venueId: string): Promise<VenueContent>;
}

export interface FakeVenueCatalogOptions {
  items?: readonly CatalogVenue[];
  content?: Readonly<Record<string, VenueContent>>;
  databaseConfigured?: boolean;
}

export class FakeVenueCatalog extends ControllableFake implements VenueCatalog {
  private readonly items: CatalogVenue[];
  private readonly contentByVenue = new Map<string, VenueContent>();
  private readonly databaseConfigured: boolean;

  constructor(options: FakeVenueCatalogOptions = {}) {
    super();
    this.items = cloneValue([...(options.items ?? [])]);
    for (const [venueId, content] of Object.entries(options.content ?? {})) {
      this.contentByVenue.set(venueId, cloneValue(content));
    }
    this.databaseConfigured = options.databaseConfigured ?? true;
  }

  async search(query: CatalogSearch = {}) {
    await this.throwPlannedFailure();
    const normalized = normalizeCatalogSearch(query);
    const searchText = normalized.query.toLocaleLowerCase("ru-RU");
    const matches = this.items.filter((item) => {
      const matchesCity = normalized.city === "all" || item.city === normalized.city;
      const matchesCategory = !normalized.category
        || normalized.category === "all"
        || item.category === normalized.category;
      const haystack = [
        item.name,
        item.description,
        item.address,
        item.category,
        item.cuisine,
      ].join(" ").toLocaleLowerCase("ru-RU");
      return matchesCity && matchesCategory && (!searchText || haystack.includes(searchText));
    });
    const items = matches.slice(normalized.offset, normalized.offset + normalized.limit);
    return {
      items: cloneValue(items),
      total: matches.length,
      offset: normalized.offset,
      limit: normalized.limit,
      nextOffset: normalized.offset + items.length < matches.length
        ? normalized.offset + normalized.limit
        : null,
      databaseConfigured: this.databaseConfigured,
    };
  }

  async content(venueId: string) {
    await this.throwPlannedFailure();
    const normalizedVenueId = requireUuid(venueId, "Venue id");
    const content = this.contentByVenue.get(normalizedVenueId);
    return content
      ? cloneValue(content)
      : { menuItems: [], promotions: [] };
  }
}
