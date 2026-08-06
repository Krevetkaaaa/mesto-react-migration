import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";

function isInteractivePublicPath(pathname: string) {
  return pathname === "/catalog"
    || pathname.startsWith("/city/")
    || pathname.startsWith("/venue/");
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const hydratesPublicRoute = isInteractivePublicPath(pathname);
  const loadsPublicTheme = isHome || pathname === "/help" || hydratesPublicRoute;
  const bodyClassName = isHome
    ? "is-home-view"
    : hydratesPublicRoute
      ? "is-catalog-view"
      : undefined;

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        {loadsPublicTheme ? <script src="/theme.js?v=theme-1" /> : null}
        <Links />
      </head>
      <body className={bodyClassName}>
        {children}
        {hydratesPublicRoute ? (
          <>
            <ScrollRestoration />
            <Scripts />
          </>
        ) : null}
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) && error.status === 404 ? 404 : 500;
  const title = status === 404 ? "Страница не найдена" : "Ошибка приложения";

  return (
    <>
      <title>{`${status} — ${title}`}</title>
      <meta name="robots" content="noindex,nofollow" />
      <meta
        name="description"
        content={status === 404 ? "Запрошенная страница не найдена." : "Произошла ошибка приложения."}
      />
      <main data-react-error={status}>
        <h1>{title}</h1>
        <p>Запрошенный React-маршрут сейчас недоступен.</p>
      </main>
    </>
  );
}
