import type { Route } from "./+types/public-city";

import { CatalogScreen } from "../components/public/catalog/CatalogScreen";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import { publicCatalogHeaders, publicCatalogLinks } from "../lib/public-catalog-route";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { cityForSlug } from "../modules/catalog-url-state";
import { loadPublicCatalog } from "../modules/public-catalog.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const city = cityForSlug(params.citySlug);
  // React Router uses thrown responses to preserve the route HTTP status.
  // eslint-disable-next-line @typescript-eslint/only-throw-error
  if (!city) throw new Response("Город не найден", { status: 404 });
  const origin = resolvePublicOrigin(request);
  return {
    city,
    canonicalUrl: `${origin}/city/${params.citySlug.toLocaleLowerCase("en-US")}`,
    snapshot: await loadPublicCatalog(request, city),
  };
}

export function meta({ data }: Route.MetaArgs) {
  const title = data ? `Рестораны и кафе: ${data.city} — Место` : "Город не найден — Место";
  const description = data ? `Опубликованные рестораны, кафе и бары города ${data.city} в гиде «Место».` : "";
  return [
    { title },
    { name: "description", content: description },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: data?.canonicalUrl },
  ];
}

export const links = publicCatalogLinks;
export const headers = publicCatalogHeaders;

export default function PublicCity({ loaderData }: Route.ComponentProps) {
  return <PublicHomeMarkup standalone catalogVisible catalogContent={<CatalogScreen snapshot={loaderData.snapshot} cityLanding />} />;
}
