import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  PASSWORD_ERROR_MESSAGE,
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from "../../../password-policy.mjs";
import type { User } from "../../lib/domain";
import {
  catalogHref,
  defaultCatalogUrlState,
  type CatalogUrlState,
} from "../../modules/catalog-url-state";
import type { HomeCatalogSummary } from "../../modules/home-catalog-summary";
import { useOptionalPublicAccount } from "./account/PublicAccountProvider";

const EMPTY_HOME_CATALOG_SUMMARY: HomeCatalogSummary = {
  total: 0,
  byCategory: {},
  byCity: {},
  source: "editorial-fallback",
  databaseConfigured: false,
};

function placeWord(count: number) {
  const remainder = Math.abs(count) % 100;
  const lastDigit = remainder % 10;
  if (remainder > 10 && remainder < 20) return "мест";
  if (lastDigit === 1) return "место";
  if (lastDigit >= 2 && lastDigit <= 4) return "места";
  return "мест";
}

function venueWord(count: number) {
  const remainder = Math.abs(count) % 100;
  const lastDigit = remainder % 10;
  if (remainder > 10 && remainder < 20) return "заведений";
  if (lastDigit === 1) return "заведение";
  if (lastDigit >= 2 && lastDigit <= 4) return "заведения";
  return "заведений";
}

function placeCount(count: number) {
  return `${new Intl.NumberFormat("ru-RU").format(count)} ${placeWord(count)}`;
}

function cityPlaceCount(summary: HomeCatalogSummary, city: string) {
  const count = summary.byCity[city] ?? 0;
  return count ? placeCount(count) : "Скоро";
}

function catalogLink(state: Partial<CatalogUrlState> = {}) {
  return catalogHref({ ...defaultCatalogUrlState(), ...state });
}

export interface PublicHomeMarkupProps {
  accountDialogContent?: ReactNode;
  accountUser?: User | null;
  catalogContent?: ReactNode;
  catalogVisible?: boolean;
  catalogSummary?: HomeCatalogSummary;
  homeBackdrop?: boolean;
  favoriteCount?: number;
  profileContent?: ReactNode;
  routeKind?: "catalog" | "favorites" | "login" | "profile" | "register";
  standalone?: boolean;
  venueDialogContent?: ReactNode;
}

/**
 * Trusted static markup ported mechanically from index.html.
 * It contains no user-derived data and intentionally uses literal JSX instead
 * without raw HTML injection so the legacy DOM contract remains reviewable.
 */
