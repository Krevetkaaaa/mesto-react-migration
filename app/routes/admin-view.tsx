import type { Route } from "./+types/admin-view";
import { SECURITY_HEADERS } from "../lib/security-headers";

const ADMIN_VIEWS = new Set(["overview", "submissions", "reviews", "venues", "merchants"]);

export function loader({ params }: Route.LoaderArgs) {
  if (!params.view || !ADMIN_VIEWS.has(params.view)) {
    // React Router intentionally uses thrown Response values for HTTP route errors.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw new Response("Not Found", {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        Vary: "Cookie",
      },
    });
  }
  return null;
}

export default function AdminViewRoute() {
  return null;
}
