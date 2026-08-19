# Baseline HTTP-контрактов Mesto

> **Исторический checkpoint.** Это characterization до React migration, а не описание текущего API и не release-status документ. Актуальное состояние релизного кандидата и ссылки на superseding contracts находятся в [`PHASE12_CUTOVER.md`](./PHASE12_CUTOVER.md).

Дата: 5 августа 2026 года

Статус: characterization перед React migration

Все пути ниже продолжают обслуживаться существующим `api/router.js`. React Router не должен перехватывать `/api/*` или OAuth callbacks.

## Общая семантика

- Неизвестный route возвращает 404.
- Неподдержанный HTTP method возвращает 405 и `Allow`.
- JSON body читается через `readJson`, но pre-parsed `req.body` сейчас обходит byte limit.
- Текущий response helper всегда выставляет `Cache-Control: no-store, max-age=0`, даже если handler задал public policy. Это подтверждённый defect, а не желаемый contract.
- Upstream ошибки имеют несогласованные payload shapes и должны нормализоваться только в новом typed adapter, не в leaf UI.

## Public и user endpoints

| Method | Path | Auth | Baseline result |
| --- | --- | --- | --- |
| GET | `/api/venues` | public | Filtered/paginated `{count, found, skip, nextSkip, items, databaseConfigured}`; без DB возвращает пустой 200 |
| GET | `/api/venue-content` | public | `{menu, promotions}` по UUID `venueId`; published status сейчас не проверяется |
| GET | `/api/auth/providers` | public | `{email, google, yandex, vk}` |
| POST | `/api/auth/login` | public | Ставит `mesto_session`, возвращает authenticated user |
| POST | `/api/auth/register` | public | Создаёт customer, ставит `mesto_session` |
| POST | `/api/auth/logout` | public | Очищает `mesto_session` |
| GET | `/api/auth/oauth` | public | Redirect к VK/Yandex/Google; callback остаётся server route |
| GET | `/api/auth/oauth-vk-callback` | signed OAuth transaction | Проверяет state/PKCE/device_id, ставит user cookie, redirect |
| GET | `/api/auth/yandex/callback` | signed OAuth transaction | Проверяет state/PKCE, ставит user cookie, redirect |
| POST | `/api/auth/oauth-session` | provider token | Проверяет token через Supabase, ставит user cookie |
| GET | `/api/auth/session` | user cookie | `{authenticated, user, favorites}` либо 401 |
| POST | `/api/auth/password` | user cookie | Меняет password/session version |
| POST | `/api/submissions` | active user | Создаёт venue submission |
| POST | `/api/reviews` | active user | Создаёт moderated review |
| POST | `/api/uploads` | active user | Принимает JPEG/PNG/WebP Data URL до 6 MiB raw |
| GET/POST/DELETE | `/api/favorites` | active user | Читает, добавляет и удаляет favorite snapshot |

`requireUser` принимает active `customer`, `merchant` или `admin`, затем повторно сверяет profile status, role и session version через Supabase.

## Merchant endpoints

Требуются user cookie, role `merchant`, venue membership и permission для мутаций.

| Method | Path | Baseline result |
| --- | --- | --- |
| GET | `/api/merchant/dashboard` | `{user, venues, memberships, menu, promotions, reviews, stats}` |
| PATCH | `/api/merchant/venue` | Изменяет разрешённые venue fields |
| POST/PATCH/DELETE | `/api/merchant/menu` | Создаёт, изменяет или удаляет menu item |
| POST/PATCH/DELETE | `/api/merchant/promotions` | Создаёт, изменяет или удаляет promotion |

Known defect: dashboard возвращает reviews всем memberships, включая `content_editor`, хотя permission `reviews` отсутствует.

## Admin endpoints

Используется отдельная stateless cookie `mesto_admin`, подписанная `MESTO_ADMIN_SESSION_SECRET`.

