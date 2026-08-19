# Phase 3: Core modules and HTTP adapters

Дата проверки: 6 августа 2026 года

## Граница этапа

Phase 3 добавляет прикладные интерфейсы, production HTTP adapters, runtime validation и stateful test fakes. Пользовательские маршруты не переключались: `/`, `/help`, `/merchant` и `/admin` по-прежнему обслуживает legacy UI, а единственным React-маршрутом остаётся `/__react/health`.

В коде действует одна транспортная граница:

- `app/adapters/http.ts` — единственное место, которое вызывает `fetch`;
- точные `/api/*` URL находятся только в `app/adapters/**`;
- `app/modules/**` выражает пользовательские намерения и не знает HTTP endpoints или wire DTO;
- `app/adapters/wire-schemas.ts` преобразует проверенные Zod-схемами backend DTO в domain values;
- `app/lib/**` содержит общие типы, ошибки и backend-compatible normalization.

Статический architecture test рекурсивно проверяет весь `app/**`: `fetch` разрешён только в общем HTTP seam, а `/api` literals — только в adapters.

## Модули

| Module | Public intent surface | Production adapter | Test fake |
| --- | --- | --- | --- |
| Session | restore, providers, password login, registration, logout, password change, OAuth start/token completion | `session-http.ts` | `FakeSession` with per-user session/favorites and OAuth token state |
| VenueCatalog | normalized search/pagination and UUID content loading | `venue-catalog-http.ts` | `FakeVenueCatalog` with filtering, pagination, aborts and empty content |
| Favorites | list, save and remove normalized favorite snapshots | `favorites-http.ts` | `FakeFavorites` with isolated mutable state and rollback-safe failures |
| Submissions | submit venue with validated image bytes; submit review | `submissions-http.ts` | `FakeSubmissions` with normalized successful receipts/history |
| MerchantWorkspace | one workspace load plus tagged commands for venue, menu and promotions | `merchant-workspace-http.ts` | `FakeMerchantWorkspace` with roles, permissions and stateful mutations |
| AdminConsole | session, deep dashboard/merchant load and tagged moderation/venue/merchant commands | `admin-console-http.ts` | `FakeAdminConsole` with partial merchant failure and moderation transitions |

`AdminConsole.load()` owns the two-call dashboard/merchant orchestration. A recoverable merchant-list failure becomes a typed `unavailable` slice while the overview remains usable; `unauthorized` and `forbidden` are propagated so a stale admin session cannot render as a partial success.

`getBySlug` is intentionally absent from `VenueCatalog`: the existing backend neither returns a public slug nor provides a published-only detail endpoint. Phase 5 must add that backend contract before the module can expose stable venue details.

## HTTP and security contract

`ApplicationError` has a finite set of kinds:

```text
validation, unauthorized, forbidden, not-found,
conflict, rate-limited, unavailable, unknown
```

The HTTP seam preserves status, backend code/message, `Retry-After` and canonical UUID `X-Request-ID` when present. Network, unreadable body, invalid JSON and invalid success schema are normalized instead of leaking raw exceptions. Centralized redaction of unsafe upstream 5xx messages remains a backend Phase 9–10 task.

Browser requests always use same-origin credentials. SSR requests derive the upstream origin from the authoritative incoming `Request`; callers cannot supply an arbitrary origin while forwarding cookies. SSR forwards only `Cookie`, `Accept-Language` and a canonical UUID `X-Request-ID`. It never forwards `Authorization`, proxy headers or arbitrary request headers. Only upstream `Set-Cookie` values are appended to the request-scoped response header sink, including multiple cookies via `Headers.getSetCookie()`.

Request paths must start under `/api` before and after URL normalization, preventing cross-origin targets and path traversal. Critical response fields use runtime schemas, including canonical UUIDs, account/role/status enums and coordinates restricted to `[]` or `[longitude, latitude]`.

## Fake parity and failure behavior

All fakes clone inputs/outputs so callers cannot mutate stored state accidentally. A controllable one-shot failure is consumed before mutation, which makes failure-isolation and rollback assertions deterministic.

Shared normalization mirrors current backend behavior for text sanitation, UUID lowercasing, catalog aliases and limits, favorites, credentials, merchant/admin enums, dates, image MIME/magic bytes and submission limits. Contract tests cover role denial, state changes, per-user isolation, failed writes, partial admin load and full-field venue creation after approved submission.

## Проверки

- `npm.cmd test`: 26/26 legacy server tests and 42/42 Vitest tests passed, 68 total.
- `npm.cmd run check`: legacy syntax, React Router type generation, strict TypeScript and ESLint passed.
- `npm.cmd run smoke`: production client/SSR build, 43-file legacy staging manifest and coexistence route smoke passed.
- `git diff --check`, new-file whitespace/EOF checks and high-signal secret scan passed.
- Independent read-only contract review found no remaining P0/P1 issues.

Visual regression was not rerun because Phase 3 adds no route, markup, style, asset or browser behavior. Existing legacy documents and Vercel routing are unchanged.

## Known constraints

- Upload followed by submission is not externally atomic. If an earlier image upload succeeds and a later upload or final submission fails, the first object may remain orphaned because the backend exposes no delete/transaction endpoint. All images are prevalidated before the first request, and no final submission request is issued after an upload failure.
- Stable venue lookup by slug remains blocked by the missing backend endpoint.
- Current backend cache, body-limit, distributed rate-limit, CSRF, correlation/logging and scale gaps remain assigned to Phases 9–10; this phase does not claim to fix them.
- No database migration or external state mutation was performed.

## Rollback

Reverting the Phase 3 commit removes only the new TypeScript modules, adapters, normalizers, fakes, contract tests and this document. Legacy UI, CommonJS API, Supabase state and Phase 2 Vercel coexistence remain unchanged.
