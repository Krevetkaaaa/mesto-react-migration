import type { Route } from "./+types/public-profile";

import { AccountRouteFailure, ProfileView } from "../components/public/account/AccountViews";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import {
  loadProtectedAccountRoute,
  performLogoutAction,
  publicAccountHeaders,
} from "../modules/public-account.server";

export function loader({ request }: Route.LoaderArgs) {
  return loadProtectedAccountRoute(request);
}

export function action({ request }: Route.ActionArgs) {
  return performLogoutAction(request);
}

export function meta() {
  return [
    { title: "Личный кабинет — Место" },
    { name: "description", content: "Личный кабинет пользователя городского гида «Место»." },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export { links } from "./public-home";
export const headers = publicAccountHeaders;

export function ErrorBoundary() {
  return <PublicHomeMarkup standalone homeBackdrop routeKind="profile" accountDialogContent={<AccountRouteFailure />} />;
}

export default function PublicProfile({ loaderData }: Route.ComponentProps) {
  if (!loaderData.user) return null;
  return <PublicHomeMarkup standalone accountUser={loaderData.user} favoriteCount={loaderData.favorites.length} routeKind="profile" profileContent={<ProfileView favorites={loaderData.favorites} user={loaderData.user} />} />;
}