| Method | Path | Baseline result |
| --- | --- | --- |
| POST | `/api/admin/login` | Проверяет env credentials и ставит admin cookie |
| GET | `/api/admin/session` | 200 либо 401 |
| POST | `/api/admin/logout` | Очищает admin cookie |
| GET | `/api/admin/dashboard` | `{stats, venues, submissions, reviews, databaseConfigured}` |
| PATCH | `/api/admin/submissions` | Approve/reject submission |
| PATCH | `/api/admin/reviews` | Approve/reject review |
| GET/POST/PATCH/DELETE | `/api/admin/venues` | Venue list и CRUD |
| GET/POST/PATCH | `/api/admin/merchants` | Merchant list/create/status/memberships/password reset |

Known defect: `PATCH /api/admin/venues` без валидного id может перейти в create path и вернуть 201.

## Cache classification после исправления helper

| Класс ответа | Требуемая политика |
| --- | --- |
| Успешный anonymous browse/catalog/card | Явный bounded public `s-maxage` и `stale-while-revalidate` |
| Свободный search/high-cardinality query | Короткий bounded TTL либо no-store после измерения |
| Empty result при ненастроенной DB | private/no-store, не кешировать как production truth |
| Error, 401, 403, 404 для private resource, 429, 5xx | private/no-store |
| Session, favorites, submissions, reviews, uploads | private/no-store |
| Merchant/admin | private/no-store |

Исправление `lib/http.js` не должно делать все GET public по умолчанию. Безопасный default остаётся private/no-store; public policy задаётся только конкретным anonymous handler.

## Обязательные compatibility gaps

Ниже сохранён migration-era backlog. Он не должен использоваться как текущий список дефектов: get-by-slug, cache/rate-limit и media contracts развивались в последующих фазах; актуальные незакрытые gates перечисляет Phase 12.

- Добавить backward-compatible get-by-slug API или расширение `/api/venues`, потому что текущий ответ не содержит slug и не поддерживает `VenueCatalog.getBySlug`.
- Сохранить `skip/nextSkip` до доказанного перехода legacy UI на cursor.
- Разделить unauthenticated 401 и upstream unavailable 503.
- Стандартизировать `Retry-After` для всех rate-limited endpoints.
- Не удалять exact count до измерения и отдельного решения по видимому `N из total`.
- Любая runtime schema в React adapter должна принимать текущий baseline contract и выдавать конечный набор application errors.
## Superseding media API contract — 11 августа 2026 года

Исторический `POST /api/uploads` Data URL contract ниже больше не маршрутизируется. Текущий authenticated, same-origin и rate-limited flow:

| Method | Path | Result |
| --- | --- | --- |
| POST | `/api/uploads/sign` | `{mediaId, uploadUrl, expiresAt, maxBytes}` для private one-time staging path |
| PUT | returned Supabase signed URL | Browser отправляет исходные bytes напрямую без cookies/service-role |
| POST | `/api/uploads/finalize` | Service-role re-download, authoritative validation, private WebP derivatives |
| POST | `/api/uploads/release` | Compensating cleanup только собственных unattached receipts |
| POST | `/api/submissions` | Принимает `mediaIds` (до 6), а не `photos`; DB RPC атомарно создаёт submission и attachment |

До approval публичного media URL не существует. `PATCH /api/admin/submissions` публикует UUID-versioned derivatives и затем фиксирует venue; rejection удаляет private media.

For an approval, `PATCH /api/admin/submissions` returns `{result, media}`. `media` is an array of public-only manifests with `id` and `thumb`/`card`/`hero` `{url,width,height,bytes,contentType}`. A rejection returns `media: []`.

`DELETE /api/admin/venues` atomically tombstones media and deletes the venue in Postgres, then removes all manifest objects and media receipts. It returns `{ok:true}` on complete cleanup or `{ok:true,mediaCleanupPending:true}` when the venue deletion committed but provider cleanup must be retried.
