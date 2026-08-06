import type { Route } from "./+types/public-register";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { AccountRouteFailure, AuthDialog } from "../components/public/account/AccountViews";
import { PublicHomeMarkup } from "../components/public/PublicHomeMarkup";
import {
  loadAuthRoute,
  performAuthAction,
  publicAccountHeaders,
} from "../modules/public-account.server";
import { accountActionFailed } from "../modules/public-account-route";

export function loader({ request }: Route.LoaderArgs) {
  return loadAuthRoute(request);
}

export function action({ request }: Route.ActionArgs) {
  return performAuthAction(request, "register");
}

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return accountActionFailed(actionResult) ? false : defaultShouldRevalidate;
}

export function meta() {
  return [
    { title: "Регистрация — Место" },
    { name: "description", content: "Создание профиля в городском гиде «Место»." },
    { name: "robots", content: "noindex,follow" },
  ];
}

export { links } from "./public-home";
export const headers = publicAccountHeaders;

export function ErrorBoundary() {
  return <PublicHomeMarkup standalone homeBackdrop routeKind="register" accountDialogContent={<AccountRouteFailure />} />;
}

export default function PublicRegister({ actionData, loaderData }: Route.ComponentProps) {
  return (
    <PublicHomeMarkup
      standalone
      homeBackdrop
      routeKind="register"
      accountDialogContent={<AuthDialog actionData={actionData} mode="register" oauthCallbackError={loaderData.oauthError} providers={loaderData.providers} returnTo={loaderData.returnTo} />}
    />
  );
}
