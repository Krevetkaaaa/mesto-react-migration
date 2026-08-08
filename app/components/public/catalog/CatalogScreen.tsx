import { useState } from "react";
import { Form, Link, useLocation, useNavigate, useNavigation, useRevalidator } from "react-router";

import type { CatalogVenue } from "../../../lib/domain";
import { publicAssetUrl } from "../../../lib/public-asset";
import { catalogHref, parseCatalogUrl } from "../../../modules/catalog-url-state";
import type { PublicCatalogSnapshot } from "../../../modules/public-catalog-experience";
import { usePublicAccount } from "../account/PublicAccountProvider";

type CatalogVenueView = Omit<CatalogVenue, "coordinates"> & {
  coordinates: readonly number[];
};

type PublicCatalogViewSnapshot = Omit<PublicCatalogSnapshot, "items"> & {
  items: readonly CatalogVenueView[];
};

const CATEGORIES = [
  "Рестораны", "Кафе", "Кофейни", "Кондитерские", "Пиццерии", "Фаст-кэжуал",
  "Бары", "Гастробары", "Караоке-клубы", "Суши-бары", "Кальян-бары", "Банкетные залы",
] as const;
const CITIES = [
  "Симферополь", "Ялта", "Севастополь", "Алушта", "Евпатория", "Феодосия",
  "Судак", "Керчь", "Бахчисарай", "Балаклава", "Саки", "Гурзуф",
] as const;
const CUISINES = [
  "Европейская", "Средиземноморская", "Итальянская", "Грузинская", "Паназиатская",
  "Японская", "Мясная", "Рыбная", "Вегетарианская", "Кофе и десерты", "Фаст-кэжуал",
] as const;

function imageFor(item: CatalogVenueView) {
  return publicAssetUrl(item.photos[0] || "/assets/venue-restaurant-unsplash.jpg");
}

function useCatalogFavorites() {
  const account = usePublicAccount();
  const [message, setMessage] = useState("");

  async function toggle(item: CatalogVenueView) {
    if (account.status !== "authenticated") {
      setMessage(account.status === "restoring"
        ? "Проверяем авторизацию…"
        : account.status === "unavailable"
          ? "Сервис аккаунта временно недоступен. Попробуйте ещё раз."
          : "Авторизируйтесь или зарегистрируйтесь, чтобы сохранять места.");
      return;
    }
    try {
      const outcome = await account.toggleFavorite({
        venueKey: item.key,
        venueId: item.databaseId,
        externalVenueId: item.databaseId ? null : item.key,
        snapshot: {
          slug: item.slug,
          title: item.name,
          type: `${item.category} · ${item.city}`,
          rating: item.rating === null ? "" : String(item.rating),
          image: imageFor(item),
          text: item.description,
        },
      });
      setMessage(outcome === "removed" ? "Место удалено из избранного." : "Место сохранено в избранном.");
    } catch {
      setMessage("Не удалось изменить избранное. Попробуйте ещё раз.");
    }
  }

  return { message, pending: account.pendingFavoriteKeys, saved: account.favoriteKeys, status: account.status, toggle };
}

