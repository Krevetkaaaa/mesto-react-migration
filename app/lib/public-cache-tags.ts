export const PUBLIC_VENUES_CACHE_TAG = "mesto-venues";
export const PUBLIC_VERCEL_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=120";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function publicVenueEntityCacheTag(id: string) {
  const canonicalId = id.trim().toLocaleLowerCase("en-US");
  return UUID_PATTERN.test(canonicalId) ? `mesto-venue-${canonicalId}` : "";
}

export function publicVenueDocumentCacheTags(id: string) {
  const entityTag = publicVenueEntityCacheTag(id);
  return entityTag
    ? `${PUBLIC_VENUES_CACHE_TAG},${entityTag}`
    : PUBLIC_VENUES_CACHE_TAG;
}
