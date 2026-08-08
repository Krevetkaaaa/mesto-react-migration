import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { publicAssetUrl } from "../../../lib/public-asset";
import type { PublicVenueDetail } from "../../../modules/public-catalog.server";
import { usePublicAccount } from "../account/PublicAccountProvider";
import { ReviewDialog } from "./ReviewDialog";

function safeReturnPath(value: string | null) {
  if (!value) return "/catalog";
  const isAllowed = (candidate: string) => candidate === "/"
    || candidate === "/catalog"
    || candidate.startsWith("/catalog?")
    || candidate.startsWith("/city/");
  if (isAllowed(value)) return value;
  try {
    const decoded = decodeURIComponent(value);
    return isAllowed(decoded) ? decoded : "/catalog";
  } catch {
    return "/catalog";
  }
}

export function VenueDialog({ detail, returnTo }: {
  detail: PublicVenueDetail;
  returnTo: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const account = usePublicAccount();
  const { venue, menuItems, promotions } = detail;
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const photos = (venue.photos.length ? venue.photos : ["/assets/venue-restaurant-unsplash.jpg"])
    .map(publicAssetUrl);
  const heroPhoto = photos[0] ?? "/assets/venue-restaurant-unsplash.jpg";
  const returnPath = safeReturnPath(returnTo);
  const venuePath = `/venue/${encodeURIComponent(venue.slug)}?${new URLSearchParams({ from: returnPath }).toString()}`;
  const reviewLoginPath = `/login?${new URLSearchParams({ returnTo: venuePath }).toString()}`;

  const isSaved = account.favoriteKeys.has(detail.venueKey);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onClose = () => { void navigate(returnPath, { replace: true }); };
    dialog.addEventListener("close", onClose);
    return () => dialog.removeEventListener("close", onClose);
  }, [navigate, returnPath]);

  const toggleFavorite = async () => {
    if (account.status !== "authenticated") {
      setFavoriteMessage(account.status === "restoring"
        ? "Проверяем авторизацию…"
        : account.status === "unavailable"
          ? "Сервис аккаунта временно недоступен. Попробуйте ещё раз."
          : "Авторизируйтесь или зарегистрируйтесь, чтобы сохранить место.");
      return;
    }
    try {
      const externalVenueId = detail.externalVenueId ? detail.venueKey : null;
      const outcome = await account.toggleFavorite({
        venueKey: detail.venueKey,
        venueId: externalVenueId ? null : venue.id,
        externalVenueId,
        snapshot: {
          slug: venue.slug,
          title: venue.title,
          type: `${venue.category} · ${venue.city}`,
          rating: "",
          image: heroPhoto,
          text: venue.description,
        },
      });
      setFavoriteMessage(outcome === "removed" ? "Место удалено из избранного." : "Место сохранено в избранном.");
    } catch {
      setFavoriteMessage("Не удалось изменить избранное. Попробуйте ещё раз.");
    }
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        id="venue-dialog"
        aria-labelledby="venue-dialog-title"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
            event.currentTarget.close();
          }
        }}
      >
      <button className="dialog-close" type="button" aria-label="Закрыть" onClick={() => dialogRef.current?.close()}>×</button>
      <div className="dialog-gallery">
        <div className="dialog-media"><img src={heroPhoto} alt={venue.title} width={1200} height={800} decoding="async" fetchPriority="high" /><span className="dialog-photo-action">Смотреть фото <svg><use href="#camera" /></svg></span></div>
        <div className="dialog-thumbnails" aria-hidden="true">{photos.slice(0, 4).map((photo, index) => <img key={`${photo}-${index}`} src={photo} alt="" loading={index ? "lazy" : "eager"} width={240} height={160} />)}</div>
      </div>
      <div className="dialog-content">
        <div className="dialog-title"><div><p className="eyebrow">{venue.category} · {venue.city}</p><h2 id="venue-dialog-title">{venue.title}</h2></div><button className={`dialog-heart${isSaved ? " is-saved" : ""}`} type="button" aria-label={isSaved ? "Удалить из избранного" : "Добавить в избранное"} aria-pressed={isSaved} disabled={account.pendingFavoriteKeys.has(detail.venueKey)} onClick={() => { void toggleFavorite(); }}><svg><use href="#heart" /></svg></button></div>
        <p className="dialog-description">{venue.description || "Опубликованная карточка заведения в каталоге «Места»."}</p>
        {favoriteMessage ? <p className="catalog-feedback" role="status">{favoriteMessage}{account.status === "anonymous" ? <> <a href={`/login?${new URLSearchParams({ returnTo: `/venue/${venue.slug}` }).toString()}`}>Войти</a></> : null}</p> : null}
        <div className="feature-list">{venue.features.map((feature) => <span key={feature}><svg><use href="#star" /></svg>{feature}</span>)}</div>
        <div className="dialog-promotions" hidden={!promotions.length} aria-live="polite">{promotions.map((promotion) => <article key={promotion.id}><b>{promotion.title}</b><small>{promotion.description}</small></article>)}</div>
      </div>
      <div className="dialog-expanded">
        <section className="dialog-detail-section dialog-about-panel" aria-labelledby="dialog-about-title">
          <div className="dialog-section-heading"><h3 id="dialog-about-title">О заведении</h3></div>
          <p className="dialog-about-copy">{venue.description}</p>
          <dl className="dialog-about-list">
            <div><dt><svg><use href="#clock" /></svg>Режим работы</dt><dd>{venue.hours || "Уточняется"}</dd></div>
            <div><dt><svg><use href="#star" /></svg>Кухня</dt><dd>{venue.cuisine || "Уточняется"}</dd></div>
            <div><dt><svg><use href="#restaurant" /></svg>Средний чек</dt><dd className="dialog-average-value">{venue.averageCheck || "Уточняется"}</dd></div>
          </dl>
        </section>
        <section className="dialog-detail-section dialog-menu-panel" aria-labelledby="dialog-menu-title">
          <div className="dialog-section-heading"><h3 id="dialog-menu-title">Меню</h3>{venue.website ? <a className="dialog-menu-source" href={venue.website} target="_blank" rel="noreferrer">Актуальное меню <svg><use href="#external" /></svg></a> : null}</div>
          <div className="dialog-menu-list">{menuItems.length ? menuItems.map((item) => <article className="dialog-menu-item" key={item.id}><span><b>{item.title}</b><small>{item.description}</small></span><strong>{item.price === null ? "" : `${item.price.toLocaleString("ru-RU")} ₽`}</strong></article>) : <p>Меню пока не опубликовано.</p>}</div>
        </section>
        <section className="dialog-detail-section dialog-reviews-panel" aria-labelledby="dialog-reviews-title">
          <div className="dialog-section-heading"><h3 id="dialog-reviews-title">Отзывы</h3></div>
          <div className="dialog-review-layout"><div className="dialog-review-score"><b>—</b><span>★★★★★</span><small>Оценка гостей</small></div><article><header><span className="dialog-review-avatar">М</span><p><b>Редакция «Место»</b><small>Опубликованная карточка</small></p></header><p className="dialog-review-copy">Расскажите о своём посещении после авторизации.</p></article></div>
          {account.status === "authenticated" ? (
            <button className="dialog-review-action" type="button" onClick={() => setReviewOpen(true)}><svg><use href="#star" /></svg>Добавить отзыв <svg><use href="#arrow" /></svg></button>
          ) : account.status === "anonymous" ? (
            <a className="dialog-review-action" href={reviewLoginPath}><svg><use href="#star" /></svg>Войти, чтобы оставить отзыв <svg><use href="#arrow" /></svg></a>
          ) : (
            <button className="dialog-review-action" type="button" disabled><svg><use href="#star" /></svg>{account.status === "restoring" ? "Проверяем авторизацию…" : "Отзывы временно недоступны"}</button>
          )}
        </section>
        <section className="dialog-detail-section dialog-map-panel" aria-labelledby="dialog-map-title">
          <div className="dialog-section-heading"><h3 id="dialog-map-title">На карте</h3></div>
          <a className="dialog-map-card" href={venue.address ? `https://yandex.ru/maps/?text=${encodeURIComponent(`${venue.city} ${venue.address}`)}` : "https://yandex.ru/maps/"} target="_blank" rel="noreferrer"><span className="dialog-map-pin"><svg><use href="#pin" /></svg></span><span><b className="dialog-map-address">{venue.address || "Адрес уточняется"}</b><small>Открыть на карте <svg><use href="#external" /></svg></small></span></a>
          <a className="dialog-route-action" href={venue.address ? `https://yandex.ru/maps/?rtext=~${encodeURIComponent(`${venue.city} ${venue.address}`)}` : "https://yandex.ru/maps/"} target="_blank" rel="noreferrer">Построить маршрут <svg><use href="#arrow" /></svg></a>
        </section>
      </div>
      </dialog>
      {reviewOpen ? (
        <ReviewDialog
          authorName={account.user?.name ?? ""}
          detail={detail}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </>
  );
}
