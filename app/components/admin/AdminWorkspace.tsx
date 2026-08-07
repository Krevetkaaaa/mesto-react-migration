import {
  type ChangeEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FetcherWithComponents,
  useFetcher,
  useNavigate,
  useRevalidator,
} from "react-router";

import type {
  AdminDashboard,
  MerchantAccount,
  OneTimeCredentials,
  Review,
  Venue,
  VenueSubmission,
} from "../../lib/domain";
import type { AdminActionData, AdminRouteWorkspace } from "../../modules/admin-console.server";
import {
  formatAdminDate,
  listInput,
  membershipRoleLabels,
  merchantEmail,
  merchantRole,
  merchantVenues,
  type AdminView,
  viewTitles,
} from "./admin-ui";

interface AdminWorkspaceProps {
  workspace: AdminRouteWorkspace;
  activeView: AdminView;
  routeActionData: AdminActionData | undefined;
}

interface CredentialDisplay extends OneTimeCredentials {
  name: string;
  email: string;
}

type ConfirmState =
  | { kind: "moderation"; target: "submission" | "review"; decision: "approve" | "reject"; id: string; title: string }
  | { kind: "venue.delete"; venue: Venue }
  | { kind: "merchant.status"; merchant: MerchantAccount; status: "active" | "suspended" }
  | { kind: "merchant.password.reset"; merchant: MerchantAccount };

interface VenueDraft {
  id: string;
  title: string;
  slug: string;
  city: string;
  category: string;
  cuisine: string;
  averageCheck: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  source: string;
  status: string;
  description: string;
  editorChoice: boolean;
  features: string;
  photos: string;
}

function venueDraft(venue?: Venue): VenueDraft {
  const features = venue?.features ?? [];
  return {
    id: venue?.id ?? "",
    title: venue?.title ?? "",
    slug: venue?.slug ?? "",
    city: venue?.city ?? "Симферополь",
    category: venue?.category ?? "",
    cuisine: venue?.cuisine ?? "",
    averageCheck: venue?.averageCheck ?? "",
    address: venue?.address ?? "",
    phone: venue?.phone ?? "",
    website: venue?.website ?? "",
    hours: venue?.hours ?? "",
    source: venue?.source ?? "editorial",
    status: venue?.status ?? "published",
    description: venue?.description ?? "",
    editorChoice: features.some((item) => /выбор места/i.test(item)),
    features: features.filter((item) => !/выбор места/i.test(item)).join(", "),
    photos: (venue?.photos ?? []).join("\n"),
  };
}

function showDialog(ref: RefObject<HTMLDialogElement | null>) {
  if (ref.current && !ref.current.open) ref.current.showModal();
}

function CompactRow({ title, detail, date }: { title: string; detail: string; date: string | null }) {
  return (
    <div className="compact-row">
      <i aria-hidden="true">{title.slice(0, 1) || "М"}</i>
      <span><b>{title}</b><small>{detail}</small></span>
      <time dateTime={date ?? undefined}>{formatAdminDate(date)}</time>
    </div>
  );
}

function OverviewView({ dashboard, onView }: { dashboard: AdminDashboard; onView: (view: AdminView) => void }) {
  const pending = dashboard.submissions.filter((item) => item.status === "pending").slice(0, 5);
  return (
    <section className="admin-view is-active" data-view-panel="overview" aria-labelledby="admin-view-title">
      <div className="stat-grid">
        <article><span>Опубликовано</span><b id="stat-venues">{dashboard.stats.venues}</b><small>карточек «Места»</small></article>
        <article><span>Новые заведения</span><b id="stat-submissions">{dashboard.stats.pendingVenues}</b><small>ждут модерации</small></article>
        <article><span>Новые отзывы</span><b id="stat-reviews">{dashboard.stats.pendingReviews}</b><small>ждут проверки</small></article>
        <article><span>Рестораторы</span><b id="stat-merchants">{dashboard.stats.merchants}</b><small>аккаунтов владельцев</small></article>
        <article><span>Города</span><b id="stat-cities">{dashboard.stats.cities}</b><small>в постоянном каталоге</small></article>
      </div>
      <div className="overview-grid">
        <section className="admin-panel">
          <div className="panel-heading"><div><p className="admin-eyebrow">Очередь</p><h2>Последние заявки</h2></div><button type="button" onClick={() => onView("submissions")}>Смотреть все →</button></div>
          <div className="compact-list" id="overview-submissions">
            {pending.length ? pending.map((item) => <CompactRow key={item.id} title={item.title} detail={`${item.city} · ${item.status}`} date={item.createdAt} />) : <div className="empty-state">Новых заявок нет</div>}
          </div>
        </section>
        <section className="admin-panel">
          <div className="panel-heading"><div><p className="admin-eyebrow">Каталог</p><h2>Недавно обновлены</h2></div><button type="button" onClick={() => onView("venues")}>Открыть каталог →</button></div>
          <div className="compact-list" id="overview-venues">
            {dashboard.venues.length ? dashboard.venues.slice(0, 5).map((item) => <CompactRow key={item.id} title={item.title} detail={`${item.city} · ${item.category}`} date={item.createdAt ?? item.updatedAt} />) : <div className="empty-state">Постоянный каталог пока пуст</div>}
          </div>
        </section>
      </div>
    </section>
  );
}