export function PublicHomeMarkup({
  accountDialogContent,
  accountUser = null,
  catalogContent,
  catalogVisible = false,
  catalogSummary = EMPTY_HOME_CATALOG_SUMMARY,
  homeBackdrop = false,
  favoriteCount = 0,
  profileContent,
  routeKind = "catalog",
  standalone = false,
  venueDialogContent,
}: PublicHomeMarkupProps = {}) {
  const account = useOptionalPublicAccount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobileMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const resolvedUser = account?.status === "authenticated" ? account.user : accountUser;
  const resolvedFavoriteCount = account?.status === "authenticated"
    ? account.favoriteKeys.size
    : favoriteCount;
  const accountInitials = (resolvedUser?.name || resolvedUser?.username || "М")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("ru-RU") || "М";
  const bridgeToAccount = (action: "favorites" | "login" | "profile" | "register") => {
    if (!standalone || typeof window === "undefined") return;
    window.location.assign(`/${action}`);
  };

  useEffect(() => {
    if (!standalone || !mobileOpen) return;
    const mobileNav = mobileNavRef.current;
    if (!mobileNav) return;

    const activeElement = document.activeElement;
    mobileMenuReturnFocusRef.current = activeElement instanceof HTMLElement && !mobileNav.contains(activeElement)
      ? activeElement
      : mobileMenuToggleRef.current;
    const backgroundState = Array.from(mobileNav.parentElement?.children ?? [])
      .filter((element) => element !== mobileNav)
      .map((element) => ({
        element,
        inert: element.getAttribute("inert"),
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    backgroundState.forEach(({ element }) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    const focusableElements = () => Array.from(mobileNav.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href]',
    )).filter((element) => !element.hidden && element.tabIndex >= 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (!focusable.length) return;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? (activeIndex <= 0 ? focusable.length - 1 : activeIndex - 1)
        : (activeIndex < 0 || activeIndex === focusable.length - 1 ? 0 : activeIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    mobileNav.querySelector<HTMLElement>(".mobile-nav-close")?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      backgroundState.forEach(({ element, inert, ariaHidden }) => {
        if (inert === null) element.removeAttribute("inert");
        else element.setAttribute("inert", inert);
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      const returnFocus = mobileMenuReturnFocusRef.current;
      mobileMenuReturnFocusRef.current = null;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [mobileOpen, standalone]);

  return (
    <>
    <svg className="svg-sprite" aria-hidden="true">
      <symbol id="arrow" viewBox="0 0 24 24"><path d="M5 12h13M14 6l6 6-6 6" /></symbol>
      <symbol id="search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></symbol>
      <symbol id="pin" viewBox="0 0 24 24"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.25" /></symbol>
      <symbol id="heart" viewBox="0 0 24 24"><path d="M20.8 8.7c0 5.2-8.8 10.5-8.8 10.5S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z" /></symbol>
      <symbol id="paw" viewBox="0 0 24 24"><ellipse cx="12" cy="15.5" rx="4.5" ry="3.4" /><circle cx="5.5" cy="10" r="1.8" /><circle cx="10" cy="6.5" r="1.8" /><circle cx="14.5" cy="6.5" r="1.8" /><circle cx="18.5" cy="10" r="1.8" /></symbol>
      <symbol id="coffee" viewBox="0 0 24 24"><path d="M5 9h11v5.5A4.5 4.5 0 0 1 11.5 19h-2A4.5 4.5 0 0 1 5 14.5Z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M7 5c0 1 1 1 1 2M11 5c0 1 1 1 1 2" /></symbol>
      <symbol id="restaurant" viewBox="0 0 24 24"><path d="M7 4v7M4.5 4v3.5a2.5 2.5 0 0 0 5 0V4M7 11.5V20M16 4v16M16 4c3 1.5 3 5 0 6" /></symbol>
      <symbol id="cocktail" viewBox="0 0 24 24"><path d="M5 5h14l-6.3 7v6h3.3M10 18h5M8 8h8" /></symbol>
      <symbol id="bolt" viewBox="0 0 24 24"><path d="m13 3-8 10h6l-1 8 8-10h-6Z" /></symbol>
      <symbol id="park" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M9 16V8h3.3a2.8 2.8 0 1 1 0 5.6H9" /></symbol>
      <symbol id="bell" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></symbol>
      <symbol id="grid" viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></symbol>
      <symbol id="chart" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></symbol>
      <symbol id="users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3.1 2.5-5 5.5-5s5 1.9 5.5 5M16 5.5a3 3 0 0 1 0 5.7M16 14a5.3 5.3 0 0 1 4.5 5" /></symbol>
      <symbol id="sliders" viewBox="0 0 24 24"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></symbol>
      <symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      <symbol id="camera" viewBox="0 0 24 24"><path d="M4 8h4l1.5-2h5L16 8h4v11H4Z" /><circle cx="12" cy="13.5" r="3.2" /></symbol>
      <symbol id="external" viewBox="0 0 24 24"><path d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></symbol>
      <symbol id="star" viewBox="0 0 24 24"><path d="m12 3 2.7 5.4 6 .9-4.4 4.3 1 6.1-5.3-2.8-5.3 2.8 1-6.1L3.3 9.3l6-.9Z" /></symbol>
      <symbol id="cake" viewBox="0 0 24 24"><path d="M5 20h14M7 20v-6h10v6M6 14h12l-1.2-4H7.2ZM9 8V4M12 8V3M15 8V4" /></symbol>
      <symbol id="pizza" viewBox="0 0 24 24"><path d="M4 6c5.5-2.3 10.5-2.3 16 0l-8 14Z" /><circle cx="12" cy="11" r="1" /><circle cx="10" cy="15" r="1" /><circle cx="15" cy="15" r="1" /></symbol>
      <symbol id="menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
      <symbol id="wifi" viewBox="0 0 24 24"><path d="M4.5 9.4a11 11 0 0 1 15 0M7.6 12.6a6.6 6.6 0 0 1 8.8 0M10.7 15.8a2.2 2.2 0 0 1 2.6 0" /><circle cx="12" cy="19" r="1" /></symbol>
      <symbol id="clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></symbol>
      <symbol id="phone" viewBox="0 0 24 24"><path d="M7.2 3.5 10 7.8 7.9 10c1.3 2.8 3.4 4.9 6.2 6.2l2.1-2.1 4.3 2.8v3c0 .7-.6 1.3-1.3 1.3C10.1 21.2 2.8 13.9 2.8 4.8c0-.7.6-1.3 1.3-1.3Z" /></symbol>
      <symbol id="sparkle" viewBox="0 0 24 24"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6Z" /></symbol>
      <symbol id="logo-star" viewBox="0 0 24 24"><path d="M12 1.5c.7 6.3 1.9 9.5 8.5 10.5-6.6 1-7.8 4.2-8.5 10.5C11.3 16.2 10.1 13 3.5 12c6.6-1 7.8-4.2 8.5-10.5Z" /></symbol>
      <symbol id="telegram" viewBox="0 0 24 24"><path d="m20.4 4.6-3 14.1c-.2 1-.8 1.2-1.6.8l-4.5-3.3-2.2 2.1c-.2.2-.5.4-.9.4l.3-4.5 8.2-7.4c.4-.3-.1-.5-.6-.2L6 13 1.6 11.6c-1-.3-1-1 .2-1.5l17.1-6.6c.8-.3 1.5.2 1.5 1.1Z" /></symbol>
      <symbol id="instagram" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17.4" cy="6.8" r=".9" /></symbol>
    </svg>

    <header className="site-header">
      <a className="brand brand-mark" href={standalone ? "/" : "#guide"} data-home-link="" aria-label="Место — на главную"><svg className="brand-pin"><use href="#pin" /></svg><span className="brand-word">Место</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a>
      <nav className="main-nav" aria-label="Основная навигация">
        <a href={standalone ? "/catalog?category=Рестораны" : "#popular"}>Рестораны</a><a href={standalone ? "/#categories" : "#categories"} data-open-categories="">Категории</a><a href={standalone ? "/#collections" : "#collections"}>Подборки</a><a href={standalone ? "/#how-it-works" : "#how-it-works"}>О проекте</a><a href="#site-footer">Контакты</a>
      </nav>
      <div className="header-actions">
        <button ref={mobileMenuToggleRef} className="mobile-menu-toggle" type="button" aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={standalone ? mobileOpen : false} onClick={() => { if (standalone) setMobileOpen(true); }}><span></span><span></span></button>
        <button className="theme-toggle" type="button" data-theme-toggle="" aria-label="Сменить цветовую тему" suppressHydrationWarning>
          <span className="theme-toggle-glyph" aria-hidden="true"><i className="theme-sun"></i><i className="theme-moon"></i><i className="theme-star">✦</i></span>
          <span className="sr-only" data-theme-status="" aria-live="polite" suppressHydrationWarning>Включена светлая тема</span>
        </button>
        <button className="circle-button favorites-button" type="button" aria-label="Избранные" data-open-favorites="" onClick={() => bridgeToAccount("favorites")}><svg><use href="#heart" /></svg><span className="favorites-count" hidden={resolvedFavoriteCount === 0}>{resolvedFavoriteCount}</span></button>
        <button className={`login-trigger${resolvedUser ? " profile-button" : ""}`} type="button" aria-label={resolvedUser ? "Открыть личный кабинет" : "Войти или зарегистрироваться"} data-open-auth="" onClick={() => bridgeToAccount(resolvedUser ? "profile" : "login")}>{resolvedUser ? accountInitials : "Войти"}</button>
        <button className="register-trigger" type="button" data-open-register="" hidden={Boolean(resolvedUser)} onClick={() => bridgeToAccount("register")}>Регистрация</button>
      </div>
    </header>

    <main data-react-route={standalone ? routeKind : "home"} data-home-catalog-source={catalogSummary.source}>
      {!standalone || homeBackdrop ? (<>
      <section className="guide-screen" id="guide" aria-labelledby="guide-title">
        <div className="hero-photo" role="img" aria-label="Побережье Крыма с горами и Чёрным морем"></div>
        <div className="hero-content">
          <p className="eyebrow hero-eyebrow">Ресторанный гид · Крым</p>
          <h1 id="guide-title">Лучшие места<br />в вашем городе</h1>
          <p className="hero-lead">Открывайте атмосферные рестораны, авторскую кухню и незабываемые впечатления.</p>
          <form className="search-panel" id="venue-search">
            <label className="search-field">
              <svg><use href="#search" /></svg>
              <input name="query" type="search" placeholder="Куда хотите сходить?" autoComplete="off" />
            </label>
            <label className="city-field">
              <svg><use href="#pin" /></svg>
              <select name="city" aria-label="Город"><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option><option>Судак</option><option>Керчь</option><option>Бахчисарай</option><option>Балаклава</option><option>Саки</option><option>Гурзуф</option></select>
            </label>
            <label className="date-field">
              <svg><use href="#clock" /></svg>
              <select name="when" aria-label="Когда"><option>Сегодня</option><option>Сегодня вечером</option><option>На выходных</option></select>
            </label>
            <button className="search-button" type="submit">Найти <svg><use href="#arrow" /></svg></button>
          </form>
          <div className="quick-filters" aria-label="Быстрые фильтры">
            <a href={catalogLink({ category: "Рестораны" })} data-filter="Рестораны">Рестораны</a><a href={catalogLink({ category: "Кафе" })} data-filter="Кафе">Кафе</a><a href={catalogLink({ category: "Кофейни" })} data-filter="Кофейни">Кофейни</a><a href={catalogLink({ category: "Кондитерские" })} data-filter="Кондитерские">Кондитерские</a><a href={catalogLink({ category: "Бары" })} data-filter="Бары">Бары</a><a href={catalogLink({ category: "Фаст-кэжуал" })} data-filter="Фаст-кэжуал">Фаст-кэжуал</a>
          </div>
        </div>
        <div className="hero-note" aria-live="polite"><span className="catalog-status" aria-hidden="true"></span><span className="catalog-total" data-venue-total-label="venues"><strong data-venue-count="" aria-label={String(catalogSummary.total)}>{catalogSummary.total}</strong>{` ${venueWord(catalogSummary.total)}`}</span><small>в каталоге онлайн</small></div>
      </section>

      <section className="content-section categories-section" id="categories" aria-labelledby="categories-title">
        <div className="section-heading">
          <div><p className="eyebrow">Выберите настроение</p><h2 id="categories-title">Категории заведений</h2></div>
          <a className="text-link" href="/catalog" data-open-categories="">Все категории <svg><use href="#arrow" /></svg></a>
        </div>
        <div className="category-grid">
          <a className="category-card cafe" href={catalogLink({ category: "Кафе" })} data-filter-category="Кафе"><svg><use href="#coffee" /></svg><span>Кафе</span><small data-category-count="Кафе">{placeCount(catalogSummary.byCategory["Кафе"] ?? 0)}</small></a>
          <a className="category-card dining" href={catalogLink({ category: "Рестораны" })} data-filter-category="Рестораны"><svg><use href="#restaurant" /></svg><span>Рестораны</span><small data-category-count="Рестораны">{placeCount(catalogSummary.byCategory["Рестораны"] ?? 0)}</small></a>
          <a className="category-card coffee" href={catalogLink({ category: "Кофейни" })} data-filter-category="Кофейни"><svg><use href="#coffee" /></svg><span>Кофейни</span><small data-category-count="Кофейни">{placeCount(catalogSummary.byCategory["Кофейни"] ?? 0)}</small></a>
          <a className="category-card dessert" href={catalogLink({ category: "Кондитерские" })} data-filter-category="Кондитерские"><svg><use href="#cake" /></svg><span>Кондитерские</span><small data-category-count="Кондитерские">{placeCount(catalogSummary.byCategory["Кондитерские"] ?? 0)}</small></a>
          <a className="category-card pizza" href={catalogLink({ category: "Пиццерии" })} data-filter-category="Пиццерии"><svg><use href="#pizza" /></svg><span>Пиццерии</span><small data-category-count="Пиццерии">{placeCount(catalogSummary.byCategory["Пиццерии"] ?? 0)}</small></a>
          <a className="category-card casual" href={catalogLink({ category: "Фаст-кэжуал" })} data-filter-category="Фаст-кэжуал"><svg><use href="#bolt" /></svg><span>Фаст-кэжуал</span><small data-category-count="Фаст-кэжуал">{placeCount(catalogSummary.byCategory["Фаст-кэжуал"] ?? 0)}</small></a>
          <a className="category-card bar" href={catalogLink({ category: "Бары" })} data-filter-category="Бары"><svg><use href="#cocktail" /></svg><span>Бары</span><small data-category-count="Бары">{placeCount(catalogSummary.byCategory["Бары"] ?? 0)}</small></a>
          <a className="category-card gastropub" href={catalogLink({ category: "Гастробары" })} data-filter-category="Гастробары"><svg><use href="#sparkle" /></svg><span>Гастробары</span><small data-category-count="Гастробары">{placeCount(catalogSummary.byCategory["Гастробары"] ?? 0)}</small></a>
        </div>
      </section>

      <section className="content-section popular-section" id="popular" aria-labelledby="popular-title">
        <div className="section-heading">
          <div><p className="eyebrow">Выбор гостей</p><h2 id="popular-title">Популярные рестораны</h2></div>
          <a className="text-link" href="/catalog" data-show-all="">Смотреть всё <svg><use href="#arrow" /></svg></a>
        </div>
        <div className="venue-grid">
          <button className="venue-card" type="button" data-venue="marea" data-category="Рестораны" data-city="Севастополь" data-cuisine="Средиземноморская" data-source="yandex" data-pet="0" data-parking="1" data-score="4.9" data-new="0" data-search="баркас ресторан средиземноморская кухня море севастополь">
            <span className="venue-image"><img src="assets/venue-restaurant-unsplash.jpg" alt="Тёплый интерьер ресторана" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Чёрное море</span></span>
            <span className="venue-body"><strong>Баркас</strong><small>Черноморская и средиземноморская кухня</small><span className="venue-meta"><b>4.9</b><i></i> редакционная оценка</span><span className="venue-price">от 1 300 ₽</span></span>
          </button>
          <button className="venue-card" type="button" data-venue="zerno" data-category="Кофейни" data-city="Симферополь" data-cuisine="Кофе и десерты" data-pet="1" data-parking="1" data-score="4.8" data-new="1" data-search="зерно кофейня кофе завтраки симферополь">
            <span className="venue-image"><img src="assets/venue-coffee-unsplash.jpg" alt="Интерьер спешелти-кофейни" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">Завтраки</span></span>
            <span className="venue-body"><strong>Зерно</strong><small>Спешелти-кофейня</small><span className="venue-meta"><b>4.8</b><i></i> 191 отзыв</span><span className="venue-price">от 450 ₽</span></span>
          </button>
          <button className="venue-card" type="button" data-venue="sova" data-category="Бары" data-city="Севастополь" data-cuisine="Европейская" data-source="yandex" data-pet="0" data-parking="1" data-score="4.7" data-new="0" data-search="gio restaurant bar коктейли вечер севастополь">
            <span className="venue-image"><img src="assets/venue-cocktail-unsplash.jpg" alt="Авторский коктейль в баре" loading="lazy" /><span className="fav"><svg><use href="#heart" /></svg></span><span className="tag">До 02:00</span></span>
            <span className="venue-body"><strong>Gio restaurant &amp; bar</strong><small>Европейская кухня и коктейли</small><span className="venue-meta"><b>4.7</b><i></i> редакционная оценка</span><span className="venue-price">от 800 ₽</span></span>
          </button>
        </div>
      </section>

      <section className="content-section app-promo" aria-labelledby="app-promo-title" data-tilt-stage="">
        <span className="app-promo-glow app-promo-glow--one" aria-hidden="true"></span>
        <span className="app-promo-glow app-promo-glow--two" aria-hidden="true"></span>
        <div className="app-promo-copy">
          <p className="eyebrow">Всегда под рукой</p>
          <h2 id="app-promo-title">Ваш город.<br />Ваши места.</h2>
          <p>Сохраняйте любимые рестораны, собирайте подборки и планируйте следующий вечер в «Место».</p>
          <div className="app-promo-points" aria-label="Возможности личного кабинета">
            <span><svg aria-hidden="true"><use href="#heart" /></svg>Избранное</span>
            <span><svg aria-hidden="true"><use href="#pin" /></svg>Маршруты</span>
            <span><svg aria-hidden="true"><use href="#star" /></svg>Отзывы</span>
          </div>
          <div className="app-promo-actions"><button type="button" data-open-profile="">Открыть профиль <svg><use href="#arrow" /></svg></button><div className="app-promo-meta"><span className="app-promo-live" data-venue-total-label="places"><i className="catalog-live-dot" aria-hidden="true"></i><b data-venue-count="">{catalogSummary.total}</b>{` ${placeWord(catalogSummary.total)} уже в каталоге`}</span><button className="app-demo-toggle" type="button" data-phone-demo-toggle="" aria-pressed="false" aria-label="Приостановить анимацию макетов"><span aria-hidden="true" data-phone-demo-icon="">Ⅱ</span></button></div></div>
        </div>
        <div className="app-phones" aria-hidden="true" data-phone-scene="">
          <div className="phone phone-left" data-phone-depth="-1">
            <span className="phone-side-button phone-side-button--one"></span><span className="phone-side-button phone-side-button--two"></span>
            <span className="phone-notch"></span>
            <div className="phone-screen phone-feed">
              <div className="phone-status"><span>20:26</span><span>● ● ▰</span></div>
              <small>Добрый вечер</small>
              <b>Куда пойдём?</b>
              <div className="phone-search"><svg><use href="#search" /></svg><span>Ресторан или кухня</span></div>
              <article className="phone-place-card" data-phone-featured="">
                <span className="phone-place-photo"><img src="assets/venue-restaurant-unsplash.jpg" alt="" data-phone-featured-image="" /><i><span data-phone-featured-rating="">4.9</span> <svg><use href="#star" /></svg></i></span>
                <strong data-phone-featured-title="">Баркас</strong><small data-phone-featured-meta="">Ресторан · Симферополь</small>
              </article>
              <article className="phone-place-card phone-place-card--compact">
                <span className="phone-place-photo"><img src="assets/venue-coffee-unsplash.jpg" alt="" /><i>4.8 <svg><use href="#star" /></svg></i></span>
                <strong>Парк кофе</strong><small>Кофейня · рядом</small>
              </article>
            </div>
          </div>
          <div className="phone phone-right" data-phone-depth="1">
            <span className="phone-side-button phone-side-button--one"></span>
            <span className="phone-notch"></span>
            <div className="phone-screen phone-map">
              <div className="phone-status"><span>20:26</span><span>● ● ▰</span></div>
              <div className="phone-map-search"><svg><use href="#search" /></svg><span>Места рядом</span></div>
              <svg className="phone-map-canvas" viewBox="0 0 210 405" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <defs>
                  <linearGradient id="phone-map-water" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dce8e7" /><stop offset="1" stopColor="#bfd5d4" /></linearGradient>
                  <filter id="phone-map-shadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#4c3a26" floodOpacity=".25" /></filter>
                </defs>
                <rect width="210" height="405" fill="#f3eee7" />
                <path className="phone-map-park" d="M-20 25C28 5 50 35 81 22s43-29 86-14 52 5 69-3v94c-31 2-46-17-76-5s-38 31-74 21-58-6-106 16Z" />
                <path className="phone-map-water" d="M145-18c-7 44 4 71 31 93s24 51 1 79-25 61-7 94 11 67-31 102 4 68 34 79h66V-18Z" />
                <g className="phone-map-streets">
                  <path d="M-18 71C39 82 82 101 138 148s71 57 97 61" />
                  <path d="M18-12c4 68 41 99 64 151s20 115 7 159-6 84 26 126" />
                  <path d="M-16 244c44-34 74-32 116-21s67 4 109-43" />
                  <path d="M-25 351c51-20 86-9 124 9s75 11 126-14" />
                  <path d="M31 23c33 29 59 36 101 38s64 20 91 50" />
                  <path d="M-10 171c33-16 55-13 82 3s53 16 83 1" />
                </g>
                <path className="phone-map-route-halo" d="M26 337C52 301 28 264 60 232s76-9 89-50-29-52-12-92 43-34 55-55" />
                <path className="phone-map-route" d="M26 337C52 301 28 264 60 232s76-9 89-50-29-52-12-92 43-34 55-55" />
                <g className="phone-map-pin phone-map-pin--one" transform="translate(26 337)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
                <g className="phone-map-pin phone-map-pin--two" transform="translate(60 232)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
                <g className="phone-map-pin phone-map-pin--three" transform="translate(137 90)" filter="url(#phone-map-shadow)"><circle r="13" /><path d="M0 7s-5-5.2-5-9a5 5 0 1 1 10 0c0 3.8-5 9-5 9Z" /><circle cy="-2" r="1.8" /></g>
              </svg>
              <div className="phone-map-card"><img src="assets/venue-cafe-unsplash.jpg" alt="" /><span><strong>Зерно</strong><small>8 минут · 4.8</small></span><svg><use href="#arrow" /></svg></div>
            </div>
          </div>
          <span className="phone-scene-chip phone-scene-chip--rating"><svg><use href="#star" /></svg><b>4.9</b><small>выбор гостей</small></span>
          <span className="phone-scene-chip phone-scene-chip--saved"><svg><use href="#heart" /></svg><b>12</b><small>сохранено</small></span>
        </div>
      </section>

      <section className="content-section how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-heading centered-heading"><div><p className="eyebrow">Простой выбор</p><h2 id="how-title">Как это работает</h2></div></div>
        <div className="how-grid" role="list">
          <article role="listitem"><span className="how-icon"><svg><use href="#search" /></svg></span><b>Выберите место</b><p>Найдите ресторан по городу, категории или настроению.</p><small>Категория, город и кухня</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#clock" /></svg></span><b>Уточните детали</b><p>Проверьте часы работы, особенности и все адреса сети.</p><small>Меню, режим работы и удобства</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#pin" /></svg></span><b>Откройте маршрут</b><p>Перейдите на карту и выберите удобную дорогу до заведения.</p><small>Карта, адрес и филиалы</small></article>
          <article role="listitem"><span className="how-icon"><svg><use href="#star" /></svg></span><b>Поделитесь</b><p>Сохраните ресторан и оставьте отзыв после визита.</p><small>Избранное, оценка и отзыв</small></article>
        </div>
      </section>

      <section className="content-section collections-section" id="collections" aria-labelledby="collections-title">
        <div className="section-heading">
          <div><p className="eyebrow">Готовые маршруты</p><h2 id="collections-title">Подборки</h2></div>
          <a className="text-link" href="/catalog" data-show-all="">Все места <svg><use href="#arrow" /></svg></a>
        </div>
        <div className="collection-grid">
          <a className="collection-card breakfast" href={catalogLink({ category: "Кофейни" })} data-collection="breakfast"><span className="collection-card-copy"><b>Лучшие завтраки<br />в городе</b><em>Кофе, выпечка и ранние открытия</em><small>Смотреть места</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card sea" href={catalogLink({ city: "Ялта", category: "Рестораны" })} data-collection="sea"><span className="collection-card-copy"><b>Ужин с видом<br />на воду</b><em>Террасы, набережные и морская кухня</em><small>Смотреть места</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card date" href={catalogLink({ category: "Рестораны" })} data-collection="date"><span className="collection-card-copy"><b>Для особенного<br />вечера</b><em>Камерные залы и вечерние меню</em><small>Смотреть места</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
          <a className="collection-card pet" href={catalogLink({ petFriendly: true })} data-collection="pet"><span className="collection-card-copy"><b>Где рады<br />питомцам</b><em>Проверенные pet-friendly места</em><small>Смотреть места</small></span><i className="collection-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></i></a>
        </div>
      </section>

      <section className="content-section cities-section" id="cities" aria-labelledby="cities-title">
        <div className="section-heading"><div><h2 id="cities-title">Города Крыма</h2></div><a className="text-link" href="/catalog" data-show-cities="">Открыть каталог <svg><use href="#arrow" /></svg></a></div>
        <div className="city-list">
          <a className="city-card city-card--featured simferopol" href={catalogLink({ city: "Симферополь" })} data-city-filter="Симферополь"><span className="city-card-copy"><b>Симферополь</b><small>Центр, парки и новые кофейни</small><span data-city-count="Симферополь">{cityPlaceCount(catalogSummary, "Симферополь")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card city-card--featured yalta" href={catalogLink({ city: "Ялта" })} data-city-filter="Ялта"><span className="city-card-copy"><b>Ялта</b><small>Набережная и видовые рестораны</small><span data-city-count="Ялта">{cityPlaceCount(catalogSummary, "Ялта")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card city-card--featured sevastopol" href={catalogLink({ city: "Севастополь" })} data-city-filter="Севастополь"><span className="city-card-copy"><b>Севастополь</b><small>Бухты, террасы и морская кухня</small><span data-city-count="Севастополь">{cityPlaceCount(catalogSummary, "Севастополь")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card alushta" href={catalogLink({ city: "Алушта" })} data-city-filter="Алушта"><span className="city-card-copy"><b>Алушта</b><small>Завтраки у моря</small><span data-city-count="Алушта">{cityPlaceCount(catalogSummary, "Алушта")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card evpatoria" href={catalogLink({ city: "Евпатория" })} data-city-filter="Евпатория"><span className="city-card-copy"><b>Евпатория</b><small>Старый город и семейные кафе</small><span data-city-count="Евпатория">{cityPlaceCount(catalogSummary, "Евпатория")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card feodosia" href={catalogLink({ city: "Феодосия" })} data-city-filter="Феодосия"><span className="city-card-copy"><b>Феодосия</b><small>Галереи и рестораны у воды</small><span data-city-count="Феодосия">{cityPlaceCount(catalogSummary, "Феодосия")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card sudak" href={catalogLink({ city: "Судак" })} data-city-filter="Судак"><span className="city-card-copy"><b>Судак</b><small>Винные маршруты и виды</small><span data-city-count="Судак">{cityPlaceCount(catalogSummary, "Судак")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card kerch" href={catalogLink({ city: "Керчь" })} data-city-filter="Керчь"><span className="city-card-copy"><b>Керчь</b><small>Рыба и локальная кухня</small><span data-city-count="Керчь">{cityPlaceCount(catalogSummary, "Керчь")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card bahchisarai" href={catalogLink({ city: "Бахчисарай" })} data-city-filter="Бахчисарай"><span className="city-card-copy"><b>Бахчисарай</b><small>Крымскотатарская кухня</small><span data-city-count="Бахчисарай">{cityPlaceCount(catalogSummary, "Бахчисарай")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card balaklava" href={catalogLink({ city: "Балаклава" })} data-city-filter="Балаклава"><span className="city-card-copy"><b>Балаклава</b><small>Ужин у бухты</small><span data-city-count="Балаклава">{cityPlaceCount(catalogSummary, "Балаклава")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card saki" href={catalogLink({ city: "Саки" })} data-city-filter="Саки"><span className="city-card-copy"><b>Саки</b><small>Семейные места и кафе</small><span data-city-count="Саки">{cityPlaceCount(catalogSummary, "Саки")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
          <a className="city-card gurzuf" href={catalogLink({ city: "Гурзуф" })} data-city-filter="Гурзуф"><span className="city-card-copy"><b>Гурзуф</b><small>Улочки и террасы с видом</small><span data-city-count="Гурзуф">{cityPlaceCount(catalogSummary, "Гурзуф")}</span></span><span className="city-card-arrow" aria-hidden="true"><svg><use href="#arrow" /></svg></span></a>
        </div>
      </section>

      <section className="place-stats" aria-label="Место в цифрах"><div><b data-venue-count="" aria-label={String(catalogSummary.total)}>{catalogSummary.total}</b><span data-venue-total-label="catalog-stat">{venueWord(catalogSummary.total)} в каталоге</span></div><div><b>150+</b><span>поводов найти новое</span></div><div><b>20+</b><span>категорий и фильтров</span></div><div><b>4.8</b><span>средняя оценка мест</span></div></section>

      <section className="categories-view" id="categories-view" hidden aria-labelledby="all-categories-title">
        <div className="categories-view-inner">
          <button className="back-link" type="button" data-home-link="">← Вернуться на главную</button>
          <h1 id="all-categories-title">Все категории</h1>
          <p className="catalog-copy">Выберите формат — затем уточните кухню, город, парковку или возможность прийти с питомцем.</p>
          <div className="categories-full-grid">
            <button className="category-tile dining" type="button" data-filter-category="Рестораны"><svg><use href="#restaurant" /></svg><span>Рестораны</span><small data-category-count="Рестораны">{placeCount(catalogSummary.byCategory["Рестораны"] ?? 0)}</small></button>
            <button className="category-tile cafe" type="button" data-filter-category="Кафе"><svg><use href="#coffee" /></svg><span>Кафе</span><small data-category-count="Кафе">{placeCount(catalogSummary.byCategory["Кафе"] ?? 0)}</small></button>
            <button className="category-tile coffee" type="button" data-filter-category="Кофейни"><svg><use href="#coffee" /></svg><span>Кофейни</span><small data-category-count="Кофейни">{placeCount(catalogSummary.byCategory["Кофейни"] ?? 0)}</small></button>
            <button className="category-tile dessert" type="button" data-filter-category="Кондитерские"><svg><use href="#cake" /></svg><span>Кондитерские</span><small data-category-count="Кондитерские">{placeCount(catalogSummary.byCategory["Кондитерские"] ?? 0)}</small></button>
            <button className="category-tile pizza" type="button" data-filter-category="Пиццерии"><svg><use href="#pizza" /></svg><span>Пиццерии</span><small data-category-count="Пиццерии">{placeCount(catalogSummary.byCategory["Пиццерии"] ?? 0)}</small></button>
            <button className="category-tile casual" type="button" data-filter-category="Фаст-кэжуал"><svg><use href="#bolt" /></svg><span>Фаст-кэжуал</span><small data-category-count="Фаст-кэжуал">{placeCount(catalogSummary.byCategory["Фаст-кэжуал"] ?? 0)}</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Бары"><svg><use href="#cocktail" /></svg><span>Бары</span><small data-category-count="Бары">{placeCount(catalogSummary.byCategory["Бары"] ?? 0)}</small></button>
            <button className="category-tile gastropub" type="button" data-filter-category="Гастробары"><svg><use href="#cocktail" /></svg><span>Гастробары</span><small data-category-count="Гастробары">{placeCount(catalogSummary.byCategory["Гастробары"] ?? 0)}</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Караоке-клубы"><svg><use href="#cocktail" /></svg><span>Караоке-клубы</span><small data-category-count="Караоке-клубы">{placeCount(catalogSummary.byCategory["Караоке-клубы"] ?? 0)}</small></button>
            <button className="category-tile dining" type="button" data-filter-category="Суши-бары"><svg><use href="#restaurant" /></svg><span>Суши-бары</span><small data-category-count="Суши-бары">{placeCount(catalogSummary.byCategory["Суши-бары"] ?? 0)}</small></button>
            <button className="category-tile bar" type="button" data-filter-category="Кальян-бары"><svg><use href="#cocktail" /></svg><span>Кальян-бары</span><small data-category-count="Кальян-бары">{placeCount(catalogSummary.byCategory["Кальян-бары"] ?? 0)}</small></button>
            <button className="category-tile dining" type="button" data-filter-category="Банкетные залы"><svg><use href="#restaurant" /></svg><span>Банкетные залы</span><small data-category-count="Банкетные залы">{placeCount(catalogSummary.byCategory["Банкетные залы"] ?? 0)}</small></button>
          </div>
        </div>
      </section>
      </>) : null}

      <section
        className="catalog-view"
        id="catalog-view"
        hidden={!catalogVisible}
        aria-labelledby={catalogContent != null ? "catalog-title" : undefined}
      >
        {catalogContent}
      </section>

      {!standalone ? (<>
      <section className="profile-view" id="profile-view" hidden aria-labelledby="profile-title">
        <div className="profile-inner"><button className="back-link" type="button" data-home-link="">← Вернуться на главную</button><div className="profile-heading"><span className="profile-large-avatar" data-profile-avatar="">М</span><div><p className="eyebrow">Личный кабинет</p><h1 id="profile-title" data-profile-name="">Ваш профиль</h1><p><span data-profile-email=""></span><br />Избранные места, отзывы и заявки — в одном кабинете.</p></div><div className="profile-actions"><a className="profile-action merchant-profile-link" href="/merchant" hidden>Кабинет ресторатора</a><button className="profile-action" type="button" data-open-submission=""><svg><use href="#plus" /></svg>Добавить заведение</button><button className="profile-action secondary" type="button" data-logout="">Выйти</button></div></div><div className="profile-grid"><section className="profile-card"><div><p className="eyebrow">Избранное</p><h2>Места, к которым хочется вернуться</h2></div><div className="saved-list" id="profile-saved-list"></div></section><section className="profile-card profile-review"><p className="eyebrow">Ваш голос</p><h2>Отзывы помогают выбирать лучше</h2><p>Откройте карточку заведения и поделитесь впечатлением — отзыв появится после модерации.</p><button className="black-action" type="button" data-home-link="">Найти место <svg><use href="#arrow" /></svg></button></section></div></div>
      </section>
      </>) : null}
      {profileContent}
    </main>

    <footer className="site-footer" id="site-footer"><div className="footer-main"><div className="footer-brand"><a className="brand brand-mark" href={standalone ? "/" : "#guide"} data-home-link="" aria-label="Место — на главную"><svg className="brand-pin"><use href="#pin" /></svg><span className="brand-word">Место</span><span className="brand-orb" aria-hidden="true"><svg><use href="#logo-star" /></svg></span></a><p>Ваш гид по любимым ресторанам<br />и новым впечатлениям.</p></div><div className="footer-column"><h4>Навигация</h4><a href={standalone ? "/catalog?category=Рестораны" : "#popular"} data-home-link="">Рестораны</a><a href={standalone ? "/#categories" : "#categories"} data-open-categories="">Категории</a><a href={standalone ? "/#collections" : "#collections"} data-home-link="">Подборки</a><a href={standalone ? "/#cities" : "#cities"} data-home-link="">Города</a></div><div className="footer-column"><h4>Помощь</h4><a href={standalone ? "/#how-it-works" : "#how-it-works"} data-home-link="">Как это работает</a><a href="/help#faq">Вопросы и ответы</a><a href="/help#partners">Партнёрам</a><a href="/help#rules">Правила сервиса</a></div><div className="footer-column footer-contacts"><h4>Для вас</h4><a href={standalone ? "/favorites" : "/?open=favorites#guide"}>Избранное</a><a href="/?open=submission#guide">Добавить заведение</a><a href={standalone ? "/profile" : "/?open=profile#guide"}>Личный кабинет</a><span>Республика Крым</span></div></div><div className="footer-bottom"><small>© 2026 Место. Все права защищены.</small><span><a href="/help#privacy">Политика конфиденциальности</a><a href="/help#terms">Пользовательское соглашение</a></span></div></footer>

    <div ref={mobileNavRef} className="mobile-nav" role="dialog" aria-modal="true" aria-label="Навигация" hidden={!standalone || !mobileOpen}><div className="mobile-nav-panel"><button type="button" className="mobile-nav-close" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)}>×</button><a href={standalone ? "/catalog?category=Рестораны" : "#popular"} data-home-link="">Рестораны</a><a href={standalone ? "/#categories" : "#categories"} data-open-categories="">Категории</a><a href={standalone ? "/#collections" : "#collections"} data-home-link="">Подборки</a><a href={standalone ? "/#how-it-works" : "#how-it-works"} data-home-link="">О проекте</a><a href="/help#faq">Помощь</a><button type="button" className="mobile-nav-action" data-open-favorites="" onClick={() => bridgeToAccount("favorites")}>Избранное</button><button type="button" className="mobile-nav-action" data-open-auth="" onClick={() => bridgeToAccount("profile")}>Личный кабинет</button></div></div>

    {venueDialogContent ?? (!standalone ? (
    <dialog id="venue-dialog" aria-labelledby="venue-dialog-title">
      <button className="dialog-close" type="button" aria-label="Закрыть">×</button>
      <div className="dialog-gallery">
        <div className="dialog-media"><img src="assets/card-restaurant.png" alt="" /><span className="dialog-photo-action">Смотреть фото <svg><use href="#camera" /></svg></span></div>
        <div className="dialog-thumbnails" aria-hidden="true"><img src="assets/venue-restaurant-unsplash.jpg" alt="" /><img src="assets/real-dining-night.jpg" alt="" /><img src="assets/card-restaurant.png" alt="" /><img src="assets/card-dessert.png" alt="" /></div>
      </div>
      <div className="dialog-content">
        <div className="dialog-title"><div><p className="eyebrow">Ресторан · Ялта</p><h2 id="venue-dialog-title">Marea</h2><span className="dialog-rating"><b>4.9</b> <i>★★★★★</i> 248 отзывов</span></div><button className="dialog-heart" type="button" aria-label="Добавить в избранное"><svg><use href="#heart" /></svg></button></div>
        <p className="dialog-description">Средиземноморская кухня, спокойный свет и открытая терраса с видом на море. Подходит для неспешного ужина и особенного повода.</p>
        <div className="feature-list"><span><svg><use href="#paw" /></svg>Можно с питомцами</span><span><svg><use href="#park" /></svg>Своя парковка</span><span><svg><use href="#external" /></svg>Есть веранда</span></div>
        <div className="dialog-promotions" hidden aria-live="polite"></div>
      </div>
      <div className="dialog-expanded">
        <section className="dialog-detail-section dialog-about-panel" aria-labelledby="dialog-about-title">
          <div className="dialog-section-heading"><h3 id="dialog-about-title">О заведении</h3></div>
          <p className="dialog-about-copy">Уютное место с внимательным сервисом, продуманным меню и атмосферой, ради которой хочется вернуться.</p>
          <dl className="dialog-about-list">
            <div><dt><svg><use href="#wifi" /></svg>Wi‑Fi</dt><dd>Бесплатный</dd></div>
            <div><dt><svg><use href="#clock" /></svg>Режим работы</dt><dd>10:00–22:00</dd></div>
            <div><dt><svg><use href="#park" /></svg>Парковка</dt><dd>Уточняйте у заведения</dd></div>
            <div><dt><svg><use href="#star" /></svg>Особенности</dt><dd>Авторская кухня</dd></div>
            <div><dt><svg><use href="#restaurant" /></svg>Средний чек</dt><dd className="dialog-average-value">от 1 300 ₽</dd></div>
          </dl>
        </section>
        <section className="dialog-detail-section dialog-menu-panel" aria-labelledby="dialog-menu-title">
          <div className="dialog-section-heading"><h3 id="dialog-menu-title">Меню</h3><a className="dialog-menu-source" href="https://yandex.ru/maps/" target="_blank" rel="noreferrer">Актуальное меню <svg><use href="#external" /></svg></a></div>
          <div className="dialog-menu-list"></div>
        </section>
        <section className="dialog-detail-section dialog-reviews-panel" aria-labelledby="dialog-reviews-title">
          <div className="dialog-section-heading"><h3 id="dialog-reviews-title">Отзывы</h3></div>
          <div className="dialog-review-layout"><div className="dialog-review-score"><b>4.9</b><span>★★★★★</span><small>Оценка гостей</small></div><article><header><span className="dialog-review-avatar">М</span><p><b>Редакция «Место»</b><small>Рекомендуем обратить внимание</small></p></header><p className="dialog-review-copy">Атмосферное место с аккуратной подачей и спокойным интерьером.</p></article></div>
          <button className="dialog-review-action" type="button" data-open-review=""><svg><use href="#star" /></svg>Добавить отзыв <svg><use href="#arrow" /></svg></button>
        </section>
        <section className="dialog-detail-section dialog-map-panel" aria-labelledby="dialog-map-title">
          <div className="dialog-section-heading"><h3 id="dialog-map-title">На карте</h3></div>
          <a className="dialog-map-card" href="https://yandex.ru/maps/" target="_blank" rel="noreferrer"><span className="dialog-map-pin"><svg><use href="#pin" /></svg></span><span><b className="dialog-map-address">Адрес заведения</b><small>Открыть на карте <svg><use href="#external" /></svg></small></span></a>
          <button className="dialog-route-action" type="button">Построить маршрут <svg><use href="#arrow" /></svg></button>
        </section>
      </div>
    </dialog>
    ) : null)}
    {!standalone ? (<>
    <dialog id="auth-dialog" className="form-dialog" aria-labelledby="auth-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Добро пожаловать в Место</p><h2 id="auth-title">Войти в аккаунт</h2><p className="form-lead">Сохраняйте любимые места и оставляйте отзывы.</p><form id="auth-form"><label>Почта или логин<input name="login" type="text" autoComplete="username" placeholder="you@example.com" required /></label><label>Пароль<input name="password" type="password" autoComplete="current-password" placeholder="Введите пароль" required /></label><p className="auth-error" role="alert" hidden></p><button className="primary-action full" type="submit">Войти <svg><use href="#arrow" /></svg></button></form><div className="form-divider"><span>или</span></div><div className="social-grid"><button type="button" data-social="google"><b>G</b>Google</button><button type="button" data-social="yandex"><b>Я</b>Яндекс</button><button type="button" data-social="vk"><b>VK</b>ВКонтакте</button></div><p className="social-auth-note" aria-live="polite"></p><button className="form-link" type="button" data-open-register="">Регистрация</button></div></dialog>
    <dialog id="register-dialog" className="form-dialog" aria-labelledby="register-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Новый аккаунт</p><h2 id="register-title">Создать профиль</h2><p className="form-lead">Один профиль для избранного, отзывов и новых заведений.</p><form id="register-form"><label>Имя<input name="name" type="text" autoComplete="name" placeholder="Как вас зовут?" required /></label><label>Логин<input name="username" type="text" autoComplete="username" placeholder="Например, alex" pattern="[A-Za-z0-9._-]{3,48}" title="От 3 до 48 латинских букв, цифр, точек, дефисов или подчёркиваний" required /></label><label>Почта<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label><label>Пароль<input name="password" type="password" autoComplete="new-password" placeholder={PASSWORD_HINT} minLength={PASSWORD_MIN_LENGTH} pattern={PASSWORD_PATTERN} title={PASSWORD_ERROR_MESSAGE} required /></label><p className="auth-error" role="alert" hidden></p><button className="primary-action full" type="submit">Создать аккаунт <svg><use href="#arrow" /></svg></button></form><div className="form-divider"><span>или</span></div><div className="social-grid"><button type="button" data-social="google"><b>G</b>Google</button><button type="button" data-social="yandex"><b>Я</b>Яндекс</button><button type="button" data-social="vk"><b>VK</b>ВКонтакте</button></div><p className="social-auth-note" aria-live="polite"></p><button className="form-link" type="button" data-open-auth="">Уже есть аккаунт</button></div></dialog>
    <dialog id="review-dialog" className="form-dialog review-dialog" aria-labelledby="review-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="form-dialog-inner"><p className="eyebrow">Ваше впечатление</p><h2 id="review-title">Добавить отзыв</h2><p className="form-lead">Оценка и текст появятся в карточке после проверки редакцией.</p><form id="review-form"><label>Ваше имя<input name="authorName" type="text" autoComplete="name" placeholder="Как вас представить?" required /></label><label>Оценка<select name="rating" required><option value="5">5 — отлично</option><option value="4">4 — хорошо</option><option value="3">3 — нормально</option><option value="2">2 — есть замечания</option><option value="1">1 — не понравилось</option></select></label><label>Отзыв<textarea name="review" rows={5} minLength={20} placeholder="Что вам понравилось: атмосфера, кухня, сервис?" required></textarea></label><label className="check-field"><input name="consent" type="checkbox" required /><span>Подтверждаю, что отзыв основан на моём посещении.</span></label><button className="primary-action full" type="submit">Отправить отзыв <svg><use href="#arrow" /></svg></button></form></div></dialog>
    <dialog id="submission-dialog" className="form-dialog submission-dialog" aria-labelledby="submission-title">
      <button className="dialog-close" type="button" aria-label="Закрыть">×</button>
      <div className="form-dialog-inner">
        <p className="eyebrow">Карточка заведения</p>
        <h2 id="submission-title">Добавить место в каталог</h2>
        <p className="form-lead">Заявка попадёт на проверку редакции. После одобрения карточка появится в выбранном городе.</p>
        <form id="submission-form">
          <div className="form-grid">
            <label>Ваше имя<input name="contactName" type="text" autoComplete="name" placeholder="Как к вам обращаться?" required /></label>
            <label>Почта для связи<input name="contactEmail" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
            <label>Название заведения<input name="title" type="text" placeholder="Например, Marea" required /></label>
            <label>Город<select name="city" required><option value="">Выберите город</option><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option></select></label>
            <label>Категория<select name="category" required><option value="">Выберите категорию</option><option>Рестораны</option><option>Кафе</option><option>Кофейни</option><option>Кондитерские</option><option>Пиццерии</option><option>Фаст-кэжуал</option><option>Бары</option><option>Гастробары</option><option>Караоке-клубы</option><option>Суши-бары</option><option>Кальян-бары</option><option>Банкетные залы</option></select></label>
            <label>Кухня<select name="cuisine"><option>Европейская</option><option>Средиземноморская</option><option>Итальянская</option><option>Грузинская</option><option>Паназиатская</option><option>Японская</option><option>Мясная</option><option>Рыбная</option><option>Вегетарианская</option><option>Кофе и десерты</option></select></label>
            <label>Адрес<input name="address" type="text" placeholder="Улица, дом" /></label>
            <label>Телефон<input name="phone" type="tel" autoComplete="tel" placeholder="+7 (978) 000-00-00" /></label>
            <label>Сайт<input name="website" type="url" placeholder="https://example.ru" /></label>
            <label>Режим работы<input name="hours" type="text" placeholder="ежедневно, 09:00–23:00" /></label>
            <label>Средний чек<input name="averageCheck" type="text" placeholder="Например, 1 500 ₽" /></label>
            <label>Особенности<input name="features" type="text" placeholder="Парковка, Wi‑Fi, можно с собакой" /></label>
          </div>
          <label>Описание<textarea name="description" rows={4} placeholder="Расскажите про атмосферу, меню и важные детали" required></textarea></label>
          <label className="upload-field"><span><svg><use href="#camera" /></svg>Фото заведения</span><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple /><small>Можно добавить до 6 фотографий, JPG/PNG/WebP</small></label>
          <label className="check-field"><input name="consent" type="checkbox" required /><span>Я подтверждаю, что информация актуальна и разрешаю публикацию после модерации.</span></label>
          <button className="primary-action full" type="submit">Отправить на модерацию <svg><use href="#arrow" /></svg></button>
        </form>
      </div>
    </dialog>
    <dialog id="favorites-dialog" className="favorites-dialog" aria-labelledby="favorites-title"><button className="dialog-close" type="button" aria-label="Закрыть">×</button><div className="favorites-inner"><p className="eyebrow">Личный список</p><h2 id="favorites-title">Избранные места</h2><p className="form-lead">Сохраняйте места — они останутся здесь для следующего выбора.</p><div className="favorites-list" id="favorites-list"></div><button className="black-action" type="button" data-home-link="">Найти ещё место <svg><use href="#arrow" /></svg></button></div></dialog>
    </>) : null}
    {accountDialogContent}
    <div className="toast" role="status" aria-live="polite"></div>
    </>
  );
}
