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
import { PublicAccountProvider } from "./components/public/account/PublicAccountProvider";

function isInteractivePublicPath(pathname: string) {
  return pathname === "/catalog"
    || pathname.startsWith("/city/")
    || pathname.startsWith("/venue/")
    || ["/login", "/register", "/profile", "/favorites"].includes(pathname);
}

function isMerchantPath(pathname: string) {
  return pathname === "/merchant" || pathname.startsWith("/merchant/");
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isAccountOverlay = ["/login", "/register", "/favorites"].includes(pathname);
  const isCatalog = pathname === "/catalog"
    || pathname.startsWith("/city/")
    || pathname.startsWith("/venue/");
  const hydratesPublicRoute = isInteractivePublicPath(pathname);
  const hydratesRoute = hydratesPublicRoute || isMerchantPath(pathname);
  const loadsPublicTheme = isHome || pathname === "/help" || hydratesPublicRoute;
  const bodyClassName = isHome || isAccountOverlay
    ? "is-home-view"
    : isCatalog
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
        {hydratesRoute ? (
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
  const { pathname } = useLocation();
  if (isMerchantPath(pathname)) return <Outlet />;
  return (
    <PublicAccountProvider>
      <Outlet />
    </PublicAccountProvider>
  );
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