function SubmissionsView({ items, onModerate }: { items: readonly VenueSubmission[]; onModerate: (item: VenueSubmission, decision: "approve" | "reject") => void }) {
  const pending = items.filter((item) => item.status === "pending");
  return (
    <section className="admin-view is-active" data-view-panel="submissions" aria-labelledby="submissions-title">
      <div className="view-heading"><div><p className="admin-eyebrow">Проверка редакции</p><h2 id="submissions-title">Заявки на добавление</h2><p>Одобрение автоматически создаёт опубликованную карточку. Отказ сохраняет причину для истории.</p></div></div>
      <div className="moderation-grid" id="moderation-list">
        {pending.length ? pending.map((item) => (
          <article className="moderation-card" key={item.id} data-submission-id={item.id}>
            <div><p className="admin-eyebrow">{item.city} · {item.category}</p><h3>{item.title}</h3><p>{item.description}</p><div className="data-chips"><span>{item.contactName}</span><span>{item.contactEmail}</span>{item.cuisine ? <span>{item.cuisine}</span> : null}{item.address ? <span>{item.address}</span> : null}<span>{formatAdminDate(item.createdAt)}</span></div></div>
            <div className="moderation-actions"><button className="approve" type="button" onClick={() => onModerate(item, "approve")}>Одобрить</button><button className="reject" type="button" onClick={() => onModerate(item, "reject")}>Отклонить</button></div>
          </article>
        )) : <div className="empty-state">Все заявки обработаны</div>}
      </div>
    </section>
  );
}

function ReviewsView({ items, onModerate }: { items: readonly Review[]; onModerate: (item: Review, decision: "approve" | "reject") => void }) {
  const pending = items.filter((item) => item.status === "pending");
  return (
    <section className="admin-view is-active" data-view-panel="reviews" aria-labelledby="reviews-title">
      <div className="view-heading"><div><p className="admin-eyebrow">Обратная связь</p><h2 id="reviews-title">Отзывы на модерации</h2><p>Публикуйте только содержательные отзывы, основанные на реальном посещении.</p></div></div>
      <div className="review-admin-list" id="reviews-list">
        {pending.length ? pending.map((item) => (
          <article className="review-admin-card" key={item.id} data-review-id={item.id}>
            <div><p className="admin-eyebrow">{item.venueTitle}</p><h3>{item.authorName}</h3><div className="review-stars" aria-label={`${item.rating} из 5`}>{"★".repeat(item.rating)}{"☆".repeat(Math.max(0, 5 - item.rating))}</div><p>{item.body}</p></div>
            <div className="review-actions"><button className="approve" type="button" onClick={() => onModerate(item, "approve")}>Опубликовать</button><button className="reject" type="button" onClick={() => onModerate(item, "reject")}>Отклонить</button></div>
          </article>
        )) : <div className="empty-state">Новых отзывов нет</div>}
      </div>
    </section>
  );
}

