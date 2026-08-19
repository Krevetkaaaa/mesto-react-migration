import { ControllableFake, cloneValue } from "../lib/controllable-fake";
import { ApplicationError, validationError } from "../lib/application-error";
import type { CatalogVenue, MenuItem, Promotion, Venue } from "../lib/domain";
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
  getBySlug(slug: string): Promise<Venue>;
  content(venueId: string): Promise<VenueContent>;
}

export interface FakeVenueCatalogOptions {
  items?: readonly CatalogVenue[];
  venues?: readonly Venue[];
  content?: Readonly<Record<string, VenueContent>>;
  databaseConfigured?: boolean;
}

export class FakeVenueCatalog extends ControllableFake implements VenueCatalog {
  private readonly items: CatalogVenue[];
  private readonly venues: Venue[];
  private readonly contentByVenue = new Map<string, VenueContent>();
  private readonly databaseConfigured: boolean;

  constructor(options: FakeVenueCatalogOptions = {}) {
    super();
    this.items = cloneValue([...(options.items ?? [])]);
    this.venues = cloneValue([...(options.venues ?? [])]);
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

  async getBySlug(slug: string) {
    await this.throwPlannedFailure();
    const normalizedSlug = normalizeVenueSlug(slug);
    const venue = this.venues.find((item) => (
      item.status === "published" && normalizeVenueSlug(item.slug) === normalizedSlug
    ));
    if (!venue) {
      throw new ApplicationError(
        "not-found",
        "Venue was not found",
        { status: 404, code: "VENUE_NOT_FOUND" },
      );
    }
    return cloneValue(venue);
  }
}

const VENUE_SLUG_PART = "[a-z\\u0430-\\u044f\\u04510-9]+";
const VENUE_SLUG_PATTERN = new RegExp(`^${VENUE_SLUG_PART}(?:-${VENUE_SLUG_PART})*$`, "u");

export function normalizeVenueSlug(value: string) {
  if (typeof value !== "string") throw validationError("Venue slug is invalid");
  const slug = value.normalize("NFKC").trim().toLowerCase();
  if (!slug || slug.length > 160 || !VENUE_SLUG_PATTERN.test(slug)) {
    throw validationError("Venue slug is invalid");
  }
  return slug;
}
