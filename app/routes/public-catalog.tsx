import type { Route } from "./+types/public-catalog";

import { CatalogScreen } from "../components/public/catalog/CatalogScreen";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import {
  PUBLIC_CATALOG_DESCRIPTION,
  publicCatalogHeaders,
  publicCatalogLinks,
} from "../lib/public-catalog-route";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { loadPublicCatalog } from "../modules/public-catalog.server";

export async function loader({ request }: Route.LoaderArgs) {
  const origin = resolvePublicOrigin(request);
  return {
    canonicalUrl: `${origin}/catalog`,
    snapshot: await loadPublicCatalog(request),
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: "Каталог мест — Место" },
    { name: "description", content: PUBLIC_CATALOG_DESCRIPTION },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:site_name", content: "Место" },
    { property: "og:title", content: "Каталог мест — Место" },
    { property: "og:description", content: PUBLIC_CATALOG_DESCRIPTION },
    { property: "og:url", content: data?.canonicalUrl },
  ];
}

export const links = publicCatalogLinks;
export const headers = publicCatalogHeaders;

export default function PublicCatalog({ loaderData }: Route.ComponentProps) {
  return <PublicHomeMarkup standalone catalogVisible catalogContent={<CatalogScreen snapshot={loaderData.snapshot} />} />;
}