function VenuesView({ venues, onNew, onEdit, onDelete }: { venues: readonly Venue[]; onNew: () => void; onEdit: (venue: Venue) => void; onDelete: (venue: Venue) => void }) {
  return (
    <section className="admin-view is-active" data-view-panel="venues" aria-labelledby="venues-title">
      <div className="view-heading"><div><p className="admin-eyebrow">Постоянная база</p><h2 id="venues-title">Заведения «Места»</h2><p>Редакционные, пользовательские и карточки владельцев хранятся в едином каталоге.</p></div><button className="primary" type="button" onClick={onNew}>+ Новое заведение</button></div>
      <div className="table-wrap"><table aria-label="Заведения Места"><thead><tr><th scope="col" style={{ color: "var(--muted)" }}>Заведение</th><th scope="col" style={{ color: "var(--muted)" }}>Город</th><th scope="col" style={{ color: "var(--muted)" }}>Категория</th><th scope="col" style={{ color: "var(--muted)" }}>Статус</th><th scope="col" aria-label="Действия" /></tr></thead><tbody id="venues-table">
        {venues.length ? venues.map((item) => <tr key={item.id} data-venue-id={item.id}><th scope="row" style={{ color: "inherit", background: "transparent", fontSize: "11px", fontWeight: "normal", letterSpacing: "normal", textTransform: "none" }}><strong style={{ display: "block", marginBottom: "4px", fontSize: "12px" }}>{item.title}</strong><small style={{ color: "var(--muted)" }}>{item.address || item.description}</small></th><td>{item.city}</td><td>{item.category}</td><td><span className={`status-pill ${item.status}`}>{item.status}</span></td><td><div className="table-actions"><button type="button" onClick={() => onEdit(item)}>Изменить</button><button className="danger" type="button" onClick={() => onDelete(item)}>Удалить</button></div></td></tr>) : <tr><td colSpan={5}><div className="empty-state">Постоянных карточек пока нет</div></td></tr>}
      </tbody></table></div>
    </section>
  );
}

function MerchantsView({ workspace, onNew, onEdit, onStatus, onReset }: { workspace: AdminRouteWorkspace; onNew: () => void; onEdit: (merchant: MerchantAccount) => void; onStatus: (merchant: MerchantAccount) => void; onReset: (merchant: MerchantAccount) => void }) {
  if (workspace.merchants.status === "unavailable") {
    return (
      <section className="admin-view is-active" data-view-panel="merchants" aria-labelledby="merchants-title">
        <div className="view-heading"><div><p className="admin-eyebrow">Доступ владельцев</p><h2 id="merchants-title">Рестораторы</h2><p>Создавайте отдельные аккаунты и назначайте только те заведения, которыми владелец может управлять. Пароль показывается администратору один раз.</p></div><button className="primary" type="button" onClick={onNew}>+ Добавить ресторатора</button></div>
        <div className="merchant-summary" id="merchant-summary" aria-live="polite" />
        <div className="table-wrap merchant-table-wrap"><table aria-label="Рестораторы и назначенные заведения"><thead><tr><th scope="col" style={{ color: "var(--muted)" }}>Ресторатор</th><th scope="col" style={{ color: "var(--muted)" }}>Доступ</th><th scope="col" style={{ color: "var(--muted)" }}>Заведения</th><th scope="col" style={{ color: "var(--muted)" }}>Статус</th><th scope="col" style={{ color: "var(--muted)" }}>Последний вход</th><th scope="col" aria-label="Действия" /></tr></thead><tbody id="merchants-table"><tr><td colSpan={6}><div className="empty-state" role="alert"><b>Не удалось загрузить рестораторов</b><span>{workspace.merchants.error.message}</span></div></td></tr></tbody></table></div>
      </section>
    );
  }
  const merchants = workspace.merchants.items;
  const active = merchants.filter((merchant) => merchant.status !== "suspended").length;
  const assigned = new Set(merchants.flatMap((merchant) => merchant.memberships.map((membership) => membership.venueId))).size;
  return (
    <section className="admin-view is-active" data-view-panel="merchants" aria-labelledby="merchants-title">
      <div className="view-heading"><div><p className="admin-eyebrow">Доступ владельцев</p><h2 id="merchants-title">Рестораторы</h2><p>Создавайте отдельные аккаунты и назначайте только те заведения, которыми владелец может управлять. Пароль показывается администратору один раз.</p></div><button className="primary" type="button" onClick={onNew}>+ Добавить ресторатора</button></div>
      <div className="merchant-summary" id="merchant-summary" aria-live="polite"><span><b>{merchants.length}</b> аккаунтов</span><span><b>{active}</b> с активным доступом</span><span><b>{assigned}</b> заведений назначено</span></div>
      <div className="table-wrap merchant-table-wrap"><table aria-label="Рестораторы и назначенные заведения"><thead><tr><th scope="col" style={{ color: "var(--muted)" }}>Ресторатор</th><th scope="col" style={{ color: "var(--muted)" }}>Доступ</th><th scope="col" style={{ color: "var(--muted)" }}>Заведения</th><th scope="col" style={{ color: "var(--muted)" }}>Статус</th><th scope="col" style={{ color: "var(--muted)" }}>Последний вход</th><th scope="col" aria-label="Действия" /></tr></thead><tbody id="merchants-table">
        {merchants.length ? merchants.map((merchant) => {
          const venues = merchantVenues(merchant, workspace.overview.venues);
          const email = merchantEmail(merchant.email) || "Внутренний аккаунт";
          const statusLabel = merchant.status === "suspended" ? "Приостановлен" : merchant.status === "invited" ? "Приглашён" : "Активен";
          return <tr key={merchant.id} data-merchant-id={merchant.id}><th scope="row" style={{ color: "inherit", background: "transparent", fontSize: "11px", fontWeight: "normal", letterSpacing: "normal", textTransform: "none" }}><div className="merchant-person"><i aria-hidden="true">{merchant.displayName.slice(0, 1).toUpperCase()}</i><span><strong style={{ display: "block", marginBottom: "4px", fontSize: "12px" }}>{merchant.displayName}</strong><small style={{ color: "var(--muted)" }}>Создан {formatAdminDate(merchant.createdAt)}</small></span></div></th><td><strong className="merchant-login">@{merchant.username}</strong><small>{email}</small><small className="merchant-role">{membershipRoleLabels[merchantRole(merchant)]}</small></td><td>{venues.length ? <div className="merchant-venue-list">{venues.map((venue) => <span title={venue.city} key={venue.id}>{venue.title}</span>)}</div> : <span className="merchant-no-venues">Не назначены</span>}</td><td><span className={`status-pill merchant-status ${merchant.status}`}>{statusLabel}</span></td><td>{formatAdminDate(merchant.lastLoginAt)}</td><td><div className="table-actions merchant-actions"><button type="button" onClick={() => onEdit(merchant)}>Назначения</button><button type="button" onClick={() => onStatus(merchant)}>{merchant.status === "suspended" ? "Активировать" : "Приостановить"}</button><button type="button" onClick={() => onReset(merchant)}>Новый пароль</button></div></td></tr>;
        }) : <tr><td colSpan={6}><div className="empty-state"><b>Рестораторов пока нет</b><span>Создайте первый аккаунт и назначьте ему заведение.</span></div></td></tr>}
      </tbody></table></div>
    </section>
  );
}

