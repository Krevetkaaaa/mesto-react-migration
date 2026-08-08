export const PUBLIC_VENUE_IMAGE_FALLBACK = "/assets/venue-restaurant-unsplash.jpg";

function safeRootRelativeUrl(value: string) {
  try {
    const parsed = new URL(value, "https://mesto.invalid");
    if (parsed.origin !== "https://mesto.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function publicAssetUrl(value: string) {
  const normalized = value.trim();
  const legacyAsset = normalized.replace(/^\.\//u, "");
  if (legacyAsset.startsWith("assets/")) {
    return safeRootRelativeUrl(`/${legacyAsset}`) ?? PUBLIC_VENUE_IMAGE_FALLBACK;
  }
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return safeRootRelativeUrl(normalized) ?? PUBLIC_VENUE_IMAGE_FALLBACK;
  }
  try {
    const parsed = new URL(normalized);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:")
      && !parsed.username
      && !parsed.password) {
      return parsed.href;
    }
  } catch {
    // Invalid and relative non-asset URLs deliberately use the local fallback.
  }
  return PUBLIC_VENUE_IMAGE_FALLBACK;
}

export function withPublicVenueAssets<T extends { readonly photos: readonly string[] }>(venue: T) {
  return {
    ...venue,
    photos: venue.photos.map(publicAssetUrl),
  };
}
