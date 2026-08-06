import type { Route } from "./+types/merchant-layout";

import { MerchantWorkspaceApp } from "../components/merchant/MerchantWorkspaceApp";
import {
  loadMerchantRoute,
  merchantRouteHeaders,
  performMerchantAction,
} from "../modules/merchant-workspace.server";

export function loader({ request }: Route.LoaderArgs) {
  return loadMerchantRoute(request);
}

export function action({ request }: Route.ActionArgs) {
  return performMerchantAction(request);
}

export function meta() {
  return [
    { title: "Место — кабинет ресторатора" },
    { name: "description", content: "Защищённый кабинет ресторатора городского гида «Место»." },
    { name: "robots", content: "noindex,nofollow" },
    { name: "theme-color", content: "#102235" },
  ];
}

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    { rel: "stylesheet", href: "/merchant.css?v=merchant-3" },
  ];
}

export const headers = merchantRouteHeaders;

export function ErrorBoundary() {
  return (
    <main className="merchant-login" data-react-route="merchant-error">
      <section className="login-panel" aria-labelledby="merchant-error-title">
        <div className="login-panel__body">
          <p className="eyebrow">Кабинет ресторатора</p>
          <h1 id="merchant-error-title">Не удалось открыть кабинет</h1>
          <p className="login-lead">Обновите страницу. Если ошибка повторяется, обратитесь в редакцию «Места».</p>
          <a className="button button--primary" href="/merchant/overview">Попробовать снова</a>
        </div>
      </section>
    </main>
  );
}

export default function MerchantLayout({ loaderData }: Route.ComponentProps) {
  return <MerchantWorkspaceApp loaderData={loaderData} />;
}
