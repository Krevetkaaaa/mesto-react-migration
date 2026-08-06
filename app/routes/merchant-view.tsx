import type { Route } from "./+types/merchant-view";

const MERCHANT_VIEWS = new Set(["overview", "venue", "menu", "promotions", "reviews"]);

export function loader({ params }: Route.LoaderArgs) {
  if (!params.view || !MERCHANT_VIEWS.has(params.view)) {
    // React Router intentionally uses thrown Response values for HTTP route errors.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        Vary: "Cookie",
      },
    });
  }
  return null;
}

export default function MerchantViewRoute() {
  return null;
}
