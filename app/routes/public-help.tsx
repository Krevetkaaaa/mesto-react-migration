import type { Route } from "./+types/public-help";

import { PublicHelpMarkup } from "../components/public/PublicHelpMarkup";
import { resolvePublicOrigin } from "../lib/public-origin.server";

const DESCRIPTION =
  "Помощь, ответы на вопросы и правила городского ресторанного гида «Место».";

export function loader({ request }: Route.LoaderArgs) {
  const origin = resolvePublicOrigin(request);

  return {
    canonicalUrl: `${origin}/help`,
    openGraphImageUrl: `${origin}/assets/mesto-hero.png`,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: "Помощь — Место" },
    { name: "description", content: DESCRIPTION },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:site_name", content: "Место" },
    { property: "og:title", content: "Помощь — Место" },
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
    { rel: "stylesheet", href: "/help.css?v=theme-1" },
  ];
}

export function headers() {
  return {
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
    "X-Content-Type-Options": "nosniff",
  };
}

export function PublicHelpView() {
  return <PublicHelpMarkup />;
}

export default function PublicHelp() {
  return <PublicHelpView />;
}
