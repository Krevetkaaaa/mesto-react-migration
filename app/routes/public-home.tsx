import type { Route } from "./+types/public-home";
import { useLoaderData } from "react-router";

import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { SECURITY_HEADERS } from "../lib/security-headers";
import { loadHomeCatalogSummary } from "../modules/home-catalog-summary.server";
import type { HomeCatalogSummary } from "../modules/home-catalog-summary";

const DESCRIPTION =
  "Место — городской гид по ресторанам, кафе, барам и новым гастрономическим впечатлениям.";

export async function loader({ request }: Route.LoaderArgs) {
  const origin = resolvePublicOrigin(request);

  return {
    canonicalUrl: `${origin}/`,
    openGraphImageUrl: `${origin}/assets/mesto-hero.png`,
    catalogSummary: await loadHomeCatalogSummary(request),
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: "Место — городской гид" },
    { name: "description", content: DESCRIPTION },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:site_name", content: "Место" },
    { property: "og:title", content: "Место — городской гид" },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: data?.canonicalUrl },
    { property: "og:image", content: data?.openGraphImageUrl },
  ];
}

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    { rel: "stylesheet", href: "/styles.css?v=auth-merchant-3" },
    { rel: "stylesheet", href: "/gastro-theme.css?v=premium-foundation-3" },
    { rel: "stylesheet", href: "/ambient-premium.css?v=premium-2" },
    { rel: "stylesheet", href: "/phone-premium.css?v=premium-1" },
    { rel: "stylesheet", href: "/editorial-sections.css?v=premium-2" },
  ];
}

export function headers() {
  return {
    ...SECURITY_HEADERS,
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
  };
}

export function PublicHomeView({
  catalogSummary,
}: { catalogSummary?: HomeCatalogSummary } = {}) {
  return (
    <>
      <PublicHomeMarkup {...(catalogSummary ? { catalogSummary } : {})} />
      <script src="app.js?v=ui-motion-3" />
    </>
  );
}

export default function PublicHome() {
  const { catalogSummary } = useLoaderData<typeof loader>();
  return <PublicHomeView catalogSummary={catalogSummary} />;
}
