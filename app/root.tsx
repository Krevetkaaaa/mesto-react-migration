import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";

const THEMED_PUBLIC_PATHS = new Set(["/", "/help"]);

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const loadsPublicTheme = THEMED_PUBLIC_PATHS.has(pathname);

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        {loadsPublicTheme ? <script src="/theme.js?v=theme-1" /> : null}
        <Links />
      </head>
      <body className={isHome ? "is-home-view" : undefined}>{children}</body>
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
