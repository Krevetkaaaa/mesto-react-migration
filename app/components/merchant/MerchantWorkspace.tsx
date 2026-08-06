import {
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FetcherWithComponents,
  Form,
  useBlocker,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";

import type {
  MenuItem,
  MerchantWorkspaceSnapshot,
  Promotion,
  Review,
  Venue,
} from "../../lib/domain";
import {
  coverStyle,
  formatDate,
  formatMoney,
  initials,
  MerchantIcon,
  type MerchantPermission,
  MerchantSprite,
  type MerchantView,
  permissionLabels,
  permissionsForRole,
  plural,
  safeImage,
  stars,
  toLocalInput,
  viewMeta,
} from "./merchant-ui";

export interface MerchantActionResult {
  ok: boolean;
  intent: string;
  message: string;
}

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface OverviewViewProps {
  workspace: MerchantWorkspaceSnapshot;
  venue: Venue;
  menu: readonly MenuItem[];
  promotions: readonly Promotion[];
  reviews: readonly Review[];
  can: (permission: MerchantPermission) => boolean;
  onSelectView: (view: MerchantView) => void;
  onNewMenu: () => void;
  onNewPromotion: () => void;
}

function OverviewView(props: OverviewViewProps) {
  const { venue, reviews } = props;
  const statusLabels: Record<string, string> = { published: "Опубликовано", draft: "Черновик", archived: "В архиве" };
  return (
    <section className="merchant-view is-active" data-view-panel="overview">
      <div className="stats-grid" id="overview-stats">
        <article className="stat-card stat-card--venue"><span><MerchantIcon name="store" /></span><p>Заведений</p><b id="stat-venues">{props.workspace.venues.length}</b><small>доступно в кабинете</small></article>
        <article><span><MerchantIcon name="menu" /></span><p>Позиций меню</p><b id="stat-menu">{props.menu.length}</b><small>в выбранном заведении</small></article>
        <article><span><MerchantIcon name="tag" /></span><p>Активных акций</p><b id="stat-promotions">{props.promotions.length}</b><small>доступно гостям сейчас</small></article>
        <article><span><MerchantIcon name="star" /></span><p>Отзывов</p><b id="stat-reviews">{reviews.length}</b><small>в опубликованной ленте</small></article>
      </div>
      <div className="overview-grid">
        <article className="venue-spotlight" id="venue-spotlight">
          <div className="venue-spotlight__image" id="venue-spotlight-image" style={coverStyle(venue.photos[0])}>
            <span className={`status-badge${venue.status === "draft" ? " is-draft" : venue.status === "archived" ? " is-archived" : ""}`} id="venue-status">{statusLabels[venue.status] || "Карточка"}</span>
          </div>
          <div className="venue-spotlight__body">
            <p className="eyebrow">Текущая карточка</p>
            <h2 id="venue-spotlight-title">{venue.title}</h2>
            <p id="venue-spotlight-meta">{[venue.category, venue.cuisine, venue.city].filter(Boolean).join(" · ")}</p>
            <p className="venue-spotlight__description" id="venue-spotlight-description">{venue.description || "Добавьте короткое описание, чтобы гости лучше почувствовали характер заведения."}</p>
            <div className="venue-spotlight__features" id="venue-spotlight-features">{venue.features.slice(0, 5).map((feature) => <span key={feature}>{feature}</span>)}</div>
            {props.can("venue") ? <button className="text-action" type="button" onClick={() => props.onSelectView("venue")}>Редактировать карточку <MerchantIcon name="arrow" /></button> : null}
          </div>
        </article>
        <div className="overview-side">
          <section className="panel quick-actions">
            <div className="panel-heading"><div><p className="eyebrow">Быстрый доступ</p><h2>Что обновить?</h2></div></div>
            <div className="quick-actions__grid">
              {props.can("venue") ? <button type="button" onClick={() => props.onSelectView("venue")}><span><MerchantIcon name="edit" /></span><b>Карточку</b><small>Контакты и описание</small></button> : null}
              {props.can("menu") ? <button type="button" onClick={props.onNewMenu}><span><MerchantIcon name="plus" /></span><b>Блюдо</b><small>Новая позиция меню</small></button> : null}
              {props.can("promotions") ? <button type="button" onClick={props.onNewPromotion}><span><MerchantIcon name="tag" /></span><b>Акцию</b><small>Предложение для гостей</small></button> : null}
            </div>
          </section>
          {props.can("reviews") ? (
            <section className="panel recent-reviews">
              <div className="panel-heading"><div><p className="eyebrow">Обратная связь</p><h2>Свежие отзывы</h2></div><button className="text-action" type="button" onClick={() => props.onSelectView("reviews")}>Все →</button></div>
              <div className="recent-reviews__list" id="overview-reviews">
                {!reviews.length ? <div className="empty-state-inline">Опубликованных отзывов пока нет.</div> : reviews.slice(0, 3).map((review) => (
                  <article className="recent-review" key={review.id}>
                    <span className="review-avatar">{initials(review.authorName)}</span>
                    <p><b>{review.authorName || "Гость"}</b><span>{review.body}</span></p>
                    <span className="stars">{stars(review.rating)}</span>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function VenueView({ venue, permissions, draft, setDraft, dirty, saved, action, fetcher, busy, message }: {
  venue: Venue;
  permissions: readonly MerchantPermission[];
  draft: VenueDraft;
  setDraft: StateSetter<VenueDraft>;
  dirty: boolean;
  saved: boolean;
  action: string;
  fetcher: FetcherWithComponents<MerchantActionResult>;
  busy: boolean;
  message: string;
}) {
  const set = (key: keyof VenueDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const features = draft.features.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
  return (
    <section className="merchant-view is-active" data-view-panel="venue">
      <div className="section-heading">
        <div><p className="eyebrow">Публичная карточка</p><h2>О заведении</h2><p>Поддерживайте контакты, описание и особенности актуальными — именно их увидят гости.</p></div>
        <span className={`save-state${saved && !dirty ? " is-saved" : ""}`} id="venue-save-state"><i /> {saved && !dirty ? "Изменения сохранены" : "Все изменения сохраняются вручную"}</span>
      </div>
      <fetcher.Form className="editor-panel" id="venue-form" method="post" action={action} aria-busy={busy} inert={busy ? true : undefined}>
        <input name="intent" type="hidden" value="venue.update" />
        <input name="venueId" type="hidden" value={venue.id} />
        {features.map((feature, index) => <input name="features" type="hidden" value={feature} key={`${feature}-${index}`} />)}
        <div className="editor-panel__aside">
          <div className="venue-cover" id="venue-editor-cover" style={coverStyle(venue.photos[0])}><span id="venue-editor-monogram">{initials(venue.title)}</span></div>
          <div className="venue-identity"><b id="venue-editor-name">{venue.title}</b><span id="venue-editor-category">{[venue.category, venue.city].filter(Boolean).join(" · ")}</span></div>
          <div className="permission-list" id="venue-permissions">{permissions.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</div>
        </div>
        <div className="editor-panel__fields">
          <div className="form-grid">
            <label className="field field--wide"><span>Название</span><input name="title" maxLength={160} required value={draft.title} onChange={set("title")} /></label>
            <label className="field"><span>Категория</span><input name="category" readOnly value={draft.category} /></label>
            <label className="field"><span>Кухня</span><input name="cuisine" maxLength={100} placeholder="Например, средиземноморская" value={draft.cuisine} onChange={set("cuisine")} /></label>
            <label className="field field--wide"><span>Короткое описание</span><textarea name="description" maxLength={2500} rows={5} placeholder="Расскажите об атмосфере, кухне и главных особенностях" required value={draft.description} onChange={set("description")} /><small><b data-count-for="description">{draft.description.length}</b>/2500</small></label>
            <label className="field field--wide"><span>Адрес</span><input name="address" maxLength={300} autoComplete="street-address" value={draft.address} onChange={set("address")} /></label>
            <label className="field"><span>Телефон</span><input name="phone" maxLength={60} type="tel" autoComplete="tel" value={draft.phone} onChange={set("phone")} /></label>
            <label className="field"><span>Сайт</span><input name="website" maxLength={300} type="url" placeholder="https://" value={draft.website} onChange={set("website")} /></label>
            <label className="field"><span>Режим работы</span><input name="hours" maxLength={200} placeholder="ежедневно, 09:00–23:00" value={draft.hours} onChange={set("hours")} /></label>
            <label className="field"><span>Средний чек</span><input name="averageCheck" maxLength={100} placeholder="от 1 200 ₽" value={draft.averageCheck} onChange={set("averageCheck")} /></label>
            <label className="field field--wide"><span>Особенности</span><textarea rows={3} placeholder="Wi-Fi, парковка, летняя веранда — через запятую" value={draft.features} onChange={set("features")} /><small>До 20 особенностей, разделяйте запятыми</small></label>
          </div>
          <div className="form-actions"><p id="venue-form-message" role="status">{message}</p><button className="button button--primary" type="submit" disabled={busy}><MerchantIcon name="save" /> {busy ? "Сохраняем…" : "Сохранить изменения"}</button></div>
        </div>
      </fetcher.Form>
    </section>
  );
}

function MenuView({ items, onNew, onEdit, onDelete }: {
  items: readonly MenuItem[];
  onNew: () => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const sections = useMemo(() => [...new Set(items.map((item) => item.section).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [items]);
  const effectiveSection = sections.includes(section) ? section : "";
  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.description} ${item.section}`.toLowerCase();
    return (!effectiveSection || item.section === effectiveSection) && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  });
  return (
    <section className="merchant-view is-active" data-view-panel="menu">
      <div className="section-heading section-heading--actions"><div><p className="eyebrow">Кухня заведения</p><h2>Меню</h2><p>Добавляйте блюда, цены и разделы. Недоступные позиции можно временно скрыть.</p></div><button className="button button--primary" type="button" onClick={onNew}><MerchantIcon name="plus" /> Добавить позицию</button></div>
      <div className="catalog-toolbar">
        <label className="toolbar-search"><MerchantIcon name="search" /><input id="menu-search" type="search" placeholder="Найти в меню" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="toolbar-select"><select id="menu-section-filter" aria-label="Фильтр по разделу" value={effectiveSection} onChange={(event) => setSection(event.target.value)}><option value="">Все разделы</option>{sections.map((value) => <option value={value} key={value}>{value}</option>)}</select><MerchantIcon name="chevron" /></label>
        <p id="menu-summary">{plural(filtered.length, ["позиция", "позиции", "позиций"])}</p>
      </div>
      <div className="menu-list" id="menu-list">
        {!filtered.length ? <EmptyList icon="menu" title={search || effectiveSection ? "Ничего не найдено" : "Меню пока пусто"} copy={search || effectiveSection ? "Измените фильтр или поисковый запрос." : "Добавьте первую позицию — например, фирменное блюдо или напиток."} action={search || effectiveSection ? undefined : { label: "Добавить позицию", onClick: onNew }} /> : filtered.map((item) => (
          <article className="menu-item" key={item.id}>
            <MenuImage item={item} />
            <div className="menu-item__copy"><p>{item.section || "Основное меню"}</p><h3>{item.title}</h3><span>{item.description || "Описание не добавлено"}</span></div>
            <b className="menu-item__price">{formatMoney(item.price)}</b>
            <span className={`availability${item.isAvailable ? "" : " is-hidden"}`}>{item.isAvailable ? "Доступно" : "Скрыто"}</span>
            <RowActions type="menu" id={item.id} title={item.title} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
          </article>
        ))}
      </div>
    </section>
  );
}

function PromotionsView({ items, onNew, onEdit, onDelete }: {
  items: readonly Promotion[];
  onNew: () => void;
  onEdit: (item: Promotion) => void;
  onDelete: (item: Promotion) => void;
}) {
  const labels: Record<Promotion["status"], string> = { draft: "Черновик", active: "Активна", archived: "Архив" };
  return (
    <section className="merchant-view is-active" data-view-panel="promotions">
      <div className="section-heading section-heading--actions"><div><p className="eyebrow">Предложения для гостей</p><h2>Акции</h2><p>Создавайте сезонные предложения и самостоятельно управляйте сроком их публикации.</p></div><button className="button button--primary" type="button" onClick={onNew}><MerchantIcon name="plus" /> Новая акция</button></div>
      <div className="promotion-list" id="promotion-list">
        {!items.length ? <EmptyList icon="tag" title="Акций пока нет" copy="Создайте предложение, укажите срок и опубликуйте его для гостей." action={{ label: "Создать акцию", onClick: onNew }} /> : items.map((item) => (
          <article className="promotion-card" key={item.id}>
            <div className="promotion-card__top"><span className={`promotion-status ${item.status}`}>{labels[item.status]}</span><RowActions type="promotion" id={item.id} title={item.title} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} /></div>
            <h3>{item.title}</h3><p>{item.description || "Описание акции не добавлено."}</p>
            <div className="promotion-dates"><span><MerchantIcon name="clock" />с {formatDate(item.startsAt)}</span><span><MerchantIcon name="clock" />до {formatDate(item.endsAt)}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReviewsView({ reviews }: { reviews: readonly Review[] }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return (
    <section className="merchant-view is-active" data-view-panel="reviews">
      <div className="section-heading"><div><p className="eyebrow">Мнение гостей</p><h2>Отзывы</h2><p>Опубликованные отзывы доступны только для чтения. Проверку и публикацию выполняет редакция.</p></div></div>
      {reviews.length ? (
        <div className="reviews-summary" id="reviews-summary">
          <div className="rating-total"><b>{average.toFixed(1)}</b><p><span className="stars">{stars(average)}</span><small>{plural(reviews.length, ["отзыв", "отзыва", "отзывов"])}</small></p></div>
          <div className="rating-bars">{[5, 4, 3, 2, 1].map((rating) => {
            const count = reviews.filter((review) => Math.round(review.rating) === rating).length;
            return <div className="rating-bar" key={rating}><span>{rating} ★</span><i style={{ "--rating-width": `${count / reviews.length * 100}%` } as CSSProperties} /><span>{count}</span></div>;
          })}</div>
        </div>
      ) : null}
      <div className="reviews-list" id="reviews-list">
        {!reviews.length ? <EmptyList icon="star" title="Отзывов пока нет" copy="Здесь появятся опубликованные редакцией отзывы гостей." /> : reviews.map((review) => (
          <article className="review-card" key={review.id}><span className="review-avatar">{initials(review.authorName)}</span><div className="review-card__copy"><h3>{review.authorName || "Гость"}</h3><time dateTime={review.createdAt || ""}>{formatDate(review.createdAt)}</time><p>{review.body}</p></div><span className="stars">{stars(review.rating)}</span></article>
        ))}
      </div>
    </section>
  );
}


export interface MerchantWorkspaceProps {
  workspace: MerchantWorkspaceSnapshot;
  activeView: MerchantView;
  action?: string;
  now?: number;
}

interface VenueDraft {
  title: string;
  category: string;
  cuisine: string;
  description: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  averageCheck: string;
  features: string;
}

interface MenuDraft {
  id: string;
  section: string;
  title: string;
  description: string;
  price: string;
  sortOrder: string;
  photoUrl: string;
  isAvailable: boolean;
}

interface PromotionDraft {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active" | "archived";
}

interface PasswordDraft {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}

type ConfirmState =
  | { kind: "delete"; entity: "menu" | "promotion"; id: string; title: string }
  | { kind: "discard"; title: string; copy: string; proceed: () => void }
  | null;

const emptyMenuDraft: MenuDraft = {
  id: "",
  section: "Основное меню",
  title: "",
  description: "",
  price: "",
  sortOrder: "0",
  photoUrl: "",
  isAvailable: true,
};

const emptyPromotionDraft: PromotionDraft = {
  id: "",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  status: "draft",
};

const emptyPasswordDraft: PasswordDraft = { currentPassword: "", password: "", confirmPassword: "" };
function venueDraft(venue: Venue): VenueDraft {
  return {
    title: venue.title,
    category: venue.category,
    cuisine: venue.cuisine,
    description: venue.description,
    address: venue.address,
    phone: venue.phone,
    website: venue.website,
    hours: venue.hours,
    averageCheck: venue.averageCheck,
    features: venue.features.join(", "),
  };
}

function menuDraft(item?: MenuItem): MenuDraft {
  if (!item) return { ...emptyMenuDraft };
  return {
    id: item.id,
    section: item.section || "Основное меню",
    title: item.title,
    description: item.description,
    price: item.price == null ? "" : String(item.price),
    sortOrder: String(item.sortOrder),
    photoUrl: item.photoUrl,
    isAvailable: item.isAvailable,
  };
}

function promotionDraft(item?: Promotion): PromotionDraft {
  if (!item) return { ...emptyPromotionDraft };
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    status: item.status,
  };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPromotionLive(item: Promotion, now: number) {
  const starts = item.startsAt ? new Date(item.startsAt).getTime() : null;
  const ends = item.endsAt ? new Date(item.endsAt).getTime() : null;
  return item.status === "active"
    && (starts === null || starts <= now)
    && (ends === null || ends >= now);
}

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

function focusables(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function EmptyList({ icon, title, copy, action }: {
  icon: "menu" | "tag" | "star";
  title: string;
  copy: string;
  action?: { label: string; onClick: () => void } | undefined;
}) {
  return (
    <div className="empty-list">
      <span><MerchantIcon name={icon} /></span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action ? <button className="button button--primary" type="button" onClick={action.onClick}>{action.label}</button> : null}
    </div>
  );
}

function MenuImage({ item }: { item: MenuItem }) {
  const [failed, setFailed] = useState(false);
  const image = safeImage(item.photoUrl);
  return (
    <div className="menu-item__image">
      {image && !failed
        ? <img src={image} alt="" loading="lazy" onError={() => setFailed(true)} />
        : initials(item.title)}
    </div>
  );
}

function RowActions({ type, id, title, onEdit, onDelete }: {
  type: "menu" | "promotion";
  id: string;
  title: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions">
      <button type="button" data-edit={type} data-id={id} title={`Редактировать «${title}»`} aria-label={`Редактировать «${title}»`} onClick={onEdit}><MerchantIcon name="edit" /></button>
      <button type="button" data-delete={type} data-id={id} title={`Удалить «${title}»`} aria-label={`Удалить «${title}»`} onClick={onDelete}><MerchantIcon name="trash" /></button>
    </div>
  );
}

export function MerchantWorkspace({ workspace, activeView, action = "/merchant", now }: MerchantWorkspaceProps) {
  const fetcher = useFetcher<MerchantActionResult>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [clock, setClock] = useState(now ?? Date.now());
  const [selectedVenueId, setSelectedVenueId] = useState(workspace.venues[0]?.id || "");
  const selectedVenue = workspace.venues.find((venue) => venue.id === selectedVenueId) || workspace.venues[0] || null;
  const membership = workspace.memberships.find((item) => item.venueId === selectedVenue?.id);
  const permissions = useMemo(() => permissionsForRole(membership?.role), [membership?.role]);
  const can = (permission: MerchantPermission) => permissions.includes(permission);
  const allowedView = activeView === "overview" || can(activeView) ? activeView : "overview";
  const menuItems = workspace.menuItems.filter((item) => item.venueId === selectedVenue?.id);
  const promotions = useMemo(
    () => workspace.promotions.filter((item) => item.venueId === selectedVenue?.id),
    [selectedVenue?.id, workspace.promotions],
  );
  const reviews = workspace.reviews.filter((item) => item.venueId === selectedVenue?.id);
  const livePromotions = promotions.filter((item) => isPromotionLive(item, clock));

  useEffect(() => {
    const boundaries = promotions.flatMap((item) => [item.startsAt, item.endsAt])
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value) && value > clock)
      .sort((left, right) => left - right);
    const nextBoundary = boundaries[0];
    if (nextBoundary === undefined) return;
    const delay = Math.min(Math.max(nextBoundary - Date.now() + 50, 0), 2_147_483_647);
    const timer = window.setTimeout(() => setClock(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [clock, promotions]);

  const initialVenueDraft = selectedVenue ? venueDraft(selectedVenue) : null;
  const [venueForm, setVenueForm] = useState<VenueDraft | null>(initialVenueDraft);
  const [venueBaseline, setVenueBaseline] = useState<VenueDraft | null>(initialVenueDraft);
  const [venueDraftId, setVenueDraftId] = useState(selectedVenue?.id || "");
  const [venueSaved, setVenueSaved] = useState(false);
  const venueDirty = Boolean(venueForm && venueBaseline && !sameValue(venueForm, venueBaseline));

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuForm, setMenuForm] = useState<MenuDraft>({ ...emptyMenuDraft });
  const [menuBaseline, setMenuBaseline] = useState<MenuDraft>({ ...emptyMenuDraft });
  const menuDirty = menuOpen && !sameValue(menuForm, menuBaseline);

  const [promotionOpen, setPromotionOpen] = useState(false);
  const [promotionForm, setPromotionForm] = useState<PromotionDraft>({ ...emptyPromotionDraft });
  const [promotionBaseline, setPromotionBaseline] = useState<PromotionDraft>({ ...emptyPromotionDraft });
  const promotionDirty = promotionOpen && !sameValue(promotionForm, promotionBaseline);

  const forcedPassword = workspace.user.mustChangePassword;
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(forcedPassword);
  const [passwordForm, setPasswordForm] = useState<PasswordDraft>({ ...emptyPasswordDraft });
  const passwordDirty = passwordOpen && !sameValue(passwordForm, emptyPasswordDraft);
  const [passwordError, setPasswordError] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  const dirty = venueDirty || menuDirty || promotionDirty || passwordDirty;
  const blocker = useBlocker(dirty);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousView = useRef(activeView);
  const handledResult = useRef<MerchantActionResult | undefined>(undefined);

  const menuDialogRef = useModal(menuOpen);
  const promotionDialogRef = useModal(promotionOpen);
  const passwordDialogRef = useModal(passwordOpen);
  const confirmDialogRef = useModal(Boolean(confirm));

  useEffect(() => {
    const remembered = window.localStorage.getItem("mesto-merchant-venue");
    // Restoring the legacy selection is a one-time browser synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (remembered && workspace.venues.some((venue) => venue.id === remembered)) setSelectedVenueId(remembered);
  }, [workspace.venues]);

  useEffect(() => {
    if (!workspace.venues.some((venue) => venue.id === selectedVenueId)) {
      // Keep selection valid after a loader revalidation removes a venue.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedVenueId(workspace.venues[0]?.id || "");
    }
  }, [selectedVenueId, workspace.venues]);

  useEffect(() => {
    if (!selectedVenue) return;
    if (venueDraftId !== selectedVenue.id || !venueDirty) {
      const next = venueDraft(selectedVenue);
      // A selected venue owns a distinct local draft.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVenueDraftId(selectedVenue.id);
      setVenueForm(next);
      setVenueBaseline(next);
      setVenueSaved(false);
    }
  }, [selectedVenue, venueDraftId, venueDirty]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (blocker.state !== "blocked" || confirm) return;
    // The blocker changes outside React state; mirror it in the legacy confirm dialog.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfirm({
      kind: "discard",
      title: "Покинуть редактор?",
      copy: "Несохранённые изменения будут потеряны.",
      proceed: () => {
        discardDrafts();
        blocker.proceed();
      },
    });
  // discardDrafts intentionally captures the currently selected venue and drafts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  useEffect(() => {
    if (previousView.current === activeView) return;
    previousView.current = activeView;
    // Route changes close the off-canvas navigation.
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => document.getElementById("mobile-menu")?.focus(), 0);
  }, [activeView]);

  /* eslint-disable react-hooks/set-state-in-effect -- fetcher completion synchronizes local drafts with an external route action. */
  useEffect(() => {
    if (!mobileOpen) return;
    const sidebar = document.getElementById("merchant-sidebar");
    if (!sidebar) return;
    const workspaceElement = document.querySelector<HTMLElement>("#merchant-app > .workspace");
    workspaceElement?.setAttribute("inert", "");
    const close = sidebar.querySelector<HTMLElement>("#sidebar-close");
    window.setTimeout(() => close?.focus(), 0);
    return () => workspaceElement?.removeAttribute("inert");
  }, [mobileOpen]);

  useEffect(() => {
    const result = fetcher.data;
    if (!result || handledResult.current === result) return;
    handledResult.current = result;
    // Fetcher completion is the authoritative mutation acknowledgement.
    setToast({ message: result.message, error: !result.ok });
    if (!result.ok) return;
    if (result.intent === "venue.update" && venueForm) {
      setVenueBaseline(venueForm);
      setVenueSaved(true);
    }
    if (result.intent === "menu.create" || result.intent === "menu.update") {
      setMenuOpen(false);
      setMenuForm({ ...emptyMenuDraft });
      setMenuBaseline({ ...emptyMenuDraft });
    }
    if (result.intent === "promotion.create" || result.intent === "promotion.update") {
      setPromotionOpen(false);
      setPromotionForm({ ...emptyPromotionDraft });
      setPromotionBaseline({ ...emptyPromotionDraft });
    }
    if (result.intent === "merchant.password") {
      setPasswordSaved(true);
      setPasswordOpen(false);
      setPasswordForm({ ...emptyPasswordDraft });
      setPasswordError("");
    }
  }, [fetcher.data, venueForm]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3300);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const busy = fetcher.state !== "idle";
  const submittedIntent = fetcher.formData?.get("intent");
  const busyIntent = typeof submittedIntent === "string" ? submittedIntent : "";
  const actionMessage = (intent: string) => fetcher.data?.intent === intent && !fetcher.data.ok ? fetcher.data.message : "";

  function discardDrafts() {
    if (selectedVenue) {
      const next = venueDraft(selectedVenue);
      setVenueForm(next);
      setVenueBaseline(next);
    }
    setMenuOpen(false);
    setMenuForm({ ...emptyMenuDraft });
    setMenuBaseline({ ...emptyMenuDraft });
    setPromotionOpen(false);
    setPromotionForm({ ...emptyPromotionDraft });
    setPromotionBaseline({ ...emptyPromotionDraft });
    if (!forcedPassword || passwordSaved) setPasswordOpen(false);
    setPasswordForm({ ...emptyPasswordDraft });
  }

  function guarded(title: string, copy: string, proceed: () => void) {
    if (!dirty) {
      proceed();
      return;
    }
    setConfirm({ kind: "discard", title, copy, proceed });
  }

  function selectView(view: MerchantView) {
    if (view !== "overview" && !can(view)) return;
    if (mobileOpen) {
      setMobileOpen(false);
      window.setTimeout(() => document.getElementById("mobile-menu")?.focus(), 50);
    }
    void navigate(`/merchant/${view}`);
  }

  function selectVenue(event: ChangeEvent<HTMLSelectElement>) {
    const venueId = event.target.value;
    if (venueId === selectedVenueId) return;
    guarded("Выбрать другое заведение?", "Несохранённые изменения текущего заведения будут потеряны.", () => {
      discardDrafts();
      setSelectedVenueId(venueId);
      window.localStorage.setItem("mesto-merchant-venue", venueId);
      const title = workspace.venues.find((venue) => venue.id === venueId)?.title || "заведение";
      setToast({ message: `Выбрано: ${title}`, error: false });
    });
  }

  function refresh() {
    guarded("Обновить данные?", "Несохранённые изменения будут заменены данными сервера.", () => {
      discardDrafts();
      void revalidator.revalidate();
    });
  }

  function openMenu(item?: MenuItem) {
    const next = menuDraft(item);
    setMenuForm(next);
    setMenuBaseline(next);
    setMenuOpen(true);
    window.setTimeout(() => menuDialogRef.current?.querySelector<HTMLInputElement>("[name='title']")?.focus(), 60);
  }

  function closeMenu() {
    if (menuDirty) {
      setConfirm({
        kind: "discard",
        title: "Закрыть редактор позиции?",
        copy: "Несохранённые изменения позиции будут потеряны.",
        proceed: () => {
          setMenuOpen(false);
          setMenuForm({ ...emptyMenuDraft });
          setMenuBaseline({ ...emptyMenuDraft });
        },
      });
      return;
    }
    setMenuOpen(false);
  }

  function openPromotion(item?: Promotion) {
    const next = promotionDraft(item);
    setPromotionForm(next);
    setPromotionBaseline(next);
    setPromotionOpen(true);
    window.setTimeout(() => promotionDialogRef.current?.querySelector<HTMLInputElement>("[name='title']")?.focus(), 60);
  }

  function closePromotion() {
    if (promotionDirty) {
      setConfirm({
        kind: "discard",
        title: "Закрыть редактор акции?",
        copy: "Несохранённые изменения акции будут потеряны.",
        proceed: () => {
          setPromotionOpen(false);
          setPromotionForm({ ...emptyPromotionDraft });
          setPromotionBaseline({ ...emptyPromotionDraft });
        },
      });
      return;
    }
    setPromotionOpen(false);
  }

  function requestDelete(entity: "menu" | "promotion", id: string, title: string) {
    setConfirm({ kind: "delete", entity, id, title });
  }

  function acceptConfirm() {
    if (!confirm || busy) return;
    if (confirm.kind === "delete") {
      void fetcher.submit(
        { intent: `${confirm.entity}.delete`, id: confirm.id },
        { method: "post", action },
      );
      setConfirm(null);
      return;
    }
    const proceed = confirm.proceed;
    setConfirm(null);
    window.setTimeout(proceed, 0);
  }

  function cancelConfirm() {
    if (confirm?.kind === "discard" && blocker.state === "blocked") blocker.reset();
    setConfirm(null);
  }

  function sidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      setMobileOpen(false);
      window.setTimeout(() => document.getElementById("mobile-menu")?.focus(), 0);
      return;
    }
    if (event.key !== "Tab") return;
    const elements = focusables(event.currentTarget);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!selectedVenue) {
    return (
      <>
        <MerchantShell
          workspace={workspace}
          activeView="overview"
          permissions={[]}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
          onSidebarKeyDown={sidebarKeyDown}
          onSelectView={selectView}
          selectedVenueId=""
          onSelectVenue={selectVenue}
          onRefresh={refresh}
          refreshing={revalidator.state !== "idle"}
          action={action}
          dirty={dirty}
          menuCount={0}
          promotionCount={0}
          reviewCount={0}
        >
          {forcedPassword && !passwordSaved ? (
            <div className="password-alert" id="password-alert">
              <span className="password-alert__icon"><MerchantIcon name="shield" /></span>
              <p><b>Защитите аккаунт</b><span>Вы вошли с временным паролем. Создайте постоянный пароль, известный только вам.</span></p>
              <button type="button" onClick={() => setPasswordOpen(true)}>Сменить пароль <MerchantIcon name="arrow" /></button>
            </div>
          ) : null}
          <div className="workspace-empty" id="workspace-empty">
            <span><MerchantIcon name="store" /></span>
            <h2>Заведение ещё не назначено</h2>
            <p>Ваш аккаунт активен, но администратор пока не привязал к нему карточку. Обратитесь в редакцию «Места».</p>
            <a className="button button--primary" href="/">Открыть городской гид</a>
          </div>
        </MerchantShell>
        {forcedPassword && !passwordSaved ? (
          <PasswordDialog
            dialogRef={passwordDialogRef}
            open={passwordOpen}
            forced
            draft={passwordForm}
            setDraft={setPasswordForm}
            visible={passwordVisible}
            setVisible={setPasswordVisible}
            action={action}
            fetcher={fetcher}
            busy={busy && busyIntent === "merchant.password"}
            message={passwordError || actionMessage("merchant.password")}
            setMessage={setPasswordError}
            onClose={() => undefined}
          />
        ) : null}
        <MerchantSprite />
      </>
    );
  }

  return (
    <>
      <MerchantShell
        workspace={workspace}
        activeView={allowedView}
        permissions={permissions}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onSidebarKeyDown={sidebarKeyDown}
        onSelectView={selectView}
        selectedVenueId={selectedVenue.id}
        onSelectVenue={selectVenue}
        onRefresh={refresh}
        refreshing={revalidator.state !== "idle"}
        action={action}
        dirty={dirty}
        menuCount={menuItems.length}
        promotionCount={livePromotions.length}
        reviewCount={reviews.length}
      >
        {forcedPassword && !passwordSaved ? (
          <div className="password-alert" id="password-alert">
            <span className="password-alert__icon"><MerchantIcon name="shield" /></span>
            <p><b>Защитите аккаунт</b><span>Вы вошли с временным паролем. Создайте постоянный пароль, известный только вам.</span></p>
            <button type="button" onClick={() => setPasswordOpen(true)}>Сменить пароль <MerchantIcon name="arrow" /></button>
          </div>
        ) : null}

        <div className="view-stack" id="view-stack">
          {allowedView === "overview" ? (
            <OverviewView
              workspace={workspace}
              venue={selectedVenue}
              menu={menuItems}
              promotions={livePromotions}
              reviews={reviews}
              can={can}
              onSelectView={selectView}
              onNewMenu={() => openMenu()}
              onNewPromotion={() => openPromotion()}
            />
          ) : null}
          {allowedView === "venue" && venueForm ? (
            <VenueView
              venue={selectedVenue}
              permissions={permissions}
              draft={venueForm}
              setDraft={(next) => {
                setVenueSaved(false);
                setVenueForm((current) => {
                  if (!current) return current;
                  return typeof next === "function" ? next(current) : next;
                });
              }}
              dirty={venueDirty}
              saved={venueSaved}
              action={action}
              fetcher={fetcher}
              busy={busy && busyIntent === "venue.update"}
              message={actionMessage("venue.update")}
            />
          ) : null}
          {allowedView === "menu" ? (
            <MenuView
              items={menuItems}
              onNew={() => openMenu()}
              onEdit={openMenu}
              onDelete={(item) => requestDelete("menu", item.id, item.title)}
            />
          ) : null}
          {allowedView === "promotions" ? (
            <PromotionsView
              items={promotions}
              onNew={() => openPromotion()}
              onEdit={openPromotion}
              onDelete={(item) => requestDelete("promotion", item.id, item.title)}
            />
          ) : null}
          {allowedView === "reviews" ? <ReviewsView reviews={reviews} /> : null}
        </div>
      </MerchantShell>

      <MenuDialog
        dialogRef={menuDialogRef}
        open={menuOpen}
        draft={menuForm}
        setDraft={setMenuForm}
        venueId={selectedVenue.id}
        action={action}
        fetcher={fetcher}
        busy={busy && (busyIntent === "menu.create" || busyIntent === "menu.update")}
        message={actionMessage(menuForm.id ? "menu.update" : "menu.create")}
        onClose={closeMenu}
      />
      <PromotionDialog
        dialogRef={promotionDialogRef}
        open={promotionOpen}
        draft={promotionForm}
        setDraft={setPromotionForm}
        venueId={selectedVenue.id}
        action={action}
        fetcher={fetcher}
        busy={busy && (busyIntent === "promotion.create" || busyIntent === "promotion.update")}
        message={actionMessage(promotionForm.id ? "promotion.update" : "promotion.create")}
        onClose={closePromotion}
      />
      <PasswordDialog
        dialogRef={passwordDialogRef}
        open={passwordOpen}
        forced={forcedPassword && !passwordSaved}
        draft={passwordForm}
        setDraft={setPasswordForm}
        visible={passwordVisible}
        setVisible={setPasswordVisible}
        action={action}
        fetcher={fetcher}
        busy={busy && busyIntent === "merchant.password"}
        message={passwordError || actionMessage("merchant.password")}
        setMessage={setPasswordError}
        onClose={() => {
          if (forcedPassword && !passwordSaved) return;
          if (passwordDirty) {
            setConfirm({ kind: "discard", title: "Закрыть смену пароля?", copy: "Введённые данные будут очищены.", proceed: () => {
              setPasswordOpen(false);
              setPasswordForm({ ...emptyPasswordDraft });
            } });
          } else setPasswordOpen(false);
        }}
      />
      <ConfirmDialog dialogRef={confirmDialogRef} state={confirm} pending={busy && busyIntent.endsWith(".delete")} onCancel={cancelConfirm} onAccept={acceptConfirm} />

      {(busy && busyIntent.endsWith(".delete")) || revalidator.state !== "idle" ? (
        <div className="loading-screen" id="loading-screen" aria-live="polite"><span /><p>Обновляем кабинет…</p></div>
      ) : null}
      <div className={`merchant-toast${toast ? " is-visible" : ""}${toast?.error ? " is-error" : ""}`} id="merchant-toast" role="status" aria-live="polite">{toast?.message || ""}</div>
      <MerchantSprite />
    </>
  );
}

interface MerchantShellProps {
  workspace: MerchantWorkspaceSnapshot;
  activeView: MerchantView;
  permissions: readonly MerchantPermission[];
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  onSidebarKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onSelectView: (view: MerchantView) => void;
  selectedVenueId: string;
  onSelectVenue: (event: ChangeEvent<HTMLSelectElement>) => void;
  onRefresh: () => void;
  refreshing: boolean;
  action: string;
  dirty: boolean;
  menuCount: number;
  promotionCount: number;
  reviewCount: number;
  children: ReactNode;
}

function MerchantShell(props: MerchantShellProps) {
  const { workspace, activeView, permissions } = props;
  const nav: readonly [MerchantView, "grid" | "store" | "menu" | "tag" | "star", string, number | null][] = [
    ["overview", "grid", "Обзор", null],
    ["venue", "store", "О заведении", null],
    ["menu", "menu", "Меню", props.menuCount],
    ["promotions", "tag", "Акции", props.promotionCount],
    ["reviews", "star", "Отзывы", props.reviewCount],
  ];
  const visible = (view: MerchantView) => view === "overview" || permissions.includes(view);
  const userLabel = workspace.user.name || workspace.user.username || "Ресторатор";
  return (
    <div className="merchant-app" id="merchant-app">
      <aside
        className={`sidebar${props.mobileOpen ? " is-open" : ""}`}
        id="merchant-sidebar"
        onKeyDown={props.onSidebarKeyDown}
      >
        <div className="sidebar__top">
          <a className="brand brand--light" href="/" aria-label="Место — открыть сайт"><span>Место</span><i>✦</i></a>
          <button className="sidebar-close" id="sidebar-close" type="button" aria-label="Закрыть меню" onClick={() => {
            props.setMobileOpen(false);
            window.setTimeout(() => document.getElementById("mobile-menu")?.focus(), 0);
          }}><MerchantIcon name="close" /></button>
        </div>
        <div className="sidebar__caption">Кабинет ресторатора</div>
        <nav className="sidebar-nav" aria-label="Разделы кабинета">
          {nav.filter(([view]) => visible(view)).map(([view, icon, label, count]) => (
            <button className={activeView === view ? "is-active" : undefined} type="button" key={view} onClick={() => props.onSelectView(view)}>
              <MerchantIcon name={icon} /><span>{label}</span>{count === null ? null : <b>{count}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar__support">
          <span><MerchantIcon name="help" /></span>
          <p><b>Нужна помощь?</b><small>Редакция поможет обновить данные или настроить доступ.</small></p>
        </div>
        <div className="sidebar__account">
          <span className="account-avatar" id="sidebar-avatar">{initials(userLabel)}</span>
          <p><b id="sidebar-user-name">{userLabel}</b><small id="sidebar-user-email">{workspace.user.email}</small></p>
          <Form method="post" action={props.action} replace>
            <input name="intent" type="hidden" value="merchant.logout" />
            <button id="merchant-logout" type="submit" aria-label="Выйти из кабинета" title="Выйти"><MerchantIcon name="logout" /></button>
          </Form>
        </div>
      </aside>
      <button
        className="sidebar-scrim"
        id="sidebar-scrim"
        type="button"
        aria-label="Закрыть меню"
        hidden={!props.mobileOpen}
        onClick={() => {
          props.setMobileOpen(false);
          window.setTimeout(() => document.getElementById("mobile-menu")?.focus(), 0);
        }}
      />
      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" id="mobile-menu" type="button" aria-label="Открыть меню" aria-controls="merchant-sidebar" aria-expanded={props.mobileOpen} onClick={() => props.setMobileOpen(true)}><MerchantIcon name="hamburger" /></button>
          <div className="topbar__title"><p className="eyebrow" id="view-eyebrow">{viewMeta[activeView][0]}</p><h1 id="view-title">{viewMeta[activeView][1]}</h1></div>
          <div className="topbar__actions">
            <label className="venue-switcher" id="venue-switcher-wrap" hidden={!workspace.venues.length}>
              <span>Заведение</span>
              <select id="venue-switcher" aria-label="Выбрать заведение" value={props.selectedVenueId} onChange={props.onSelectVenue}>
                {workspace.venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.title}</option>)}
              </select>
              <MerchantIcon name="chevron" />
            </label>
            <button className={`icon-button${props.refreshing ? " is-loading" : ""}`} id="refresh-workspace" type="button" aria-label="Обновить данные" title="Обновить" disabled={props.refreshing} onClick={props.onRefresh}><MerchantIcon name="refresh" /></button>
            <a className="button button--soft topbar__site-link" href="/" target="_blank" rel="noopener"><span>Открыть сайт</span><MerchantIcon name="external" /></a>
          </div>
        </header>
        {props.children}
      </section>
    </div>
  );
}

function MenuDialog({ dialogRef, draft, setDraft, venueId, action, fetcher, busy, message, onClose }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  draft: MenuDraft;
  setDraft: StateSetter<MenuDraft>;
  venueId: string;
  action: string;
  fetcher: FetcherWithComponents<MerchantActionResult>;
  busy: boolean;
  message: string;
  onClose: () => void;
}) {
  const set = (key: keyof MenuDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return (
    <dialog className="form-dialog" id="menu-dialog" aria-labelledby="menu-dialog-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <fetcher.Form className="dialog-card" id="menu-form" method="post" action={action} aria-busy={busy} inert={busy ? true : undefined} onSubmit={(event) => { if (busy) event.preventDefault(); }}>
        <input name="intent" type="hidden" value={draft.id ? "menu.update" : "menu.create"} />
        <input name="id" type="hidden" value={draft.id} />
        <input name="venueId" type="hidden" value={venueId} />
        <input name="isAvailable" type="hidden" value={String(draft.isAvailable)} />
        <div className="dialog-heading"><div><p className="eyebrow">Меню заведения</p><h2 id="menu-dialog-title">{draft.id ? "Редактировать позицию" : "Новая позиция"}</h2></div><button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}><MerchantIcon name="close" /></button></div>
        <div className="form-grid">
          <label className="field"><span>Раздел</span><input name="section" maxLength={100} placeholder="Основное меню" required value={draft.section} onChange={set("section")} /></label>
          <label className="field"><span>Название</span><input name="title" maxLength={160} required value={draft.title} onChange={set("title")} /></label>
          <label className="field field--wide"><span>Описание</span><textarea name="description" maxLength={600} rows={3} value={draft.description} onChange={set("description")} /></label>
          <label className="field"><span>Цена, ₽</span><input name="price" type="number" min="0" step="1" inputMode="decimal" value={draft.price} onChange={set("price")} /></label>
          <label className="field"><span>Порядок</span><input name="sortOrder" type="number" step="1" value={draft.sortOrder} onChange={set("sortOrder")} /></label>
          <label className="field field--wide"><span>Ссылка на фотографию</span><input name="photoUrl" type="url" placeholder="https://" value={draft.photoUrl} onChange={set("photoUrl")} /></label>
          <label className="check-field field--wide"><input type="checkbox" checked={draft.isAvailable} onChange={(event) => {
            const isAvailable = event.target.checked;
            setDraft((current) => ({ ...current, isAvailable }));
          }} /><span><b>Позиция доступна</b><small>Гости увидят её в карточке заведения</small></span></label>
        </div>
        <p className="dialog-message" id="menu-form-message" role="alert">{message}</p>
        <div className="dialog-actions"><button className="button button--ghost" type="button" onClick={onClose}>Отмена</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить позицию"}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function PromotionDialog({ dialogRef, draft, setDraft, venueId, action, fetcher, busy, message, onClose }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  draft: PromotionDraft;
  setDraft: StateSetter<PromotionDraft>;
  venueId: string;
  action: string;
  fetcher: FetcherWithComponents<MerchantActionResult>;
  busy: boolean;
  message: string;
  onClose: () => void;
}) {
  const [localMessage, setLocalMessage] = useState("");
  const set = (key: keyof PromotionDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [key]: value }));
  };
  function validate(event: FormEvent<HTMLFormElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (draft.startsAt && draft.endsAt && new Date(draft.endsAt) < new Date(draft.startsAt)) {
      event.preventDefault();
      setLocalMessage("Дата завершения не может быть раньше даты начала.");
    } else setLocalMessage("");
  }
  return (
    <dialog className="form-dialog" id="promotion-dialog" aria-labelledby="promotion-dialog-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <fetcher.Form className="dialog-card" id="promotion-form" method="post" action={action} aria-busy={busy} inert={busy ? true : undefined} onSubmit={validate}>
        <input name="intent" type="hidden" value={draft.id ? "promotion.update" : "promotion.create"} />
        <input name="id" type="hidden" value={draft.id} />
        <input name="venueId" type="hidden" value={venueId} />
        <div className="dialog-heading"><div><p className="eyebrow">Предложение для гостей</p><h2 id="promotion-dialog-title">{draft.id ? "Редактировать акцию" : "Новая акция"}</h2></div><button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}><MerchantIcon name="close" /></button></div>
        <div className="form-grid">
          <label className="field field--wide"><span>Название</span><input name="title" maxLength={160} required value={draft.title} onChange={set("title")} /></label>
          <label className="field field--wide"><span>Описание</span><textarea name="description" maxLength={1000} rows={4} value={draft.description} onChange={set("description")} /></label>
          <label className="field"><span>Начало</span><input name="startsAt" type="datetime-local" value={draft.startsAt} onChange={set("startsAt")} /></label>
          <label className="field"><span>Окончание</span><input name="endsAt" type="datetime-local" value={draft.endsAt} onChange={set("endsAt")} /></label>
          <label className="field field--wide"><span>Статус</span><span className="select-shell"><select name="status" value={draft.status} onChange={set("status")}><option value="draft">Черновик</option><option value="active">Активна</option><option value="archived">Архив</option></select><MerchantIcon name="chevron" /></span></label>
        </div>
        <input name="startsAtIso" type="hidden" value={draft.startsAt ? new Date(draft.startsAt).toISOString() : ""} />
        <input name="endsAtIso" type="hidden" value={draft.endsAt ? new Date(draft.endsAt).toISOString() : ""} />
        <p className="dialog-message" id="promotion-form-message" role="alert">{localMessage || message}</p>
        <div className="dialog-actions"><button className="button button--ghost" type="button" onClick={onClose}>Отмена</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить акцию"}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function PasswordDialog({ dialogRef, forced, draft, setDraft, visible, setVisible, action, fetcher, busy, message, setMessage, onClose }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  open: boolean;
  forced: boolean;
  draft: PasswordDraft;
  setDraft: StateSetter<PasswordDraft>;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  action: string;
  fetcher: FetcherWithComponents<MerchantActionResult>;
  busy: boolean;
  message: string;
  setMessage: (message: string) => void;
  onClose: () => void;
}) {
  function validate(event: FormEvent<HTMLFormElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (draft.password.length < 10 || !/[A-Za-zА-Яа-яЁё]/.test(draft.password) || !/\d/.test(draft.password)) {
      event.preventDefault();
      setMessage("Пароль должен содержать минимум 10 символов, букву и цифру.");
    } else if (draft.password !== draft.confirmPassword) {
      event.preventDefault();
      setMessage("Пароли не совпадают.");
    } else setMessage("");
  }
  return (
    <dialog className="form-dialog form-dialog--small" id="password-dialog" aria-labelledby="password-dialog-title" data-forced={String(forced)} ref={dialogRef} onCancel={(event) => { event.preventDefault(); if (!forced) onClose(); }}>
      <fetcher.Form className="dialog-card" id="password-form" method="post" action={action} aria-busy={busy} inert={busy ? true : undefined} onSubmit={validate}>
        <input name="intent" type="hidden" value="merchant.password" />
        <div className="dialog-heading"><div><p className="eyebrow">Безопасность</p><h2 id="password-dialog-title">Новый пароль</h2></div>{!forced ? <button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}><MerchantIcon name="close" /></button> : null}</div>
        <p className="dialog-lead">Используйте не менее 10 символов, хотя бы одну букву и одну цифру.</p>
        {!forced ? <label className="field" id="current-password-field"><span>Текущий пароль</span><span className="input-shell"><MerchantIcon name="lock" /><input name="currentPassword" type="password" autoComplete="current-password" required value={draft.currentPassword} onChange={(event) => {
          const currentPassword = event.target.value;
          setDraft((current) => ({ ...current, currentPassword }));
        }} /></span></label> : null}
        <label className="field"><span>Новый пароль</span><span className="input-shell"><MerchantIcon name="lock" /><input name="password" type={visible ? "text" : "password"} minLength={10} autoComplete="new-password" required value={draft.password} onChange={(event) => {
          const password = event.target.value;
          setDraft((current) => ({ ...current, password }));
        }} /><button className="password-toggle" type="button" aria-label={visible ? "Скрыть пароль" : "Показать пароль"} onClick={() => setVisible(!visible)}><MerchantIcon name="eye" /></button></span></label>
        <label className="field"><span>Повторите пароль</span><span className="input-shell"><MerchantIcon name="lock" /><input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required value={draft.confirmPassword} onChange={(event) => {
          const confirmPassword = event.target.value;
          setDraft((current) => ({ ...current, confirmPassword }));
        }} /></span></label>
        <p className="dialog-message" id="password-form-message" role="alert">{message}</p>
        <div className="dialog-actions">{!forced ? <button className="button button--ghost" type="button" onClick={onClose}>Позже</button> : null}<button className="button button--primary" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить пароль"}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function ConfirmDialog({ dialogRef, state, pending, onCancel, onAccept }: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  state: ConfirmState;
  pending: boolean;
  onCancel: () => void;
  onAccept: () => void;
}) {
  const deleting = state?.kind === "delete";
  const title = deleting ? (state.entity === "menu" ? "Удалить позицию?" : "Удалить акцию?") : state?.title || "Покинуть редактор?";
  const copy = deleting ? `«${state.title}» будет удалено без возможности восстановления.` : state?.kind === "discard" ? state.copy : "Несохранённые изменения будут потеряны.";
  return (
    <dialog className="confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <div className="confirm-card">
        <span className="confirm-card__icon"><MerchantIcon name={deleting ? "trash" : "arrow"} /></span>
        <h2 id="confirm-title">{title}</h2><p id="confirm-copy">{copy}</p>
        <div className="dialog-actions"><button className="button button--ghost" id="confirm-cancel" type="button" disabled={pending} onClick={onCancel}>Отмена</button><button className={deleting ? "button button--danger" : "button button--primary"} id="confirm-accept" type="button" disabled={pending} onClick={onAccept}>{pending ? "Подождите…" : deleting ? "Удалить" : "Покинуть"}</button></div>
      </div>
    </dialog>
  );
}
