import type { Route } from "./+types/public-venue";
import { data } from "react-router";

import { CatalogScreen } from "../components/public/catalog/CatalogScreen";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import { VenueDialog } from "../components/public/venue/VenueDialog";
import { isApplicationError } from "../lib/application-error";
import { publicCatalogHeaders, publicCatalogLinks } from "../lib/public-catalog-route";
import { publicVenueDocumentCacheTags } from "../lib/public-cache-tags";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { loadPublicCatalog, loadPublicVenue } from "../modules/public-catalog.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const slug = params.venueSlug;
  try {
    const [detail, snapshot] = await Promise.all([
      loadPublicVenue(request, slug),
      loadPublicCatalog(request),
    ]);
    const origin = resolvePublicOrigin(request);
    return data({
      canonicalUrl: `${origin}/venue/${detail.venue.slug}`,
      detail,
      returnTo: new URL(request.url).searchParams.get("from"),
      snapshot,
    }, {
      headers: { "Vercel-Cache-Tag": publicVenueDocumentCacheTags(detail.venue.id) },
    });
  } catch (error) {
    if (isApplicationError(error)) {
      const status = error.status
        ?? (error.kind === "validation" ? 400 : error.kind === "not-found" ? 404 : 503);
      // React Router uses thrown responses to preserve the route HTTP status.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw new Response(error.kind === "not-found" ? "Заведение не найдено" : "Карточка временно недоступна", {
        status,
      });
    }
    throw error;
  }
}

export function meta({ data }: Route.MetaArgs) {
  const venue = data?.detail.venue;
  const title = venue ? `${venue.title} — ${venue.city} — Место` : "Заведение — Место";
  return [
    { title },
    { name: "description", content: venue?.description ?? "Карточка опубликованного заведения в каталоге «Место»." },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "restaurant" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:title", content: title },
    { property: "og:description", content: venue?.description ?? "" },
    { property: "og:url", content: data?.canonicalUrl },
    ...(venue?.photos[0] ? [{ property: "og:image", content: new URL(venue.photos[0], data?.canonicalUrl).toString() }] : []),
  ];
}

export const links = publicCatalogLinks;
export const headers = publicCatalogHeaders;

export default function PublicVenue({ loaderData }: Route.ComponentProps) {
  return (
    <PublicHomeMarkup
      standalone
      catalogVisible
      catalogContent={<CatalogScreen snapshot={loaderData.snapshot} />}
      venueDialogContent={<VenueDialog detail={loaderData.detail} returnTo={loaderData.returnTo} />}
    />
  );
}