function VenueEditor({ initial, fetcher, busy, onClose }: { initial: Venue | undefined; fetcher: FetcherWithComponents<AdminActionData>; busy: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => venueDraft(initial));
  useEffect(() => { showDialog(dialogRef); }, []);
  const set = (key: keyof VenueDraft) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const features = listInput(draft.features);
  if (draft.editorChoice) features.unshift("Выбор Места");
  const photos = listInput(draft.photos);
  const errorMessage = fetcher.data && !fetcher.data.ok && fetcher.data.intent.startsWith("venue.")
    ? fetcher.data.message
    : "";
  return (
    <dialog className="venue-editor" id="venue-editor" aria-labelledby="venue-editor-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button className="dialog-close" type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>×</button>
      <fetcher.Form method="post" action="/admin" aria-busy={busy} inert={busy ? true : undefined}>
        <input name="intent" type="hidden" value={draft.id ? "venue.update" : "venue.create"} />
        <input name="id" type="hidden" value={draft.id} />
        {features.map((item, index) => <input name="features" type="hidden" value={item} key={`${item}-${index}`} />)}
        {photos.map((item, index) => <input name="photos" type="hidden" value={item} key={`${item}-${index}`} />)}
        <div className="editor-heading"><p className="admin-eyebrow">Карточка каталога</p><h2 id="venue-editor-title">{draft.id ? "Редактировать заведение" : "Новое заведение"}</h2></div>
        <div className="editor-grid">
          <label>Название<input name="title" required value={draft.title} onChange={set("title")} /></label><label>Slug<input name="slug" placeholder="создастся автоматически" value={draft.slug} onChange={set("slug")} /></label>
          <label>Город<select name="city" required value={draft.city} onChange={set("city")}><option>Симферополь</option><option>Ялта</option><option>Севастополь</option><option>Алушта</option><option>Евпатория</option><option>Феодосия</option></select></label>
          <label>Категория<input name="category" placeholder="Ресторан" required value={draft.category} onChange={set("category")} /></label><label>Кухня<input name="cuisine" placeholder="Европейская" value={draft.cuisine} onChange={set("cuisine")} /></label><label>Средний чек<input name="averageCheck" placeholder="от 1 200 ₽" value={draft.averageCheck} onChange={set("averageCheck")} /></label>
          <label className="wide">Адрес<input name="address" value={draft.address} onChange={set("address")} /></label><label>Телефон<input name="phone" value={draft.phone} onChange={set("phone")} /></label><label>Сайт<input name="website" type="url" value={draft.website} onChange={set("website")} /></label><label>Режим работы<input name="hours" value={draft.hours} onChange={set("hours")} /></label>
          <label>Источник<select name="source" value={draft.source} onChange={set("source")}><option value="editorial">Редакция</option><option value="community">Пользователь</option><option value="merchant">Владелец</option></select></label><label>Статус<select name="status" value={draft.status} onChange={set("status")}><option value="published">Опубликовано</option><option value="draft">Черновик</option><option value="archived">Архив</option></select></label>
          <label className="wide">Описание<textarea name="description" rows={5} required value={draft.description} onChange={set("description")} /></label>
          <label>Отметка редакции<select value={draft.editorChoice ? "1" : ""} onChange={(event) => { const editorChoice = event.target.value === "1"; setDraft((current) => ({ ...current, editorChoice })); }}><option value="">Без отметки</option><option value="1">Выбор Места</option></select></label>
          <label className="wide">Особенности через запятую<input placeholder="Wi-Fi, Парковка, Можно с питомцами" value={draft.features} onChange={set("features")} /></label>
          <label className="wide">Ссылки на фотографии, по одной в строке<textarea rows={4} value={draft.photos} onChange={set("photos")} /></label>
        </div>
        {errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null}
        <div className="editor-actions"><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить карточку"}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function MerchantEditor({ merchant, venues, fetcher, busy, onClose }: { merchant: MerchantAccount | undefined; venues: readonly Venue[]; fetcher: FetcherWithComponents<AdminActionData>; busy: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { showDialog(dialogRef); }, []);
  const selected = new Set(merchant?.memberships.map((membership) => membership.venueId) ?? []);
  const sortedVenues = [...venues].sort((left, right) => `${left.city} ${left.title}`.localeCompare(`${right.city} ${right.title}`, "ru"));
  const errorMessage = fetcher.data && !fetcher.data.ok && fetcher.data.intent.startsWith("merchant.")
    ? fetcher.data.message
    : "";
  return (
    <dialog className="venue-editor merchant-editor" id="merchant-editor" aria-labelledby="merchant-editor-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button className="dialog-close" type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>×</button>
      <fetcher.Form method="post" action="/admin" aria-busy={busy} inert={busy ? true : undefined}>
        <input name="intent" type="hidden" value={merchant ? "merchant.update" : "merchant.create"} />
        <input name="userId" type="hidden" value={merchant?.id ?? ""} />
        <div className="editor-heading"><p className="admin-eyebrow">Аккаунт владельца</p><h2 id="merchant-editor-title">{merchant ? `Доступ: ${merchant.displayName}` : "Новый ресторатор"}</h2><p>{merchant ? "Измените имя владельца и список заведений, доступных в кабинете ресторатора." : "Укажите данные для входа и выберите заведения, доступные владельцу."}</p></div>
        <div className="merchant-form-grid">
          <label>Имя ресторатора<input name="displayName" autoComplete="name" placeholder="Например, Рики" required defaultValue={merchant?.displayName ?? ""} /></label>
          <label>Логин<input name="username" autoComplete="off" placeholder="riki" pattern={"[A-Za-z0-9._\\-]{3,48}"} title="От 3 до 48 латинских букв, цифр, точек, дефисов или подчёркиваний" required={!merchant} readOnly={Boolean(merchant)} defaultValue={merchant?.username ?? ""} /></label>
          <label className="wide">E-mail <small>необязательно</small><input name="email" type="email" autoComplete="off" placeholder="owner@example.ru" readOnly={Boolean(merchant)} defaultValue={merchant ? merchantEmail(merchant.email) : ""} /></label>
          {!merchant ? <label className="wide">Временный пароль<input name="password" type="password" autoComplete="new-password" minLength={10} placeholder="Оставьте пустым, чтобы создать автоматически" /><small>Не менее 10 символов. Если поле пустое, безопасный пароль создаст сервер.</small></label> : null}
          <label className="wide">Роль в кабинете<select name="membershipRole" required defaultValue={merchant ? merchantRole(merchant) : "owner"}><option value="owner">Владелец — полный доступ</option><option value="manager">Управляющий — полный рабочий доступ</option><option value="content_editor">Редактор — карточка, меню и акции</option><option value="analyst">Аналитик — отзывы и статистика</option></select><small>Роль применяется ко всем выбранным заведениям.</small></label>
          <fieldset className="venue-assignment wide"><legend>Доступные заведения</legend><p>Ресторатор увидит в своём кабинете только выбранные карточки.</p><div className="venue-checkboxes">
            {sortedVenues.length ? sortedVenues.map((venue) => <label className="venue-option" key={venue.id}><input type="checkbox" name="venueIds" value={venue.id} defaultChecked={selected.has(venue.id)} /><span><b>{venue.title}</b><small>{venue.city} · {venue.category}{venue.status !== "published" ? ` · ${venue.status}` : ""}</small></span></label>) : <div className="empty-state">Сначала добавьте хотя бы одно заведение в постоянный каталог.</div>}
          </div></fieldset>
        </div>
        {errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null}
        <div className="editor-actions"><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" type="submit" disabled={busy}>{busy ? "Сохраняем…" : merchant ? "Сохранить доступ" : "Создать аккаунт"}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function ConfirmDialog({ state, fetcher, busy, onClose }: { state: ConfirmState; fetcher: FetcherWithComponents<AdminActionData>; busy: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { showDialog(dialogRef); }, []);
  const { title, copy, intent, submitLabel } = (() => {
    if (state.kind === "moderation") {
      return {
        title: state.decision === "approve" ? `Одобрить «${state.title}»?` : `Отклонить «${state.title}»?`,
        copy: state.target === "submission" && state.decision === "approve" ? "После подтверждения будет создана опубликованная карточка." : "Решение сохранится в истории модерации.",
        intent: `${state.target}.${state.decision}`,
        submitLabel: state.decision === "approve" ? (state.target === "review" ? "Опубликовать" : "Одобрить") : "Отклонить",
      };
    }
    if (state.kind === "venue.delete") return { title: `Удалить «${state.venue.title}»?`, copy: "Карточка будет удалена без возможности восстановления.", intent: "venue.delete", submitLabel: "Удалить" };
    if (state.kind === "merchant.status") {
      const suspending = state.status === "suspended";
      return {
        title: `${suspending ? "Приостановить" : "Активировать"} доступ для «${state.merchant.displayName}»?`,
        copy: suspending ? "Ресторатор потеряет доступ к назначенным заведениям до повторной активации." : "Ресторатор снова получит доступ к назначенным заведениям.",
        intent: "merchant.status",
        submitLabel: suspending ? "Приостановить" : "Активировать",
      };
    }
    return { title: `Создать новый пароль для «${state.merchant.displayName}»?`, copy: "Старый пароль перестанет работать. Новый пароль будет показан только один раз.", intent: "merchant.password.reset", submitLabel: "Создать пароль" };
  })();
  const dangerous = state.kind === "venue.delete" || state.kind === "merchant.password.reset" || (state.kind === "merchant.status" && state.status === "suspended") || (state.kind === "moderation" && state.decision === "reject");
  const errorMessage = fetcher.data && !fetcher.data.ok && fetcher.data.intent === intent
    ? fetcher.data.message
    : "";
  return (
    <dialog className="credentials-dialog" id="admin-confirm" aria-labelledby="admin-confirm-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <fetcher.Form className="credentials-content" method="post" action="/admin" aria-busy={busy} inert={busy ? true : undefined}>
        <input name="intent" type="hidden" value={intent} />
        {state.kind === "moderation" ? <input name="id" type="hidden" value={state.id} /> : null}
        {state.kind === "venue.delete" ? <input name="id" type="hidden" value={state.venue.id} /> : null}
        {state.kind === "merchant.status" ? <><input name="userId" type="hidden" value={state.merchant.id} /><input name="status" type="hidden" value={state.status} /></> : null}
        {state.kind === "merchant.password.reset" ? <><input name="userId" type="hidden" value={state.merchant.id} /><input name="displayName" type="hidden" value={state.merchant.displayName} /><input name="email" type="hidden" value={merchantEmail(state.merchant.email)} /></> : null}
        <p className="admin-eyebrow">Подтверждение</p><h2 id="admin-confirm-title">{title}</h2><p>{copy}</p>
        {state.kind === "moderation" && state.decision === "reject" ? <label>Причина отказа<textarea name="note" rows={3} /></label> : null}
        {errorMessage ? <p className="login-error" role="alert">{errorMessage}</p> : null}
        <div className="credentials-actions"><button type="button" disabled={busy} onClick={onClose}>Отмена</button><button className={dangerous ? "danger" : "primary"} type="submit" disabled={busy}>{busy ? "Подождите…" : submitLabel}</button></div>
      </fetcher.Form>
    </dialog>
  );
}

function CredentialsDialog({ credentials, onClose, onCopied }: { credentials: CredentialDisplay; onClose: () => void; onCopied: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { showDialog(dialogRef); }, []);
  async function copyCredentials() {
    const text = ["Кабинет ресторатора «Место»", `Имя: ${credentials.name}`, `Логин: ${credentials.login ?? "—"}`, `E-mail: ${credentials.email || "Не указан"}`, `Временный пароль: ${credentials.password}`, `Войти: ${window.location.origin}/merchant`].join("\n");
    await navigator.clipboard.writeText(text);
    onCopied();
  }
  return (
    <dialog className="credentials-dialog" id="merchant-credentials" aria-labelledby="merchant-credentials-title" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <button className="dialog-close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
      <div className="credentials-content"><div className="credentials-icon" aria-hidden="true">✓</div><p className="admin-eyebrow">Доступ создан</p><h2 id="merchant-credentials-title">Передайте данные ресторатору</h2><p>Пароль больше не будет показан в админ-панели. Скопируйте данные сейчас и передайте их владельцу безопасным способом.</p><dl className="credential-list"><div><dt>Имя</dt><dd>{credentials.name}</dd></div><div><dt>Логин</dt><dd>{credentials.login ?? "—"}</dd></div><div><dt>E-mail</dt><dd>{credentials.email || "Не указан"}</dd></div><div><dt>Временный пароль</dt><dd>{credentials.password}</dd></div></dl><div className="credentials-actions"><button type="button" onClick={() => { void copyCredentials().catch(() => onCopied()); }}>Скопировать данные</button><button className="primary" type="button" onClick={onClose}>Готово</button></div></div>
    </dialog>
  );
}

export function AdminWorkspace({ workspace, activeView, routeActionData }: AdminWorkspaceProps) {
  const fetcher = useFetcher<AdminActionData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [venueEditor, setVenueEditor] = useState<Venue | "new" | null>(null);
  const [merchantEditor, setMerchantEditor] = useState<MerchantAccount | "new" | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [credentials, setCredentials] = useState<CredentialDisplay | null>(null);
  const [toast, setToast] = useState("");
  const lastResult = useRef<AdminActionData | undefined>(undefined);
  const busy = fetcher.state !== "idle";
  const dashboard = workspace.overview;
  const merchantError = workspace.merchants.status === "unavailable"
    ? workspace.merchants.error.message
    : "";

  const pendingCount = dashboard.stats.pendingVenues + dashboard.stats.pendingReviews;
  const currentCredentialContext = useMemo(() => {
    if (!fetcher.data?.credentials) return null;
    const merchantItems = workspace.merchants.status === "ready" ? workspace.merchants.items : [];
    const login = fetcher.data.credentials.login;
    const merchant = login
      ? merchantItems.find((item) => item.username === login)
      : confirm?.kind === "merchant.password.reset"
        ? confirm.merchant
        : merchantItems.find((item) => item.displayName === fetcher.data?.credentialContext?.name);
    return {
      ...fetcher.data.credentials,
      name: fetcher.data.credentialContext?.name || merchant?.displayName || "Ресторатор",
      email: fetcher.data.credentialContext?.email || (merchant ? merchantEmail(merchant.email) : ""),
    };
  }, [confirm, fetcher.data, workspace.merchants]);

  /* eslint-disable react-hooks/set-state-in-effect -- fetcher completion synchronizes dialogs and notifications with an external route action. */
  useEffect(() => {
    const result = fetcher.data;
    if (!result || result === lastResult.current) return;
    lastResult.current = result;
    setToast(result.message);
    if (!result.ok) return;
    if (result.intent.startsWith("venue.")) setVenueEditor(null);
    if (result.intent === "merchant.create" || result.intent === "merchant.update") setMerchantEditor(null);
    setConfirm(null);
    if (currentCredentialContext) setCredentials(currentCredentialContext);
  }, [currentCredentialContext, fetcher.data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function go(view: AdminView) {
    void navigate(`/admin/${view}`);
  }

  function openConfirm(state: ConfirmState) {
    setConfirm(state);
  }

  return (
    <>
      <div className="admin-shell" id="admin-shell" data-react-route="admin" data-admin-state="workspace">
        <aside className="admin-sidebar"><a className="admin-brand admin-brand--light" href="/"><span>Место</span><i>✦</i></a><nav aria-label="Разделы админ-панели">
          <button className={activeView === "overview" ? "is-active" : ""} type="button" data-admin-view="overview" aria-current={activeView === "overview" ? "page" : undefined} onClick={() => go("overview")}><span>⌂</span>Обзор</button>
          <button className={activeView === "submissions" ? "is-active" : ""} type="button" data-admin-view="submissions" aria-current={activeView === "submissions" ? "page" : undefined} onClick={() => go("submissions")}><span>◎</span>Модерация <b id="pending-badge">{pendingCount}</b></button>
          <button className={activeView === "venues" ? "is-active" : ""} type="button" data-admin-view="venues" aria-current={activeView === "venues" ? "page" : undefined} onClick={() => go("venues")}><span>◇</span>Заведения</button>
          <button className={activeView === "merchants" ? "is-active" : ""} type="button" data-admin-view="merchants" aria-current={activeView === "merchants" ? "page" : undefined} onClick={() => go("merchants")}><span>♙</span>Рестораторы</button>
          <button className={activeView === "reviews" ? "is-active" : ""} type="button" data-admin-view="reviews" aria-current={activeView === "reviews" ? "page" : undefined} onClick={() => go("reviews")}><span>☆</span>Отзывы</button>
        </nav><button
          className="sidebar-logout"
          type="button"
          disabled={busy}
          onClick={() => { void fetcher.submit({ intent: "admin.logout" }, { method: "post", action: "/admin" }); }}
        >Выйти</button></aside>
        <section className="admin-workspace"><header className="admin-topbar"><div><p className="admin-eyebrow">Редакция «Места»</p><h1 id="admin-view-title">{viewTitles[activeView]}</h1></div><div className="topbar-actions"><a href="/" target="_blank" rel="noreferrer">Открыть сайт</a><button type="button" disabled={revalidator.state !== "idle"} onClick={() => { void revalidator.revalidate(); }}>{revalidator.state === "idle" ? "Обновить" : "Обновляем…"}</button><button className="primary" type="button" onClick={() => setVenueEditor("new")}>+ Добавить заведение</button><fetcher.Form method="post" action="/admin" style={{ display: "contents" }}><input name="intent" type="hidden" value="admin.logout" /><button className="admin-mobile-logout" type="submit" disabled={busy}>Выйти</button></fetcher.Form></div></header>
          {!dashboard.databaseConfigured ? <div className="setup-alert" id="setup-alert"><b>База данных ещё не подключена</b><span>Выполните <code>supabase/schema.sql</code> и добавьте переменные Supabase в Vercel. Интерфейс уже готов.</span></div> : null}
          {activeView === "overview" ? <OverviewView dashboard={dashboard} onView={go} /> : null}
          {activeView === "submissions" ? <SubmissionsView items={dashboard.submissions} onModerate={(item, decision) => openConfirm({ kind: "moderation", target: "submission", decision, id: item.id, title: item.title })} /> : null}
          {activeView === "reviews" ? <ReviewsView items={dashboard.reviews} onModerate={(item, decision) => openConfirm({ kind: "moderation", target: "review", decision, id: item.id, title: item.venueTitle })} /> : null}
          {activeView === "venues" ? <VenuesView venues={dashboard.venues} onNew={() => setVenueEditor("new")} onEdit={setVenueEditor} onDelete={(venue) => openConfirm({ kind: "venue.delete", venue })} /> : null}
          {activeView === "merchants" ? <MerchantsView workspace={workspace} onNew={() => setMerchantEditor("new")} onEdit={setMerchantEditor} onStatus={(merchant) => openConfirm({ kind: "merchant.status", merchant, status: merchant.status === "suspended" ? "active" : "suspended" })} onReset={(merchant) => openConfirm({ kind: "merchant.password.reset", merchant })} /> : null}
        </section>
      </div>
      {venueEditor ? <VenueEditor initial={venueEditor === "new" ? undefined : venueEditor} fetcher={fetcher} busy={busy} onClose={() => { if (!busy) setVenueEditor(null); }} /> : null}
      {merchantEditor ? <MerchantEditor merchant={merchantEditor === "new" ? undefined : merchantEditor} venues={dashboard.venues} fetcher={fetcher} busy={busy} onClose={() => { if (!busy) setMerchantEditor(null); }} /> : null}
      {confirm ? <ConfirmDialog state={confirm} fetcher={fetcher} busy={busy} onClose={() => { if (!busy) setConfirm(null); }} /> : null}
      {credentials ? <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} onCopied={() => setToast("Данные для входа скопированы")} /> : null}
      <div className={`admin-toast${toast || routeActionData?.message || merchantError ? " is-visible" : ""}`} role="status" aria-live="polite">{toast || routeActionData?.message || merchantError}</div>
    </>
  );
}
