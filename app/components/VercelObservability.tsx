import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

const STATIC_ROUTES = new Set([
  "/",
  "/catalog",
  "/favorites",
  "/help",
  "/login",
  "/profile",
  "/register",
]);

function routeTemplate(pathname: string) {
  if (pathname.startsWith("/city/")) return "/city/[citySlug]";
  if (pathname.startsWith("/venue/")) return "/venue/[venueSlug]";
  if (pathname.startsWith("/merchant/")) return "/merchant/[view]";
  if (pathname.startsWith("/admin/")) return "/admin/[view]";
  return STATIC_ROUTES.has(pathname) ? pathname : "/[unmatched]";
}

export function VercelObservability({ pathname }: { pathname: string }) {
  const route = routeTemplate(pathname);
  const path = route === "/[unmatched]" ? route : pathname;
  return (
    <>
      <Analytics debug={false} path={path} route={route} />
      <SpeedInsights debug={false} route={route} />
    </>
  );
}

export function StaticVercelObservability({ pathname }: { pathname: string }) {
  return (
    <>
      <script
        data-sdkn="@vercel/analytics/react"
        data-sdkv="2.0.1"
        defer
        src="/_vercel/insights/script.js"
      />
      <script
        data-route={routeTemplate(pathname)}
        data-sdkn="@vercel/speed-insights/react"
        data-sdkv="2.0.0"
        defer
        src="/_vercel/speed-insights/script.js"
      />
    </>
  );
}

export const vercelObservabilityInternals = { routeTemplate };