function VenueCard({
  item,
  isSaved,
  isPending,
  onFavorite,
  returnTo,
}: {
  item: CatalogVenueView;
  isSaved: boolean;
  isPending: boolean;
  onFavorite: (item: CatalogVenueView) => void;
  returnTo: string;
}) {
  const petFriendly = /питомц|с собак|животн/i.test(item.features.join(" "));
  const parking = /парков/i.test(item.features.join(" "));
  const image = imageFor(item);
  const detailHref = `/venue/${item.slug}?from=${encodeURIComponent(returnTo)}`;
  return (
    <article
      className="venue-card catalog-venue-card"
      data-venue={item.key}
      data-category={item.category}
      data-categories={item.categories.join("|")}
      data-city={item.city}
      data-cuisine={item.cuisine}
      data-source={item.source}
      data-pet={petFriendly ? "1" : "0"}
      data-parking={parking ? "1" : "0"}
      data-score={item.rating ?? 0}
      data-new="1"
      data-branch-count="1"
      data-search={`${item.name} ${item.category} ${item.cuisine} ${item.city}`.toLocaleLowerCase("ru-RU")}
    >
      <span className="venue-image">
        <img
          src={image}
          alt={item.name}
          loading="lazy"
          decoding="async"
          width={720}
          height={480}
          sizes="(max-width: 660px) 50vw, (max-width: 950px) 50vw, 33vw"
        />
        <button
          className={`fav${isSaved ? " is-saved" : ""}`}
          type="button"
          aria-label={isSaved ? "Удалить из избранного" : "Добавить в избранное"}
          aria-pressed={isSaved}
          disabled={isPending}
          onClick={() => onFavorite(item)}
        ><svg aria-hidden="true"><use href="#heart" /></svg></button>
      </span>
      <span className="venue-body">
        <strong><Link to={detailHref}>{item.name}</Link></strong>
        <small>{item.category} · {item.city}</small>
        {item.address ? <span className="venue-meta venue-meta--source"><svg aria-hidden="true"><use href="#pin" /></svg>{item.address}</span> : null}
        {item.description ? <span className="venue-card-description">{item.description}</span> : null}
        <span className="venue-source-note">Опубликовано в каталоге «Места»</span>
        <Link className="venue-card-action" to={detailHref}>Открыть карточку <svg aria-hidden="true"><use href="#arrow" /></svg></Link>
      </span>
    </article>
  );
}

