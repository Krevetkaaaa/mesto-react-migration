import type { Route } from "./+types/public-home";

import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import { resolvePublicOrigin } from "../lib/public-origin.server";

const DESCRIPTION =
  "Место — городской гид по ресторанам, кафе, барам и новым гастрономическим впечатлениям.";

export function loader({ request }: Route.LoaderArgs) {
  const origin = resolvePublicOrigin(request);

  return {
    canonicalUrl: `${origin}/`,
    openGraphImageUrl: `${origin}/assets/mesto-hero.png`,
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
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    "X-Content-Type-Options": "nosniff",
  };
}

export function PublicHomeView() {
  return (
    <>
      <PublicHomeMarkup />
      <script src="app.js?v=ui-motion-2" />
    </>
  );
}

export default function PublicHome() {
  return <PublicHomeView />;
}
