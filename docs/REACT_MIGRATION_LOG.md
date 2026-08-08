# Журнал миграции Mesto на React

## Git и точки восстановления

- Migration branch: `codex/react-migration`.
- Migration remote: `migration-origin` (`https://github.com/Krevetkaaaa/mesto-react-migration.git`).
- Видимость нового remote: public, создан по явному разрешению владельца 5 августа 2026 года.
- Legacy remote `origin` недоступен: GitHub возвращает HTTP 403 и сообщает, что репозиторий отключён из-за trade-controls restriction.
- Локальная исходная ветка до миграции: `codex/database-catalog`.
- Последний локальный исходный commit до чистого baseline: `c03adf8`.
- Canonical baseline commit: `ee8476473b64de946d81dc1adbcd7dc3871e4ac9`.
- Canonical baseline tag: `pre-react-migration-20260805-1916`.
- Remote verification: branch и dereferenced annotated tag указывают на `ee8476473b64de946d81dc1adbcd7dc3871e4ac9`.
- Первый root checkpoint `46bf378f97c98eb8a53f663c0fa3ec26cc0314c3` и tag `pre-react-migration-20260805-1915` сохранены как superseded backup. PowerShell добавил BOM в начало subject. Опубликованная история не переписывалась; исправление выполнено новым commit с тем же tree `1f7e1ccefa183723b21e98e1ed6ecb0b5291b89e` и новым tag.

Новый migration remote начинается с чистого root commit. Полная локальная object-база старого отключённого репозитория не публикуется: она занимает около 1 GiB и не нужна для отката миграции. Baseline содержит текущее проверенное дерево исходников, конфигурацию, схемы, документацию и архитектурные диаграммы. Локальные `work/` и `outputs/` исключены: это около 2,5 GiB исследовательских данных и сгенерированных артефактов.

## Проверки перед baseline

- `npm test`: прошло 19 из 19 server tests.
- `npm run check`: синтаксическая проверка всех перечисленных legacy и server JavaScript-файлов прошла.
- Текущая среда: Node.js 24.18.0, npm 11.16.0.
- Поиск высокосигнальных секретов в текущих кандидатах и 71 локальном commit: совпадений не найдено.
- История не содержит tracked путей `work/` или `outputs/` и blobs крупнее 10 MiB.
- Visual baseline: ещё не создан.
- E2E baseline: ещё не создан.

## Этапы

