import { z } from "zod";

import { normalizeVenueSlug } from "../modules/venue-catalog";
import type { HttpClient } from "./http";

// 50k canonical slugs can each contain 160 two-byte Cyrillic code points.
// Keep the transport bound above that valid worst case while remaining finite.
const SITEMAP_API_MAX_BYTES = 20_000_000;
const SITEMAP_API_MAX_SLUGS = 50_000;

const venueSitemapSchema = z.object({
  databaseConfigured: z.boolean(),
  complete: z.literal(true),
  slugs: z.array(z.string()).max(SITEMAP_API_MAX_SLUGS),
}).strict().superRefine((value, context) => {
  if (!value.databaseConfigured && value.slugs.length > 0) {
    context.addIssue({
      code: "custom",
      message: "An unconfigured catalog cannot publish database slugs",
      path: ["slugs"],
    });
    return;
  }
  const seen = new Set<string>();
  value.slugs.forEach((slug, index) => {
    try {
      if (normalizeVenueSlug(slug) !== slug || seen.has(slug)) throw new Error("invalid slug");
      seen.add(slug);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Expected a unique canonical venue slug",
        path: ["slugs", index],
      });
    }
  });
});

export interface VenueSitemapSnapshot {
  readonly databaseConfigured: boolean;
  readonly slugs: readonly string[];
}

export async function loadHttpVenueSitemap(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<VenueSitemapSnapshot> {
  const payload = await http.request({
    path: "/api/venue-sitemap",
    maxResponseBytes: SITEMAP_API_MAX_BYTES,
    ...(signal ? { signal } : {}),
    schema: venueSitemapSchema,
  });
  return {
    databaseConfigured: payload.databaseConfigured,
    slugs: payload.slugs,
  };
}
