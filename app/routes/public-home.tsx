import type { Route } from "./+types/public-home";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import {
  redirect,
  useLoaderData,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import {
  PublicHomeMarkup,
  type HomeFeaturedVenue,
} from "../components/public/PublicHomeMarkup";
import { usePublicAccount } from "../components/public/account/PublicAccountProvider";
import { VenueSubmissionDialog } from "../components/public/submission/VenueSubmissionDialog";
import { resolvePublicOrigin } from "../lib/public-origin.server";
import { SECURITY_HEADERS } from "../lib/security-headers";
import { loadHomeCatalogSummary } from "../modules/home-catalog-summary.server";
import type { HomeCatalogSummary } from "../modules/home-catalog-summary";
import { loadHomeFeaturedVenues } from "../modules/home-featured-venues.server";

const DESCRIPTION =
  "Место — городской гид по ресторанам, кафе, барам и новым гастрономическим впечатлениям.";

export async function loader({ request }: Route.LoaderArgs) {
  const requestUrl = new URL(request.url);
  const compatibilityRoute = new Map([
    ["auth", "/login"],
    ["login", "/login"],
    ["register", "/register"],
    ["profile", "/profile"],
    ["favorites", "/favorites"],
  ]).get(requestUrl.searchParams.get("open") ?? "");
  if (compatibilityRoute) {
    return redirect(compatibilityRoute, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const origin = resolvePublicOrigin(request);
  const [catalogSummary, featuredVenues] = await Promise.all([
    loadHomeCatalogSummary(request),
    loadHomeFeaturedVenues(request),
  ]);

  return {
    canonicalUrl: `${origin}/`,
    openGraphImageUrl: `${origin}/assets/mesto-hero.png`,
    catalogSummary,
    featuredVenues,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [
    { title: "Место — городской гид" },
    { name: "description", content: DESCRIPTION },
    { name: "theme-color", content: "#f6f1ea" },
    { tagName: "link", rel: "canonical", href: data?.canonicalUrl },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "ru_RU" },
    { property: "og:site_name", content: "Место" },
    { property: "og:title", content: "Место — городской гид" },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: data?.canonicalUrl },
    { property: "og:image", content: data?.openGraphImageUrl },
  ];
}

export function links() {
  return [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "anonymous",
    },
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap",
    },
    { rel: "stylesheet", href: "/styles.css?v=auth-merchant-3" },
    { rel: "stylesheet", href: "/gastro-theme.css?v=premium-foundation-3" },
    { rel: "stylesheet", href: "/ambient-premium.css?v=premium-2" },
    { rel: "stylesheet", href: "/phone-premium.css?v=premium-1" },
    { rel: "stylesheet", href: "/editorial-sections.css?v=premium-2" },
  ];
}

export function headers() {
  return {
    ...SECURITY_HEADERS,
    "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
  };
}

export function PublicHomeView({
  catalogSummary,
  featuredVenues,
  submissionDialogContent,
}: {
  catalogSummary?: HomeCatalogSummary;
  featuredVenues?: readonly HomeFeaturedVenue[];
  submissionDialogContent?: ReactNode;
} = {}) {
  return (
    <PublicHomeMarkup
      interactiveHome
      {...(catalogSummary ? { catalogSummary } : {})}
      {...(featuredVenues ? { featuredVenues } : {})}
      {...(submissionDialogContent ? { submissionDialogContent } : {})}
    />
  );
}

function SubmissionRouteDialog() {
  const account = usePublicAccount();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = searchParams.get("open") === "submission";
  const openerRef = useRef<HTMLElement | null>(null);
  const wasRequestedRef = useRef(false);

  useLayoutEffect(() => {
    if (requested && !wasRequestedRef.current) {
      const activeElement = document.activeElement;
      openerRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
    }
    wasRequestedRef.current = requested;
  }, [requested]);

  useEffect(() => {
    if (!requested || account.status !== "anonymous") return;
    const returnTo = `${location.pathname}${location.search}${location.hash || "#guide"}`;
    void navigate(`/login?${new URLSearchParams({ returnTo }).toString()}`, { replace: true });
  }, [account.status, location.hash, location.pathname, location.search, navigate, requested]);

  const close = () => {
    const preferredOpener = openerRef.current;
    const dialog = document.querySelector<HTMLDialogElement>("#submission-dialog");
    if (dialog?.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute("open");
      }
    }
    const navigation = navigate({ pathname: "/", hash: "#guide" }, { replace: true });
    void Promise.resolve(navigation).then(() => {
      const restoreFocus = () => {
        const target = preferredOpener?.isConnected
          ? preferredOpener
          : document.getElementById("home-submission-link");
        target?.focus({ preventScroll: true });
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(restoreFocus);
      } else {
        window.setTimeout(restoreFocus, 0);
      }
    });
  };

  if (!requested) return null;
  if (account.status === "restoring") {
    return (
      <div className="toast home-favorite-toast home-submission-status is-visible" role="status">
        <span>Проверяем авторизацию перед открытием формы…</span>
      </div>
    );
  }
  if (account.status === "unavailable") {
    return (
      <div className="toast home-favorite-toast home-submission-status is-actionable is-visible" role="alert">
        <span>Не удалось проверить сессию. Форма не открыта, данные не отправлялись.</span>
        <span className="home-favorite-toast-actions">
          <button type="button" onClick={() => { void account.refresh(); }}>Повторить</button>
          <button type="button" onClick={close}>Закрыть</button>
        </span>
      </div>
    );
  }
  if (account.status !== "authenticated") return null;
  return (
    <VenueSubmissionDialog
      open
      defaultContactName={account.user?.name || account.user?.username || ""}
      defaultContactEmail={account.user?.email || ""}
      onClose={close}
    />
  );
}

export default function PublicHome() {
  const { catalogSummary, featuredVenues } = useLoaderData<typeof loader>();
  return (
    <PublicHomeView
      catalogSummary={catalogSummary}
      featuredVenues={featuredVenues}
      submissionDialogContent={<SubmissionRouteDialog />}
    />
  );
}