| Этап | Статус | Commit | Проверки | Ограничения и откат |
| --- | --- | --- | --- | --- |
| Baseline checkpoint | complete | `ee8476473b64de946d81dc1adbcd7dc3871e4ac9` | server tests, syntax check, secret scan и remote ref verification прошли | Откат по `pre-react-migration-20260805-1916` |
| 0. Требования и показатели | complete | `327832905fccb8daae55ab040324eecff24fae26` | local audit, API/visual contracts, asset sizes, HTTP baseline и browser request baseline | Production analytics/Supabase/Vercel metrics недоступны; Lighthouse lab-run заблокирован Windows `EPERM`; откат через revert Phase 0 commit |
| 1. Legacy safety net | complete | `63d7d8fea1d00f1a45948b6ff4e46f42ffcded7b` | server/contract, syntax, functional, axe smoke и visual regression прошли | Fixture auth/OAuth не заменяет preview E2E; Playwright CDN 403, baseline снят Chrome `151.0.7922.72`; откат через revert Phase 1 commit |
| 2. Framework foundation | complete | `88ca959b01a3d2b2710644e1648ef65dd44120f9` | React/TS/RR build, strict typecheck, ESLint, 26 server + 4 unit tests, local smoke и Vercel Preview route matrix прошли | Local `vercel build` блокируется Windows symlink `EPERM`; RR7 audit содержит RSC-only high advisory, upgrade требует совместимого Vercel preset; откат через revert Phase 2 commit |
| 3. Core modules | complete | `6cdc34c13153584f41699df1162ceec4402ab1b6` | 26 server + 42 unit tests, strict typecheck, ESLint, production build и coexistence smoke прошли | `getBySlug` ждёт published-only backend endpoint; upload workflow не может удалить orphaned object; откат через revert Phase 3 commit |
| 4. Public shell and static pages | complete | `590339d174bec83b694d8397d8b72f6e003a2f74` | SSR/DOM parity, 26 server + 57 unit, strict check, production smoke, five-viewport visual regression and Preview route matrix passed | Home client behavior remains exclusively in legacy `app.js` until Phases 5-6; rollback through revert of the Phase 4 commit |
| 5. Venue catalog | complete | `688e63f1a3f9267e892709c3338558c0a6089cad`, routing fix `5089a340fa61857b32952c69ef1436d478278f15` | 39 server + 82 unit, strict check, production smoke, Phase 4 regression, Phase 5 functional/accessibility and 19-snapshot visual matrix, Preview route matrix passed | Protected Preview cannot authenticate SSR self-fetch for a non-editorial venue; covered by controlled E2E/contracts and must be rechecked before production cutover |
| 6. Customer auth and profile | complete | `88940e6194a0bb70dfac34b0ad6754f6a8784c19`, Preview fixes `57b0c82c9526ff9470a1a8a558dc407df654c7e8`, `be6c265e93bf821289273e0358e6d922ba413c0d` | 51 server + 92 unit, strict check, production smoke, Phase 4/5 regression, Phase 6 functional/accessibility, 11-snapshot visual matrix and protected Preview route/cache matrix passed | Known frozen-palette contrast debt is deferred to an approved accessibility task; production deploy remains forbidden |
| 7. Merchant workspace | complete | `2c79e24db2930c20d57b9f09f39bd4174f06aac7`, Preview routing fixes `35abda67f17b55ec259b75e03e7df49f98b27b3b`, `e1e173772fc71ded709ee808a9a76c4dee3e6b49` | 60 server + 98 unit, strict check, production smoke, fixture contracts, Phase 4-6 regressions, Phase 7 functional/accessibility и 48-snapshot visual matrix, protected Preview route/cache matrix | Post-commit observability/idempotency deferred; production deploy remains forbidden |
| 8. Admin console | local complete; Preview blocked | `3b46732e8e5829f789b35276649165c06f3d2589` | 65 server + 107 unit, strict check, production smoke, Phase 4-7 regressions, 12 functional/fixture scenarios и 45-snapshot Visual Freeze matrix | Preview `TEAM_ACCESS_REQUIRED`; multi-store merchant update не транзакционен; strong typed/revocable admin session остаётся Phase 10 blocker; production deploy forbidden |
| 9. Backend scale | local checkpoint; production criteria blocked | `dc8c9fbb4f4cdda46c343feb7d98d65f09889377` | 86 server + 107 unit, strict check и production smoke прошли | Shared limiter/provider, CDN purge/Preview headers, representative EXPLAIN и direct media upload требуют внешнего environment |
| 10. Performance, security and accessibility | local checkpoint; production criteria blocked | `ddff8daff8d702bb6c6cebaad7e810a5e26b2d03` | 99 server + 113 unit, strict check, production smoke, public JS/client-secret gates и Phase 4-8 Chromium regressions прошли | p75 Web Vitals, contrast remediation, nonce/hash CSP, shared admin revocation, dependency audit decision и production telemetry не закрыты; Preview `TEAM_ACCESS_REQUIRED` |
| 11. Load testing | partial local checkpoint; expected SLO blocked | `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, fixes `ea542198675b03917f0aa19429dab20012a0a7a5`, `5b733153b85f07e54ef03fff83a04e96c0add924` | fail-closed loopback harness: 4 smoke profiles и mixed 25-VU baseline passed; expected 100 VU вернул 4891/4891 HTTP 200, но failed p95 `1159,35 > 1000 ms` | Burst/soak не запускались; fixture не доказывает Supabase/CDN/serverless/distributed limiter capacity |
| 12. Cutover preparation | pending | pending | pending | Merge и production deploy требуют отдельного разрешения |

### Этап 0. Требования и показатели

- Начало: `2026-08-05T19:17:04+03:00`.
- Завершение локальной части: `2026-08-05T19:50:30+03:00`.
- Branch: `codex/react-migration`.
- Commit: `327832905fccb8daae55ab040324eecff24fae26`; remote ref проверен после push.
- Проверки: route/state audit, HTTP contract audit, Visual Freeze contract, browser/toolchain decision, tracked-file size и compression audit, локальные `/` и `/help` HTTP checks, Chrome PerformanceResourceTiming baseline.
- Visual regression: не применимо к Phase 0; создание baseline выполняется в Phase 1.
- Database migrations: отсутствуют.
- Ограничения: production analytics, Supabase query timings, Vercel/CDN metrics и provider credentials недоступны; Lighthouse `13.4.1` не создал отчёт из-за Windows `EPERM` при очистке временного Chrome profile.
- Откат: `git revert <phase-0-commit>`; baseline остаётся `pre-react-migration-20260805-1916`.

### Этап 1. Legacy safety net

- Начало: `2026-08-05T19:24:46+03:00`.
- Завершение: `2026-08-05T21:39:01+03:00`.
- Branch: `codex/react-migration`.
- Commit: `63d7d8fea1d00f1a45948b6ff4e46f42ffcded7b`; remote ref проверен после push.
- Server/contract tests: `npm.cmd test`, 26/26 passed.
- Syntax: `npm.cmd run check`, exit 0.
- Browser suite: два последовательных `npm.cmd run test:e2e`, каждый exit 0, `188 passed / 115 skipped / 303 total`; skips являются viewport-gated копиями state specs.
- Functional browser coverage: public catalog/pagination/error fallback, login/register/session/logout, OAuth success/error seam, favorites success/rollback, review, submission/upload и size preflight; merchant navigation, venue/menu/promotion operations, role gates, session expiry, multi-venue persistence, forced password и delete confirmation; admin navigation, moderation, venue/merchant flows, native confirmation и one-time credential DOM scrub.
- Visual regression: 150 PNG, из них 90 canonical full-page (`18` экранов × `5` viewport) и 60 dialog/loading/error/role/empty/editor/mobile/theme states; `88 204 904` bytes total, largest file `6 203 162` bytes. Два полных прогона выполнены без snapshot update.
- Browser provenance: Playwright `1.62.1`; regional CDN download Playwright Chromium `151.0.7922.34` вернул HTTP 403, поэтому baseline снят проверенным Google Chrome `151.0.7922.72`. Exact environment/commands находятся в `e2e/README.md`.
- Accessibility: axe critical smoke для home, catalog, auth dialog, help, merchant login и admin login; serious/moderate, authenticated workspaces и полный keyboard/focus gate остаются Phase 10.
- Characterized legacy defect: HTML pattern `[A-Za-z0-9._-]{3,48}` выдаёт Chrome Unicode-v console error. Ошибка allowlisted только по точному сообщению; public registration и admin merchant creation при этом проверены до HTTP 201 и итогового UI/session state.
- Ограничения: fixture login упрощён и проверяет UI/session flow, не реальную password verification; OAuth не вызывает внешнего provider; production-like preview suite требует отдельного test Supabase project и test credentials.
- Database migrations: отсутствуют.
- Откат: `git revert 63d7d8fea1d00f1a45948b6ff4e46f42ffcded7b` удаляет только тестовый harness, зависимости и snapshots; legacy runtime не изменён.

### Этап 2. Framework foundation

- Начало: `2026-08-05T21:44:03+03:00`.
- Завершение: `2026-08-05T22:49:40+03:00`.
- Branch: `codex/react-migration`.
- Commit: `88ca959b01a3d2b2710644e1648ef65dd44120f9`; remote ref проверен после push.
- Foundation: React `19.2.8`, React Router Framework Mode `7.18.2`, Vite `8.2.0`, TypeScript `6.0.3`, Vitest `4.1.10`, Vercel preset `1.3.2`; корневой CommonJS backend сохранён, SSR bundle собирается как CJS.
- Изоляция маршрутов: единственный React route `/__react/health`; legacy `/`, `/help`, `/merchant`, `/admin`, assets, `/api/*` и OAuth callbacks не перехватываются React catch-all.
- Static staging: 43 whitelisted legacy-файла копируются атомарно в generated `.legacy-public/` и проверяются SHA-256 manifest; legacy HTML/CSS/JS не изменялись.
- Reproducibility: `npm.cmd ci` установил 419 packages из lockfile; install script `esbuild@0.28.1` разрешён exact allowlist.
- Tests: `npm.cmd test` — 26/26 server tests и 4/4 React unit tests; `npm.cmd run check` — legacy syntax, React Router type generation, strict TypeScript и flat-config ESLint прошли; `npm.cmd run smoke` — production build/serve и legacy/React isolation прошли; отдельный development smoke подтвердил `/`, `/help` и `/__react/health` на одном Vite dev server.
- Vercel: два exact builder (`@vercel/remix-builder@5.9.2` и `@vercel/node@5.9.5`) плюс явный route order нужны, потому что zero-config не собирает одновременно React Router SSR и legacy CommonJS API. Первый Preview обнаружил реальный конфликт `index.func`/`index.html`; исправленный final Preview `dpl_GspxSWrXyeP8oQtJh4ZFbUx8CwHi` имеет статус Ready.
- Preview matrix: `/` legacy 200; `/index.html` → `/` 308; `/help`, `/merchant`, `/admin` legacy 200; `/__react/health` SSR 200 с `no-store`/`noindex`; unknown React path 404; unknown API JSON 404; `/api/venues` JSON 200; Yandex callback остаётся JSON backend route; PNG asset совпал по SHA-256. Deployment protection проверен через authenticated `vercel curl`.
- Visual regression: не обновлялся и не требовался — Phase 2 не переносит legacy UI; SHA staging и Preview markers подтверждают сохранение legacy документов. Vercel Preview дописывает только свой feedback-toolbar script после исходного `index.html`, production не изменён.
- Dependency audit: 5 high и 3 moderate. High — advisory React Router RSC Mode CSRF для `7.12.0–8.2.0`; RSC в проекте не включён, но production cutover с красным audit запрещён без повторного решения в Phase 10. Исправление требует Router `8.3.0`, пока несовместимого с official Vercel preset peer range. Moderate — AJV через `@vercel/static-config`, доступного fix нет.
- Ограничения: local `vercel build` 56.3.1 и 58.7.0 на Windows доходит до React/API function outputs, затем получает `EPERM` на служебном symlink; Linux Preview build проходит. `builds` deprecated, но остаётся минимальным source-controlled coexistence seam до официальной multi-runtime поддержки. Vercel preset также печатает собственное `envFile` deprecation warning.
- Database migrations: отсутствуют.
- Откат: `git revert 88ca959b01a3d2b2710644e1648ef65dd44120f9` возвращает pre-framework static/API topology; Preview deployment удаляется отдельно при необходимости. Production deployment и aliases не менялись.

### Этап 3. Core modules

- Начало: `2026-08-05T22:54:37+03:00`.
- Завершение: `2026-08-06T00:06:00+03:00`.
- Branch: `codex/react-migration`.
- Commit: `6cdc34c13153584f41699df1162ceec4402ab1b6`; remote ref проверен после push.
- Architecture: один typed HTTP seam; точные endpoints и wire DTO локализованы в adapters; Session, VenueCatalog, Favorites, Submissions, MerchantWorkspace и AdminConsole имеют intent interfaces, production adapters и stateful controllable fakes.
- Transport security: browser `credentials: same-origin`; SSR origin выводится только из входящего `Request`; forward allowlist ограничен `Cookie`, `Accept-Language`, UUID `X-Request-ID`; response sink принимает только все значения `Set-Cookie`.
- Runtime boundary: восемь `ApplicationError` kinds, Zod validation критических DTO, strict UUID/status/role/coordinates contracts и backend-compatible input normalization.
- Tests: `npm.cmd test` — 26/26 server и 42/42 unit/contract tests; `npm.cmd run check` — legacy syntax, React Router typegen, strict TypeScript и ESLint; `npm.cmd run smoke` — production client/SSR build и Phase 2 coexistence matrix. Independent contract review: P0/P1 отсутствуют.
- Visual regression: не применимо — routes, HTML, CSS, assets и Vercel mapping не менялись.
- Database migrations: отсутствуют.
- Ограничения: `getBySlug` намеренно отсутствует до published-only backend endpoint; последовательность upload → submission может оставить orphaned Storage object, поскольку delete/transaction API отсутствует. Backend scale/security gaps остаются Phases 9–10.
- Подробный контракт: `docs/PHASE3_CORE_MODULES.md`.
- Откат: `git revert <phase-3-commit>` удаляет только TypeScript modules/adapters/fakes/tests/docs; legacy runtime, API, database и Vercel coexistence не меняются.

### Этап 4. Public shell and static pages

- Начало: `2026-08-06T00:17:00+03:00`.
- Завершение локального и Preview gate: `2026-08-06T09:26:00+03:00`.
- Branch: `codex/react-migration`.
- Commit: `590339d174bec83b694d8397d8b72f6e003a2f74`; remote ref `migration-origin/codex/react-migration` проверен после push.
- Route ownership: React Router SSR теперь обслуживает `/` и `/help`; `/merchant`, `/admin` и `/api/*` остаются legacy. `index.html` и `help.html` сохраняются как rollback/test fixtures, но удаляются из `build/client`, поэтому не затеняют SSR function.
- Client ownership: React hydration намеренно не подключена. На `/` единственным клиентским владельцем frozen DOM остаётся `app.js?v=ui-motion-2` до Phases 5-6; `/help` не загружает `app.js` и использует только синхронный theme bootstrap. Общего React/legacy mutation ownership и `dangerouslySetInnerHTML` нет.
- SEO/cache: обе страницы возвращают индексируемый SSR HTML, title, description, canonical и Open Graph до JavaScript. Public origin берётся из валидного `MESTO_PUBLIC_ORIGIN` либо из уже разобранного `Request.url`; forwarded headers не доверяются. Route policy: `public, max-age=0, s-maxage=60, stale-while-revalidate=120` и `nosniff`.
- Tests: `npm.cmd test` — 26/26 server и 57/57 unit/contract tests; `npm.cmd run check` — legacy/Phase 4 syntax, React Router typegen, strict TypeScript и ESLint; `npm.cmd run smoke` — production build и coexistence route matrix.
- Structural parity: React route views совпадают с legacy body по упорядоченным element/attribute/direct-text/landmark inventories; home содержит 1746, help — 170 элементов. Unsafe raw HTML injection запрещён тестом.
- Visual regression: `npm.cmd run test:e2e:phase4` запланировал 40 project-tests; 16 passed, 24 ожидаемо skipped по viewport gating, 0 failed. Frozen snapshots не обновлялись. Проверены `360x800`, `390x844`, `768x1024`, `1440x900`, `1920x1080`, mobile menu на `390x844`, graphite/midnight на `1440x900`.
- Browser verification: production gateway вручную проверен во встроенном браузере; home/help SSR markers, exact CSS order, theme cycle, отсутствие module hydration и console warnings/errors подтверждены. Proxy harness исправлен так, чтобы сохранять внешний `Host`; canonical после исправления указывает на пользовательский origin.
- Preview: deployment `dpl_2MqxsDNaZ1JGdK7zogFQD8eeE6Pz`, URL `https://mesto-city-guide-f2ti5t8q4-krevetkaaaas-projects.vercel.app`, статус Ready, build 14 s. Защищённая matrix проверена через authenticated `vercel curl`: `/` и `/help` SSR 200 с correct markers/canonical/OG и без hydration; merchant/admin legacy 200; `/api/venues` JSON 200; неизвестный API JSON 404; canonical aliases 308; health 200 no-store/noindex; неизвестный web route — платформенный 404 с `X-Robots-Tag: noindex`; hero PNG совпал по SHA-256.
- CDN observation: Vercel потребляет `s-maxage` и отдаёт клиенту нормализованный `Cache-Control: public, max-age=0`; `Age` и `X-Vercel-Cache: STALE` подтвердили edge caching. Это ожидаемое поведение платформы, а не потеря route policy.
- Deployment tooling: два запуска из исходного рабочего каталога зависли на Windows CLI до нормального вывода и оставили `UNKNOWN` Preview records. Clean detached worktree загрузил exact commit и дал Ready deployment; production alias не менялся.
- Database migrations: отсутствуют.
- Подробный контракт: `docs/PHASE4_PUBLIC_SHELL.md`.
- Откат: `git revert 590339d174bec83b694d8397d8b72f6e003a2f74` возвращает legacy destinations `/` и `/help`, staged HTML documents и удаляет React public routes. Данные и production deployment не меняются.

### Этап 5. Каталог и карточка заведения

- Завершение локальных и Preview-ворот: `2026-08-06T23:24:01+03:00`.
- Branch: `codex/react-migration`.
- Implementation commit: `688e63f1a3f9267e892709c3338558c0a6089cad`; Vercel dynamic-route fix: `5089a340fa61857b32952c69ef1436d478278f15`. Оба commit опубликованы в `migration-origin/codex/react-migration`.
- Route ownership: React SSR/hydration обслуживает `/catalog`, `/city/:citySlug` и `/venue/:venueSlug`. Главная остаётся под client ownership `app.js`, но её catalog/card действия ведут на стабильные React URL. `/help`, merchant/admin и API ownership не изменены.
- Данные: настроенная база является единственным источником каталога, включая корректный empty result. Фиксированная редакционная подборка из семи записей используется только при недоступной/ошибочной базе и не смешивается с production rows. Максимум 20 страниц по 50 записей ограничивает SSR request amplification.
- URL и SEO: поиск, city/category/cuisine, sort, pet, parking и page нормализуются в compact search params; reload и back/forward восстанавливают состояние. City и venue возвращают индексируемый SSR HTML, canonical/Open Graph и реальные 400/404 статусы.
- Backend: добавлен published-only `GET /api/venues/:slug`; list endpoint возвращает только сохранённый canonical slug и не генерирует его из title. Invalid slug отсекается до базы; unpublished/absent rows скрыты как 404; 429/500/503 имеют стабильные контракты без утечки upstream деталей.
- Interaction: loading, empty, error/fallback/retry, cumulative pagination, stale navigation, guest auth prompt, authenticated optimistic favorite и rollback реализованы для списка и полной карточки. List image использует lazy loading, intrinsic size и responsive `sizes`; hero карточки загружается с высоким приоритетом.
- Local tests: `npm.cmd run check` прошёл; `npm.cmd test` — 39/39 server и 82/82 unit/contract/component; `npm.cmd run smoke` — production build/coexistence passed. Полный Phase 5 Playwright: 28 passed, 52 ожидаемо skipped по viewport gating, 0 failed. Phase 4 regression: 16 passed, 24 ожидаемо skipped, 0 failed.
- Visual/accessibility: 19 новых PNG (`17 558 643` bytes) для catalog/city/venue на `360x800`, `390x844`, `768x1024`, `1440x900`, `1920x1080` и graphite/midnight catalog/venue на desktop. Meaningful updates просмотрены вручную, затем полный run выполнен без update. Light/graphite/midnight проходят serious+critical axe gate; mobile menu проверен на 390 px.
- Preview: финальный deployment `dpl_AgrQuLWgHCrAQG8vo6HbXYYCLF8A`, `READY`, URL `https://mesto-city-guide-cpos0lk65-krevetkaaaas-projects.vercel.app`. Проверены catalog 200, city document/data 200, editorial venue document/data 200, unknown city 404, malformed venue 400, unknown web/API 404, API catalog 200, home/help/merchant/admin 200 и canonical SSR content.
- Deployment defect caught by Preview: первый clean Preview показал, что custom terminal 404 подавлял generated dynamic document/data routes Vercel builder. Исправление явно восстанавливает четыре route mapping и блокируется smoke-инвариантами по порядку. Production deployment и aliases не менялись.
- Preview limitation: Vercel deployment protection возвращает 401 на внутренний SSR self-fetch неизвестного editorial slug. Поэтому protected Preview не доказывает database-backed venue detail; этот путь покрыт controlled Playwright fixture и backend/adapter contracts и должен быть повторно проверен на unprotected pre-production/cutover окружении. Production Core Web Vitals и реальная latency базы не заявляются.
- Database migrations: отсутствуют.
- Подробный контракт: `docs/PHASE5_PUBLIC_CATALOG.md`.
- Откат: `git revert 5089a340fa61857b32952c69ef1436d478278f15`, затем `git revert 688e63f1a3f9267e892709c3338558c0a6089cad`. External deployments удаляются отдельно; Supabase data не изменялись.

### Этап 6. Пользовательская авторизация и профиль

- Локальные и Preview-ворота завершены: `2026-08-07T00:47:12+03:00`.
- Branch: `codex/react-migration`; implementation commit `88940e6194a0bb70dfac34b0ad6754f6a8784c19`, Preview fixes `57b0c82c9526ff9470a1a8a558dc407df654c7e8` и `be6c265e93bf821289273e0358e6d922ba413c0d`; remote ref проверен после каждого push.
- Route ownership: React SSR/hydration обслуживает `/login`, `/register`, `/profile` и `/favorites`; серверные API повторно проверяют customer session. Merchant/admin остаются legacy.
- Security: dedicated strong user-session secret, typed audience/version claims, строгая legacy-cookie совместимость, fail-closed same-origin guard для unsafe cookie mutations, controlled 401/503 separation и private/no-store персональные responses.
- OAuth: Google fragment token очищается до exchange; Google/Yandex/VK browser flows, safe return target и callback errors покрыты deterministic fixture seam.
- Favorites: optional canonical snapshot slug сохраняет обратную совместимость; профиль, каталог, venue dialog и favorites route используют один account context и стабильный production venue key contract.
- Local tests: `npm.cmd run check`, `npm.cmd test` (51/51 server, 92/92 unit), `npm.cmd run smoke`, fixture contracts 11/11, Phase 6 Chromium 10 passed, visual matrix 9 passed, Phase 5 regression 28 passed и Phase 4 regression 16 passed.
- Visual/accessibility: 11 PNG (`3 305 586` bytes) проверены вручную и затем без update на пяти baseline viewport. Неожиданные serious/critical axe violations блокируются; известный inherited `color-contrast` debt не исправляется скрытой сменой frozen palette.
- Preview: финальный deployment `dpl_Ba2FpLUw2M9vrqr57zZd5H4atCpv`, `READY`, URL `https://mesto-city-guide-dyfe7k75c-krevetkaaaas-projects.vercel.app`, exact runtime commit `be6c265e93bf821289273e0358e6d922ba413c0d`. Через authenticated `vercel curl` проверены реальные login markers без 503 fallback, `/login` и `/register` 200 с `private, no-store`, `/profile` и `/favorites` 302 на безопасный `returnTo` с `private, no-store`, `/api/auth/session` 401 для гостя и `/api/auth/providers` 200/no-store. Deployment protection и production alias не изменялись.
- Preview defects caught and fixed: защищённый Preview блокировал внутренний SSR API self-fetch, поэтому server adapter теперь пересылает ограниченный `X-Vercel-Protection-Bypass` только exact same-origin `/api/*`; затем route redirects получили тот же private cache contract, что document/data/action responses. Browser adapter заголовок не принимает, oversized значение отклоняется тестом.
- Database migrations, production deployment и aliases отсутствуют.
- Подробный контракт: `docs/PHASE6_PUBLIC_ACCOUNT.md`.
- Откат: последовательно `git revert be6c265e93bf821289273e0358e6d922ba413c0d`, `git revert 57b0c82c9526ff9470a1a8a558dc407df654c7e8`, `git revert 88940e6194a0bb70dfac34b0ad6754f6a8784c19`; внешние secrets/cookies и Supabase data Git не восстанавливает.

### Этап 7. Кабинет ресторатора

- Локальные и Preview-ворота завершены: `2026-08-07`.
- Branch: `codex/react-migration`; implementation commit `2c79e24db2930c20d57b9f09f39bd4174f06aac7`, Preview routing fixes `35abda67f17b55ec259b75e03e7df49f98b27b3b` и `e1e173772fc71ded709ee808a9a76c4dee3e6b49`; remote ref проверен после каждого push.
- Route ownership: React SSR/hydration обслуживает `/merchant/overview`, `/merchant/venue`, `/merchant/menu`, `/merchant/promotions` и `/merchant/reviews`; exact `/merchant` даёт private `302`. `merchant.js` больше не подключается runtime, но legacy HTML/JS сохранены для rollback и Visual Freeze. Admin остаётся legacy.
- Security: deny-by-default membership roles; permission-scoped dashboard slices; server session/venue/permission checks для каждой mutation; forced-password write guard; private/no-store/noindex headers; controlled upstream errors без утечки Supabase/Auth details.
- State integrity: один parent snapshot, отдельные drafts, navigation/beforeunload guard, single-flight mutations, pending forms `inert`, functional controlled setters, browser timezone → ISO, SSR clock и ближайший promotion boundary timer.
- Commit boundary: подтверждённая DB mutation не превращается в ошибку из-за последующего legacy metadata cleanup/audit; authoritative metadata fallback и pre-commit failures остаются строгими.
- Local tests: `npm.cmd run check`; `npm.cmd test` — 60/60 server и 98/98 unit/contract/component; `npm.cmd run smoke`; fixture contracts 17/17; Phase 7 Chromium 10 passed; Visual Freeze 48 passed; Phase 6 regression 19 passed; Phase 5 — 28; Phase 4 — 16. Все viewport skips ожидаемые, snapshots не обновлялись.
- Independent review: первоначально найдены stale post-submit drafts, server-timezone parsing и cold-start clock; все три исправлены, повторный review не нашёл P0–P2, targeted orchestration 6/6.
- Preview: финальный deployment `dpl_CqP7CTaBfvpF44hgDc8izBMyjZyE`, `READY`, target `preview`, URL `https://mesto-city-guide-6ddtl0n8n-krevetkaaaas-projects.vercel.app`, exact runtime commit `e1e173772fc71ded709ee808a9a76c4dee3e6b49`.
- Preview matrix: exact redirect 302/private; пять documents 200/private; generated `/merchant/menu.data` 200/private; unknown merchant 404/private; anonymous merchant API JSON 401/private; React SSR/login markers присутствуют, legacy `merchant.js` отсутствует; admin legacy 200 и общий unknown 404 сохранены.
- Preview defects caught: первый deployment отдавал `merchant.html` из `filesystem`; второй guessed destination `merchant` вернул 404. Финальный source-controlled private redirect перед `filesystem` прошёл фактическую проверку и защищён smoke route-order invariant.
- Ограничения: post-commit observability/request-id, idempotency keys, optimistic concurrency и удаление dual-storage fallback остаются этапами 9–10. Реальный Supabase browser suite не изменяет.
- Database migrations, merge, production deployment и production aliases отсутствуют.
- Подробный контракт: `docs/PHASE7_MERCHANT_WORKSPACE.md`.
- Откат: `git revert e1e173772fc71ded709ee808a9a76c4dee3e6b49`, затем `git revert 35abda67f17b55ec259b75e03e7df49f98b27b3b`, затем `git revert 2c79e24db2930c20d57b9f09f39bd4174f06aac7`; внешние deployments удаляются отдельно.

### Этап 8. Административная панель

- Локальные ворота завершены: `2026-08-07`; Preview создан, но build заблокирован Vercel access policy.
- Branch: `codex/react-migration`; implementation commit `3b46732e8e5829f789b35276649165c06f3d2589`, remote ref подтверждён после push.
- Route ownership: React SSR/hydration обслуживает `/admin/overview`, `/admin/submissions`, `/admin/reviews`, `/admin/venues` и `/admin/merchants`; exact `/admin` даёт private `302` до Vercel `filesystem`. Legacy `admin.html`/`admin.js` сохранены, но runtime больше не подключает `admin.js`.
- UI: login/protected shell, overview, submissions, reviews, venues, merchants/assignments, explicit confirmations, single-flight forms, semantic tables/mobile overflow и conditional one-time credentials DOM.
- Partial state: merchant list является независимым secondary slice; его controlled failure сериализуется plain DTO и не уничтожает dashboard или hydration.
- Backend: same-origin fail-closed для unsafe admin requests; private/no-store/noindex; строгие JSON/size/UUID/venueIds/venue payload checks; controlled `ADMIN_*` errors без Supabase leakage; post-commit audit best-effort; password reset metadata warning протянут до UI.
- Local tests: `npm.cmd run check`; `npm.cmd test` — 65/65 server и 107/107 unit/contract/component; `npm.cmd run smoke`; Phase 8 — 57 passed / 105 expected skipped, включая 12 functional/fixture и 45 Visual Freeze assertions. Phase 7 regression — 58/98, Phase 6 — 19/59, Phase 5 — 28/52, Phase 4 — 16/24.
- Visual/accessibility: canonical login + five protected routes на пяти frozen viewport; interactive confirmation/editor/error/empty/credentials/mobile states; threshold остался 1500, snapshots не обновлялись; unexpected serious/critical Axe violations отсутствуют кроме отдельно учтённого frozen color-contrast debt.
- Ограничения: merchant profile+memberships не имеют общей транзакции; core dashboard slices связаны store call; strong typed/revocable admin session и distributed login limiter обязательны до production на этапах 9–10.
- Preview: deployment `dpl_GYPSPwhXkvRhHYUjBsxtRtfvQWu5`, URL `https://mesto-city-guide-fqxje6hwj-krevetkaaaas-projects.vercel.app`, exact metadata commit `3b46732e8e5829f789b35276649165c06f3d2589`, target preview. Vercel вернул `BLOCKED`/`buildSkipped`/`TEAM_ACCESS_REQUIRED`: Git author `176798612+Krevetkaaaa@users.noreply.github.com` не подтверждён как участник team. Runtime URL отдаёт служебную building page; READY и route matrix не заявляются. Platform check не обходился.
- Database migrations, merge, production deployment и aliases отсутствуют.
- Подробный контракт: `docs/PHASE8_ADMIN_CONSOLE.md`.
- Откат: `git revert 3b46732e8e5829f789b35276649165c06f3d2589`; внешние deployments и данные удаляются/восстанавливаются отдельно.

### Этап 9. Backend-подготовка к росту

- Локальный checkpoint создан: `2026-08-07`; implementation commit `dc8c9fbb4f4cdda46c343feb7d98d65f09889377`.
- Cache: успешные настроенные public catalog/venue/content responses получили согласованный `s-maxage=60`, SWR 120, weak ETag и `304`; ошибки/unconfigured/private responses остаются `no-store`. Post-commit invalidation seam добавлен, но внешний CDN purge adapter не настроен.
- Rate limit: единый async contract, local/test memory adapter и atomic Upstash Redis REST adapter; production запрещает memory и без distributed configuration fail closed с controlled `503`. Политики разделены для public/auth/OAuth/upload/mutations, `429` содержит Retry-After/RateLimit headers, raw identifiers не логируются.
- Data: каталог выбирает только используемые поля и сортирует `created_at desc, id desc`; exact count сохранён из-за UI-контракта. Подготовлен non-mutating EXPLAIN script, но без representative Supabase snapshot он не запускался; speculative index/pg_trgm/cursor migration отсутствуют.
- Media: ранний encoded-size gate, 6 MiB, 8192×8192/40 MP, MIME/container/dimension validation для JPEG/PNG/WebP и UUID object path. Base64 всё ещё проходит через функцию; direct signed upload, derivatives и подтверждённый immutable CDN cache отсутствуют.
- Local verification: `npm.cmd run check`; `npm.cmd test` — 86/86 server и 107/107 unit/contract/component; `npm.cmd run smoke` — production build и 43-file legacy freeze прошли. UI/CSS/snapshots не менялись.
- Критерий Phase 9 не объявлен выполненным: shared limiter не проверен между instances, public CDN headers не подтверждены новым Preview, DB queries не измерены на representative data. Vercel Preview по-прежнему заблокирован `TEAM_ACCESS_REQUIRED` для Git author.
- Database migrations, external provider provisioning, merge, production deployment и aliases отсутствуют.
- Подробный контракт: `docs/PHASE9_BACKEND_SCALE.md`.
- Откат: `git revert dc8c9fbb4f4cdda46c343feb7d98d65f09889377`; внешние secrets/data/storage Git не восстанавливает.

### Этап 10. Производительность, безопасность и доступность

- Локальный checkpoint создан: `2026-08-07`; implementation commit `ddff8daff8d702bb6c6cebaad7e810a5e26b2d03`.
- Public JS gate считает production manifest, общий `/theme.js` и home-only `/app.js`: базовый бюджет `580/160 KiB` raw/gzip, переходный home override `680/185 KiB`; фактический максимум `/` — `621,4/166,7 KiB`, остальных маршрутов `/venue/:slug` — `538,6/149,2 KiB`.
- Canonical security headers применяются Vercel edge, API и React SSR: CSP без `unsafe-eval`, nosniff, strict-origin referrer и отключённые sensitive browser capabilities. Google Fonts connect origins исправлены после фактического browser CSP failure. `unsafe-inline` и широкие HTTPS images остаются явным compatibility debt.
- Admin session получила typed audience/version claims, случайный `jti`, строгие time/subject/role bounds, strong isolated secret и ограниченную legacy compatibility. Немедленного shared server-side revocation пока нет.
- Client source запрещает raw HTML/executable-string sinks. Production bundle scanner проверяет имена и фактические значения server secrets без печати значений; 43 assets чисты. Независимый review нашёл и закрыл пропуск `/app.js` в бюджете и value-only секретов в scanner.
- Local checks: `npm.cmd run check`; `npm.cmd test` — `99/99` server и `113/113` unit/contract/component; `npm.cmd run smoke`; Phase 8 — `57/105`, Phase 7 — `58/98`, Phase 6 — `19/59`, Phase 5 — `28/52`, Phase 4 — `16/24` passed/skipped. Snapshots не обновлялись.
- Accessibility audit подтвердил keyboard/focus/dialog/label/reduced-motion seams и существующее Axe coverage. Frozen `color-contrast` debt требует отдельного согласованного визуального изменения.
- Dependency audit: `5 high`, `3 moderate`, `0 critical`; React Router high относится к неиспользуемому RSC mode, но fix требует incompatible `8.3.0`; AJV moderate через Vercel tooling fix не имеет. Production cutover с нерешённым audit запрещён.
- Критерий Phase 10 не объявлен выполненным: нет production-like p75 LCP/INP/CLS, correlation telemetry, nonce/hash CSP, shared admin revocation, stored-XSS E2E и согласованного audit resolution. Preview остаётся заблокирован `TEAM_ACCESS_REQUIRED`.
- Database migrations, merge, production deployment и aliases отсутствуют. Подробный контракт: `docs/PHASE10_QUALITY_SECURITY.md`.
- Откат: `git revert ddff8daff8d702bb6c6cebaad7e810a5e26b2d03`; внешние settings/secrets/sessions Git не восстанавливает.

### Этап 11. Нагрузочное тестирование

- Partial local checkpoint: `2026-08-08`; implementation commit `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, isolation fix `ea542198675b03917f0aa19429dab20012a0a7a5`, safety hardening `5b733153b85f07e54ef03fff83a04e96c0add924`.
- Harness без новых dependencies разрешает только проверенный loopback IP-literal production-SSR + fixture gateway, запрещает redirects, сбрасывает in-memory state и требует fixture sentinel на API. OS-owned workspace lock, dynamic ports и private IPC ownership исключают stale PID/process-group cleanup; gateway сам завершает children и подтверждает cleanup. Remote targets и production load запрещены.
- Профили: public read, popular venue SSR document, known-fixture auth/session, mixed 90/6/3/1 и read-only merchant/admin. Измеряются p50/p95/p99, attempted/successful RPS, statuses/429/5xx, transport, bytes, cache headers и per-label metrics; SLO/abort заданы до запуска.
- Final smoke 5 VU: public `149,89 RPS`, p95/p99 `66,14/240,52 ms`; popular venue document `115,97`, `64,72/79,70`; auth-safe `926,80`, `9,91/18,09`; merchant/admin `810,39`, `16,77/20,76`. Во всех четырёх profiles только HTTP 200.
- Первоначальные 25 baseline timeouts оказались дефектом harness: непрочитанный access-log stdout заполнил Windows pipe и заблокировал React child. Fix отключил pipe. Safety hardening добавил fail-closed redirect/CLI contracts, proxy reset/cancellation, OS-owned lock, IPC shutdown acknowledgement, aggregate/per-label reservoir и bounded health/login probes. Это не считается app regression.
- Mixed baseline 25 VU passed: 2416/2416 HTTP 200, successful `240,68 RPS`, p95 `325,23 ms`, p99 `351,63 ms`, без transport/HTTP errors.
- Expected mixed 100 VU: 4891/4891 HTTP 200, successful `242,60 RPS`, p50/p95/p99 `401,68/1159,35/1707,18 ms`; failed только predeclared p95 `1000 ms`. SSR home document был самым медленным (p95 `1753,84 ms`), direct fixture API p95 остался `13,25–18,69 ms`. SLO не ослаблялся.
- Burst 300 VU и soak не запускались после expected failure. Короткий fixture probe не доказывает production capacity, cold starts, cache hit, Supabase query time, browser errors или multi-instance limiter.
- Local checks: `npm.cmd run check`; `npm.cmd test` — `114/114` server и `113/113` unit/contract/component; targeted safety `15/15`. `npm.cmd run test:load:local` passed; real lifecycle smoke завершился через acknowledged IPC cleanup без orphan project processes; отдельный expected command намеренно вернул exit 1 по p95 SLO.
- Production-like продолжение требует оптимизации/проверки home SSR, warmup/repeated runs, isolated staging с representative data, shared provider, telemetry и явного разрешения владельца. Подробно: `docs/PHASE11_LOCAL_LOAD.md`.
- Database migrations, external load, merge, deploy и aliases отсутствуют. Откат safety hardening: `git revert 5b733153b85f07e54ef03fff83a04e96c0add924`, затем isolation fix: `git revert ea542198675b03917f0aa19429dab20012a0a7a5`; полный откат Phase 11 затем: `git revert 6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.

## GenericAgent

Основная установка GenericAgent в `C:\Users\kir21\GenericAgent` проверена повторно. В isolated `.venv` был установлен отсутствовавший `psutil`, а `ga.cmd` получил `PYTHONUTF8=1`; теперь `ga status` и `ga --help` запускаются в Windows без dependency/Unicode crash. `mykey.py`, локальный OpenAI-compatible backend и поддерживаемая авторизация через Codex subscription по-прежнему отсутствуют, поэтому реальные LLM-задачи через GenericAgent заблокированы и не имитировались. Подключение выполняется владельцем локально через `C:\Users\kir21\GenericAgent\ga.cmd configure`; секрет не должен передаваться в чат или Git.

## Общий rollback

До production cutover legacy HTML, CSS и JavaScript сохраняются. Кодовый откат опубликованной migration branch выполняется через `git revert` или развёртывание проверенного baseline tag. Force push и переписывание опубликованной истории запрещены. Git не откатывает Supabase data, Storage, environment variables или внешние сервисы.
