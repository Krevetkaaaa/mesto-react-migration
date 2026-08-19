import type { Route } from "./+types/admin-layout";

import { AdminConsoleApp } from "../components/admin/AdminConsoleApp";
import {
  adminRouteHeaders,
  loadAdminRoute,
  performAdminAction,
} from "../modules/admin-console.server";

export function loader({ request }: Route.LoaderArgs) {
  return loadAdminRoute(request);
}

export function action({ request }: Route.ActionArgs) {
  return performAdminAction(request);
}

export function meta() {
  return [
    { title: "Место — админ-панель" },
    { name: "description", content: "Закрытая административная панель городского гида «Место»." },
    { name: "robots", content: "noindex,nofollow" },
    { name: "theme-color", content: "#101d2f" },
  ];
}

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    { rel: "stylesheet", href: "/admin.css?v=admin-5" },
    { rel: "stylesheet", href: "/admin-overrides.css?v=admin-5" },
  ];
}

export const headers = adminRouteHeaders;

export function ErrorBoundary() {
  return (
    <main className="admin-login" data-react-route="admin" data-admin-state="error">
      <section className="login-card" aria-labelledby="admin-error-title">
        <a className="admin-brand" href="/" aria-label="Место — на главную"><span>Место</span><i>✦</i></a>
        <p className="admin-eyebrow">Закрытая зона редакции</p>
        <h1 id="admin-error-title">Не удалось открыть админ-панель</h1>
        <p>Обновите страницу. Если ошибка повторяется, проверьте подключение базы данных и конфигурацию сервера.</p>
        <a href="/admin/overview">Попробовать снова</a>
      </section>
    </main>
  );
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return <AdminConsoleApp loaderData={loaderData} />;
}
