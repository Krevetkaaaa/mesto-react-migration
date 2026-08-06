import { createServerHttpClient } from "../adapters/http";
import { createHttpVenueCatalog } from "../adapters/venue-catalog-http";
import { EDITORIAL_VENUES, findEditorialVenueBySlug } from "../data/editorial-venues";
import type { MenuItem, Promotion, Venue } from "../lib/domain";
import { parseCatalogUrl } from "./catalog-url-state";
import { createPublicCatalogExperience } from "./public-catalog-experience";

export function publicVenueCatalog(request: Request) {
  return createHttpVenueCatalog(createServerHttpClient({ request }));
}

export async function loadPublicCatalog(request: Request, forcedCity?: string) {
  const url = new URL(request.url);
  const parsed = parseCatalogUrl(url.searchParams);
  const state = forcedCity ? { ...parsed, city: forcedCity } : parsed;
  return createPublicCatalogExperience(publicVenueCatalog(request), {
    editorialItems: EDITORIAL_VENUES,
  }).load(state, request.signal);
}

export interface PublicVenueDetail {
  venue: Venue;
  venueKey: string;
  externalVenueId: string | null;
  menuItems: readonly MenuItem[];
  promotions: readonly Promotion[];
}

function editorialDetail(slug: string): PublicVenueDetail | null {
  const editorial = findEditorialVenueBySlug(slug);
  if (!editorial) return null;
  return {
    venue: {
      id: `00000000-0000-4000-8000-${String(EDITORIAL_VENUES.indexOf(editorial) + 1).padStart(12, "0")}`,
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
      photos: editorial.photos,
      source: editorial.source,
      status: "published",
      createdAt: null,
      updatedAt: null,
    },
    venueKey: editorial.key,
    externalVenueId: editorial.slug,
    menuItems: editorial.extras.menu.map(([title, description, price], index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      venueId: `00000000-0000-4000-8000-${String(EDITORIAL_VENUES.indexOf(editorial) + 1).padStart(12, "0")}`,
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