export function CatalogScreen({ snapshot, cityLanding = false }: {
  snapshot: PublicCatalogViewSnapshot;
  cityLanding?: boolean;
}) {
  const navigation = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const favorites = useCatalogFavorites();
  const pending = navigation.state !== "idle" || revalidator.state !== "idle";
  const { state } = snapshot;
  const title = state.city === "all" ? "Все места города" : `Места: ${state.city}`;
  const status = pending
    ? "Обновляем каталог…"
    : snapshot.errorMessage
      ? "Показана подборка редакции"
      : snapshot.databaseConfigured
        ? snapshot.items.length ? `${snapshot.visibleCount} из ${snapshot.total} мест из базы` : "В базе пока нет мест по этим фильтрам"
        : "Подборка редакции";
  const formKey = new URLSearchParams({
    q: state.query,
    city: state.city,
    category: state.category,
    cuisine: state.cuisine,
    sort: state.sort,
    pet: String(state.petFriendly),
    parking: String(state.parking),
  }).toString();
  const navigateForm = (form: HTMLFormElement) => {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string") params.append(key, value);
    }
    void navigate(catalogHref(parseCatalogUrl(params)));
  };

  return (
    <div className={`catalog-inner${pending ? " is-catalog-loading" : ""}`}>
      <div className="catalog-hero" id="catalog-hero">
        <span className="catalog-hero-glow" aria-hidden="true"></span>
        <Link className="back-link" to="/">← Вернуться на главную</Link>
        <p className="eyebrow" id="catalog-eyebrow">{cityLanding ? "Городской каталог" : state.category === "all" ? "Каталог мест" : `Категория · ${state.category}`}</p>
        <h1 id="catalog-title">{title}</h1>
        <p className="catalog-copy" id="catalog-copy">Популярные и новые заведения, собранные в одном списке.</p>
      </div>
      <Form
        key={formKey}
        className="catalog-controls"
        method="get"
        action="/catalog"
        onSubmit={(event) => {
          event.preventDefault();
          navigateForm(event.currentTarget);
        }}
        onChange={(event) => {
          if ((event.target as HTMLElement).matches("select,input[type=checkbox]")) {
            navigateForm(event.currentTarget);
          }
        }}
      >
        <label className="catalog-query">Поиск<input name="q" type="search" defaultValue={state.query} placeholder="Название, кухня или адрес" /></label>
        <label>Категория<select id="catalog-category" name="category" defaultValue={state.category}><option value="all">Все категории</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Город<select id="catalog-city" name="city" defaultValue={state.city}><option value="all">Все города</option>{CITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Кухня<select id="catalog-cuisine" name="cuisine" defaultValue={state.cuisine}><option value="all">Любая кухня</option>{CUISINES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Сортировка<select id="catalog-sort" name="sort" defaultValue={state.sort}><option value="popular">Сначала популярные</option><option value="new">Сначала новые</option><option value="mixed">Все вперемешку</option></select></label>
        <label className="filter-toggle"><input id="catalog-pet" name="pet" value="1" type="checkbox" defaultChecked={state.petFriendly} /><span><svg><use href="#paw" /></svg>С питомцами</span></label>
        <label className="filter-toggle"><input id="catalog-parking" name="parking" value="1" type="checkbox" defaultChecked={state.parking} /><span><svg><use href="#park" /></svg>Есть парковка</span></label>
        <button className="catalog-search-submit" type="submit">Найти <svg><use href="#search" /></svg></button>
      </Form>
      <div className="catalog-source-row">
        <div className="catalog-source-label"><span className="catalog-source-mark" aria-hidden="true"><svg><use href="#logo-star" /></svg></span><span><b>Единый каталог «Места»</b><small>Только опубликованные карточки</small></span></div>
        <span id="catalog-venues-status" role="status" aria-live="polite">{status}</span>
        <button className="catalog-refresh-action" id="catalog-refresh" type="button" disabled={pending} onClick={() => { void revalidator.revalidate(); }}><svg><use href="#search" /></svg>{pending ? "Обновляем…" : "Обновить каталог"}</button>
      </div>
      {snapshot.errorMessage ? <p className="catalog-feedback" role="alert">{snapshot.errorMessage} <button type="button" onClick={() => { void revalidator.revalidate(); }}>Повторить</button></p> : null}
      {favorites.message ? <p className="catalog-feedback" role="status">{favorites.message}{favorites.status === "anonymous" ? <> <a href="/login?returnTo=%2Fcatalog">Войти</a></> : null}</p> : null}
      <div className="catalog-toolbar"><span id="catalog-count">{snapshot.visibleCount} мест</span><Link className="text-link" to="/#collections">К подборкам <svg><use href="#arrow" /></svg></Link></div>
      <div className="venue-grid catalog-grid" id="catalog-grid">
        {snapshot.items.length
          ? snapshot.items.map((item) => <VenueCard key={item.slug} item={item} isPending={favorites.pending.has(item.key)} isSaved={favorites.saved.has(item.key)} onFavorite={(selected) => void favorites.toggle(selected)} returnTo={`${location.pathname}${location.search}`} />)
          : <p className="catalog-empty">По этим параметрам пока нет заведений. Попробуйте изменить город или кухню.</p>}
      </div>
      {snapshot.nextPage ? (
        <Link className="catalog-load-more" id="catalog-load-more" to={`/catalog?${new URLSearchParams({
          ...(state.query ? { q: state.query } : {}),
          ...(state.city !== "all" ? { city: state.city } : {}),
          ...(state.category !== "all" ? { category: state.category } : {}),
          ...(state.cuisine !== "all" ? { cuisine: state.cuisine } : {}),
          ...(state.sort !== "popular" ? { sort: state.sort } : {}),
          ...(state.petFriendly ? { pet: "1" } : {}),
          ...(state.parking ? { parking: "1" } : {}),
          page: String(snapshot.nextPage),
        }).toString()}`}>Показать ещё 50 заведений <svg><use href="#arrow" /></svg></Link>
      ) : null}
      <p className="catalog-venues-note">В каталоге показываются только опубликованные карточки «Места». Для построения маршрута можно открыть внешнюю карту.</p>
    </div>
  );
}
