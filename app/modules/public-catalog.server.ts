import { createServerHttpClient } from "../adapters/http";
import { createHttpVenueCatalog } from "../adapters/venue-catalog-http";
import {
  EDITORIAL_VENUES,
  findEditorialVenueBySlug,
  type EditorialVenue,
} from "../data/editorial-venues";
import {
  findHomeFeaturedVenueBySlug,
  HOME_FEATURED_VENUES,
} from "../data/home-featured-venues";
import type { MenuItem, Promotion, Venue } from "../lib/domain";
import { withPublicVenueAssets } from "../lib/public-asset";
import { parseCatalogUrl } from "./catalog-url-state";
import { createPublicCatalogExperience } from "./public-catalog-experience";

export function publicVenueCatalog(request: Request) {
  return createHttpVenueCatalog(createServerHttpClient({ request }));
}

const PUBLIC_EDITORIAL_VENUES = EDITORIAL_VENUES.map(withPublicVenueAssets);

export async function loadPublicCatalog(request: Request, forcedCity?: string) {
  const url = new URL(request.url);
  const parsed = parseCatalogUrl(url.searchParams);
  const state = forcedCity ? { ...parsed, city: forcedCity } : parsed;
  return createPublicCatalogExperience(publicVenueCatalog(request), {
    editorialItems: PUBLIC_EDITORIAL_VENUES,
  }).load(state, request.signal);
}

export interface PublicVenueDetail {
  venue: Venue;
  venueKey: string;
  externalVenueId: string | null;
  menuItems: readonly MenuItem[];
  promotions: readonly Promotion[];
}

function localEditorialDetail(editorial: EditorialVenue, sequence: number): PublicVenueDetail {
  const venueId = `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  const publicEditorial = withPublicVenueAssets(editorial);
  return {
    venue: {
      id: venueId,
      slug: editorial.slug,
      title: editorial.name,
      city: editorial.city,
      category: editorial.category,
      cuisine: editorial.cuisine,
      description: editorial.description,
      address: editorial.address,
      phone: Array.from(editorial.phones)[0] ?? "",
      website: editorial.website,
      hours: editorial.hours,
      averageCheck: editorial.averageCheck,
      features: editorial.features,
      photos: publicEditorial.photos,
      source: editorial.source,
      status: "published",
      createdAt: null,
      updatedAt: null,
    },
    venueKey: editorial.key,
    externalVenueId: editorial.key,
    menuItems: editorial.extras.menu.map(([title, description, price], index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      venueId,
      section: "Основное меню",
      title,
      description,
      price: Number(price.replace(/\D/g, "")) || null,
      photoUrl: "",
      isAvailable: true,
      sortOrder: index,
    })),
    promotions: [],
  };
}

function editorialDetail(slug: string): PublicVenueDetail | null {
  const editorial = findEditorialVenueBySlug(slug);
  if (editorial) {
    return localEditorialDetail(editorial, EDITORIAL_VENUES.indexOf(editorial) + 1);
  }
  const homeFeatured = findHomeFeaturedVenueBySlug(slug);
  if (!homeFeatured) return null;
  return localEditorialDetail(
    homeFeatured,
    10_000 + HOME_FEATURED_VENUES.indexOf(homeFeatured) + 1,
  );
}

export async function loadPublicVenue(request: Request, slug: string) {
  const editorial = editorialDetail(slug);
  if (editorial) return editorial;
  const catalog = publicVenueCatalog(request);
  const venue = await catalog.getBySlug(slug);
  const content = await catalog.content(venue.id);
  return {
    venue,
    venueKey: `mesto-${venue.id}`,
    externalVenueId: null,
    ...content,
  } satisfies PublicVenueDetail;
}
