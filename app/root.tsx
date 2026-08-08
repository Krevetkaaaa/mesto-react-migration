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
import { SECURITY_HEADERS } from "./lib/security-headers";

const FAVICON_DATA_URL = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTYiIGZpbGw9IiMxMDIxMmIiLz48cGF0aCBkPSJNMzIgOWMtMTEgMC0yMCA5LTIwIDIwIDAgMTUgMjAgMjkgMjAgMjlzMjAtMTQgMjAtMjlDNTIgMTggNDMgOSAzMiA5WiIgZmlsbD0iIzM3ZDU5ZCIvPjxjaXJjbGUgY3g9IjMyIiBjeT0iMjkiIHI9IjgiIGZpbGw9IiMxMDIxMmIiLz48L3N2Zz4=";

function isInteractivePublicPath(pathname: string) {
  return pathname === "/"
    || pathname === "/catalog"
    || pathname.startsWith("/city/")
    || pathname.startsWith("/venue/")
    || ["/login", "/register", "/profile", "/favorites"].includes(pathname);
}

function isMerchantPath(pathname: string) {
  return pathname === "/merchant" || pathname.startsWith("/merchant/");
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const isAccountOverlay = ["/login", "/register", "/favorites"].includes(pathname);
  const isCatalog = pathname === "/catalog"
    || pathname.startsWith("/city/")
    || pathname.startsWith("/venue/");
  const hydratesPublicRoute = isInteractivePublicPath(pathname);
  const hydratesRoute = hydratesPublicRoute || isMerchantPath(pathname) || isAdminPath(pathname);
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
        <link rel="icon" href={FAVICON_DATA_URL} type="image/svg+xml" />
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
  if (isMerchantPath(pathname) || isAdminPath(pathname)) return <Outlet />;
  return (
    <PublicAccountProvider>
      <Outlet />
    </PublicAccountProvider>
  );
}

export function headers() {
  return SECURITY_HEADERS;
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
