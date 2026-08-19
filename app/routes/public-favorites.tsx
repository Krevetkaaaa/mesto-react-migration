import type { Route } from "./+types/public-favorites";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { AccountRouteFailure, FavoritesDialog } from "../components/public/account/AccountViews";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import {
  loadProtectedAccountRoute,
  performFavoriteAction,
  publicAccountHeaders,
} from "../modules/public-account.server";
import { accountActionFailed } from "../modules/public-account-route";

export function loader({ request }: Route.LoaderArgs) {
  return loadProtectedAccountRoute(request);
}

export function action({ request }: Route.ActionArgs) {
  return performFavoriteAction(request);
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return accountActionFailed(actionResult) ? false : defaultShouldRevalidate;
}

export function meta() {
  return [
    { title: "Избранные места — Место" },
    { name: "description", content: "Сохранённые места пользователя городского гида «Место»." },
    { name: "robots", content: "noindex,nofollow" },
  ];
}

export { links } from "./public-home";
export const headers = publicAccountHeaders;

export function ErrorBoundary() {
  return <PublicHomeMarkup standalone homeBackdrop routeKind="favorites" accountDialogContent={<AccountRouteFailure />} />;
}

export default function PublicFavorites({ actionData, loaderData }: Route.ComponentProps) {
  return (
    <PublicHomeMarkup
      standalone
      homeBackdrop
      accountUser={loaderData.user}
      favoriteCount={loaderData.favorites.length}
      routeKind="favorites"
      accountDialogContent={<FavoritesDialog actionData={actionData} favorites={loaderData.favorites} />}
    />
  );
}
