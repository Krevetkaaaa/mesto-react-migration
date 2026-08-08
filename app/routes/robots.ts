import type { Route } from "./+types/robots";

import { resolvePublicOrigin } from "../lib/public-origin.server";

export function loader({ request }: Route.LoaderArgs) {
  const origin = resolvePublicOrigin(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /merchant",
    "Disallow: /profile",
    "Disallow: /favorites",
    "Disallow: /api",
    "Disallow: /__react",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
