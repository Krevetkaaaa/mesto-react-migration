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
| 0. Требования и показатели | local complete; production metrics blocked | `327832905fccb8daae55ab040324eecff24fae26` | local audit, API/visual contracts, asset sizes, HTTP baseline и browser request baseline | Production analytics/Supabase/Vercel metrics недоступны; Lighthouse lab-run заблокирован Windows `EPERM`; откат через revert Phase 0 commit |
| 1. Legacy safety net | complete | `63d7d8fea1d00f1a45948b6ff4e46f42ffcded7b` | server/contract, syntax, functional, axe smoke и visual regression прошли | Fixture auth/OAuth не заменяет preview E2E; Playwright CDN 403, baseline снят Chrome `151.0.7922.72`; откат через revert Phase 1 commit |
| 2. Framework foundation | complete | `88ca959b01a3d2b2710644e1648ef65dd44120f9` | React/TS/RR build, strict typecheck, ESLint, 26 server + 4 unit tests, local smoke и Vercel Preview route matrix прошли | Local `vercel build` блокируется Windows symlink `EPERM`; RR7 audit содержит RSC-only high advisory, upgrade требует совместимого Vercel preset; откат через revert Phase 2 commit |
| 3. Core modules | complete | `6cdc34c13153584f41699df1162ceec4402ab1b6` | 26 server + 42 unit tests, strict typecheck, ESLint, production build и coexistence smoke прошли | `getBySlug` ждёт published-only backend endpoint; upload workflow не может удалить orphaned object; откат через revert Phase 3 commit |
| 4. Public shell and static pages | complete | `590339d174bec83b694d8397d8b72f6e003a2f74` | SSR/DOM parity, 26 server + 57 unit, strict check, production smoke, five-viewport visual regression and Preview route matrix passed | Home still loads legacy `app.js`; its remaining behavior must move to React before Phase 12 cutover; rollback through revert of the Phase 4 commit |
| 5. Venue catalog | complete | `688e63f1a3f9267e892709c3338558c0a6089cad`, routing fix `5089a340fa61857b32952c69ef1436d478278f15` | 39 server + 82 unit, strict check, production smoke, Phase 4 regression, Phase 5 functional/accessibility and 19-snapshot visual matrix, Preview route matrix passed | Protected Preview cannot authenticate SSR self-fetch for a non-editorial venue; covered by controlled E2E/contracts and must be rechecked before production cutover |
| 6. Customer auth and profile | complete | `88940e6194a0bb70dfac34b0ad6754f6a8784c19`, Preview fixes `57b0c82c9526ff9470a1a8a558dc407df654c7e8`, `be6c265e93bf821289273e0358e6d922ba413c0d` | 51 server + 92 unit, strict check, production smoke, Phase 4/5 regression, Phase 6 functional/accessibility, 11-snapshot visual matrix and protected Preview route/cache matrix passed | Known frozen-palette contrast debt is deferred to an approved accessibility task; production deploy remains forbidden |
| 7. Merchant workspace | complete | `2c79e24db2930c20d57b9f09f39bd4174f06aac7`, Preview routing fixes `35abda67f17b55ec259b75e03e7df49f98b27b3b`, `e1e173772fc71ded709ee808a9a76c4dee3e6b49` | 60 server + 98 unit, strict check, production smoke, fixture contracts, Phase 4-6 regressions, Phase 7 functional/accessibility и 48-snapshot visual matrix, protected Preview route/cache matrix | Post-commit observability/idempotency deferred; production deploy remains forbidden |
| 8. Admin console | local complete; Preview shell verified, auth environment blocked | `3b46732e8e5829f789b35276649165c06f3d2589` | 65 server + 107 unit, strict check, production smoke, Phase 4-7 regressions, 12 functional/fixture scenarios, 45-snapshot Visual Freeze matrix и anonymous Preview shell `200/private` | Preview не имеет Supabase/session secrets; multi-store merchant update не транзакционен; strong typed/revocable admin session остаётся Phase 10 blocker; production deploy forbidden |
| 9. Backend scale | local checkpoint; production criteria blocked | `dc8c9fbb4f4cdda46c343feb7d98d65f09889377` | 86 server + 107 unit, strict check, production smoke и Preview document CDN/private headers проверены | Shared limiter/provider отсутствует и API fail-closed `503`; CDN purge, representative EXPLAIN и direct media upload требуют внешнего environment |
| 10. Performance, security and accessibility | local checkpoint; production criteria blocked | `ddff8daff8d702bb6c6cebaad7e810a5e26b2d03` | 99 server + 113 unit, strict check, production smoke, public JS/client-secret gates, Phase 4-8 Chromium regressions и Preview routing/header smoke прошли | p75 Web Vitals, contrast remediation, nonce/hash CSP, shared admin revocation, dependency audit decision, provider-backed auth/data и production telemetry не закрыты |
| 11. Load testing | partial local checkpoint; expected passed, burst blocked | `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, fixes `ea542198675b03917f0aa19429dab20012a0a7a5`, `5b733153b85f07e54ef03fff83a04e96c0add924`, home SSR `64a3c493b0b18ad280c74392f41a2ec9e23fbd05` | fail-closed loopback harness: smoke/baseline passed; три expected 100-VU mixed runs passed с p95 `857/704/699 ms`; 115 server + 113 unit и Phase 4–6 regressions passed | Formal 300-VU popular-venue burst: 558×200, 42×503, p95 `4633 ms`; soak gated; fixture не моделирует Vercel edge cache/Supabase/serverless/distributed limiter capacity |
| 12. Cutover preparation | local release candidate complete; production-like acceptance blocked | `398c4d8446d593e2976f1590275f4851d09c3fdf`, Vercel navigation `0b8f9e6a8675e09842479ea57f3c7113052e91b8`, CI portability `562e55f1932d1c53cf72bb27f86351baa20bff87`, Phase 4 helper `68575fbc659163cc853053ac6ff59e9a32e8d1dd`, unified visual contract `f00ee7afd40107a5a8d6d3ecf10bd7d330951e98`, SSR timezone `3fb5b760f71833f83d04c1a6689519f3df9147b7` | 148 server + 189 unit, strict check, production smoke, exact-browser Visual Freeze, independent black-box/release review и READY Preview navigation passed | Preview shared providers/env, formal burst/soak, Web Vitals/telemetry, owner approval, merge и production deploy остаются blocked |

Таблица фиксирует исторические checkpoints и не переписывается задним числом. Актуальный code-only статус после этих записей приведён в superseding update от 9 августа 2026 года ниже.

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

- Partial local checkpoint: `2026-08-08`; implementation commit `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, isolation fix `ea542198675b03917f0aa19429dab20012a0a7a5`, safety hardening `5b733153b85f07e54ef03fff83a04e96c0add924`, home SSR optimization `64a3c493b0b18ad280c74392f41a2ec9e23fbd05`.
- Harness без новых dependencies разрешает только проверенный loopback IP-literal production-SSR + fixture gateway, запрещает redirects, сбрасывает in-memory state и требует fixture sentinel на API. OS-owned workspace lock, dynamic ports и private IPC ownership исключают stale PID/process-group cleanup; gateway сам завершает children и подтверждает cleanup. Remote targets и production load запрещены.
- Профили: public read, popular venue SSR document, known-fixture auth/session, mixed 90/6/3/1 и read-only merchant/admin. Измеряются p50/p95/p99, attempted/successful RPS, statuses/429/5xx, transport, bytes, cache headers и per-label metrics; SLO/abort заданы до запуска.
- Final smoke 5 VU: public `149,89 RPS`, p95/p99 `66,14/240,52 ms`; popular venue document `115,97`, `64,72/79,70`; auth-safe `926,80`, `9,91/18,09`; merchant/admin `810,39`, `16,77/20,76`. Во всех четырёх profiles только HTTP 200.
- Первоначальные 25 baseline timeouts оказались дефектом harness: непрочитанный access-log stdout заполнил Windows pipe и заблокировал React child. Fix отключил pipe. Safety hardening добавил fail-closed redirect/CLI contracts, proxy reset/cancellation, OS-owned lock, IPC shutdown acknowledgement, aggregate/per-label reservoir и bounded health/login probes. Это не считается app regression.
- Mixed baseline 25 VU passed: 2416/2416 HTTP 200, successful `240,68 RPS`, p95 `325,23 ms`, p99 `351,63 ms`, без transport/HTTP errors.
- Первый expected mixed 100 VU вернул 4891/4891 HTTP 200, но failed p95 `1159,35 > 1000 ms`; самым медленным был home document. SLO не ослаблялся.
- Из React home SSR удалены только заранее hidden/недостижимые `#platform`, legacy catalog body и 28 extra venue cards. Полный 31-record counter/dedupe inventory сохранён компактно; legacy HTML и frozen visuals не менялись. Production-gateway `/` уменьшился `90 422 → 51 904 bytes` (`-42,6%`), home component `107,23 → 69,32 KiB`, server bundle `615,44 → 539,89 KiB`; `app.js` cache-buster поднят до `ui-motion-3`.
- Три fresh-process expected mixed runs passed: 5672/5672, 6234/6234 и 6240/6240 HTTP 200; p95 `857,49/704,20/699,00 ms`, p99 `1272,34/891,98/948,61 ms`; transport/HTTP errors нет.
- Дополнительный 300-VU mixed stress failed с 30 timeouts. Формальный popular-venue document burst также failed: 600 attempts, 558 HTTP 200, 42 HTTP 503, p95 `4633,06 ms`; soak не запускался после burst gate. Локальный gateway не реализует Vercel edge cache, поэтому это uncached single-process origin evidence, не production capacity.
- Local checks: `npm.cmd run check`; `npm.cmd test` — `115/115` server и `113/113` unit/contract/component; `npm.cmd run smoke`; Phase 4 `17`, Phase 5 `28`, Phase 6 `19` passed, snapshots не обновлялись. Три expected commands завершились exit 0; formal burst — exit 1 по честному SLO.
- Production-like продолжение требует Vercel Preview warmup/cache-HIT проверки, повторного burst, затем soak, isolated staging с representative data, shared provider, telemetry и явного разрешения владельца. Подробно: `docs/PHASE11_LOCAL_LOAD.md`.
- Database migrations, external load, merge, deploy и aliases отсутствуют. Откат home SSR: `git revert 64a3c493b0b18ad280c74392f41a2ec9e23fbd05`, затем safety hardening: `git revert 5b733153b85f07e54ef03fff83a04e96c0add924`, isolation fix: `git revert ea542198675b03917f0aa19429dab20012a0a7a5`; полный откат Phase 11 затем: `git revert 6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.

### QA-hardening после независимого browser review

- Локальный checkpoint: `2026-08-08`; commit и Preview фиксируются отдельной operations-записью после публикации ветки.
- Независимый browser-agent на `gpt-5.6-sol` с `ultra` reasoning сначала исследовал сайт black-box через accessibility tree. Он воспроизвёл три несостыковки: слабый пароль принимался fixture-слоем, mobile dialog не удерживал keyboard focus, а theme control терял состояние на catalog → venue → Back. Четвёртая проблема была системной: home смешивал 31 editorial record с первой API-страницей и показывал `33/8`, тогда как React catalog честно показывал только 3 опубликованных fixture rows.
- Парольная политика теперь едина для production handlers, identity, React/legacy/customer/merchant/admin UI и fixture: минимум 10 символов, буква и цифра. Синхронный browser/CommonJS core `password-policy-core.js` и ESM-фасад `password-policy.mjs` копируются в legacy static, входят в public JS budget и проверяются interop/server/unit/browser контрактами. Статические HTML-атрибуты сохранены как fail-closed no-JS fallback; parity-тест требует их точного совпадения с общей policy.
- Mobile navigation получила полный Tab/Shift+Tab trap, `inert`/`aria-hidden` фон, Escape и возврат фокуса. `theme.js` через `MutationObserver` синхронизирует новые React controls; midnight сохраняется на catalog, venue и browser Back.
- Добавлен глубокий `HomeCatalogSummary`: `/api/venues?summary=1`, Supabase RPC-first и paginated `city,category` fallback, точный fixture aggregate и одинаковый SSR/editorial fallback. Home больше не вычисляет production числа из hidden inventory. Category/city/collection cards и quick filters имеют честные canonical href и правильные склонения; декоративные collection counts удалены. Агрегаторы используют `Map`, поэтому пользовательские названия вроде `constructor` и `__proto__` не искажают статистику.
- Добавлена forward migration `supabase/migrations/20260808_public_catalog_summary.sql` (`security invoker`, execute только `service_role`) и rollback-инструкция. Migration в Supabase не применялась: внешний database state без отдельного разрешения не изменён.
- Legacy test config теперь запускает только сохранённую safety net, а `npm run test:e2e` последовательно включает legacy и Phase 4–8. Пять catalog-only legacy tests и соответствующие viewport-варианты имеют явный expected skip: route с Phase 5 принадлежит React и проверяется replacement suite, а не недостижимым legacy DOM. Phase 5–7 configs теперь также включают свои fixture-contract suites и выполняют их ровно один раз; расширенная матрица закрыла safe OAuth return target и последовательность favorite mutations.
- Verification: `npm.cmd run check`; `npm.cmd test` — `123/123` server и `129/129` unit/contract/component; `npm.cmd run smoke`; Phase 4 `20 passed / 40 skipped`, Phase 5 `34/76`, Phase 6 `28/104`, Phase 7 `64/128`, Phase 8 `57/105`. Legacy functional: `33 passed / 5 migrated skips`; visual safety net: `134 passed / 131 viewport-or-migrated skips`. Один focus snapshot обновлён только после ручного expected/actual/diff review: focus ring сохранился, изменились исключительно намеренные `33 → 3` counters; повтор без update прошёл. Promotion CRUD дополнительно проверяет независимость title/description до submit; полный изолированный Phase 7 повтор прошёл `64/128` без смешивания полей.
- Fresh local load: baseline public-read `2577/2577`, p95/p99 `200,01/265,84 ms`; expected mixed `6059/6059`, p95/p99 `747,37/944,51 ms`; оба pass, все ответы 200. Предыдущий formal 300-VU burst fail и незапущенный soak остаются блокерами production-like claim.
- Финальный goal-driven browser smoke после fixture reset использовал явные URL/text/forbidden-state oracles: home `3`, coffee `1`, catalog `1 из 1`, venue URL и Back; midnight сохранилась на трёх состояниях; weak password оставил dialog открытым и `register=0`; mobile focus sequence замкнулась на close + 7 controls, фон восстановился; merchant открыл `/merchant/overview`, admin — `/admin/overview`, затем обе test sessions завершены. Browser console: 0 warn/error.
- Содержательные home baseline изменения просмотрены вручную, но это не заменяет явное одобрение владельца Preview. Production cutover, merge, database apply, remote load и production alias по-прежнему запрещены.

### QA-hardening publication

- Implementation commit `7d15a9165f428d110c20e82896693c1ee6c0e167` опубликован в `migration-origin/codex/react-migration`; удалённый ref после push совпал с локальным SHA.
- Vercel CLI создал Preview deployment `dpl_Dj1gWRkpBCqbDDC52HSw3jREVCfG` для этого exact SHA: `https://mesto-city-guide-cl2tcx9ij-krevetkaaaas-projects.vercel.app`. Build не запускался: deployment сразу получил `BLOCKED` / `TEAM_ACCESS_REQUIRED` с причиной `Git author 176798612+Krevetkaaaa@users.noreply.github.com must have access to the team krevetkaaaa's projects on Vercel to create deployments.`
- Заблокированный deployment не считается Preview verification: route, header, cache и browser checks на нём не выполнялись. Git identity/metadata не подменялись для обхода team policy; production alias, production deployment, Supabase state и remote load не изменялись.

### QA-hardening Preview remediation

- Repo-local Git author e-mail переключён с нераспознанного Vercel адреса на primary verified GitHub e-mail `kir21012009@gmail.com`; опубликованная история не переписывалась и force push не выполнялся. Trigger commit `6caabe5f940cbd29b4dc8a531bfcdd0bf22e8851` опубликован в `migration-origin/codex/react-migration`.
- Preview `dpl_CCPP4Dx8eRG8XPBjpEhCr4nPZBnR` для trigger commit получил `READY`, чем снял `TEAM_ACCESS_REQUIRED`. Фактическая route matrix обнаружила отдельный runtime-дефект: Vercel CommonJS loader отклонял `require('../password-policy.mjs')` с `ERR_REQUIRE_ESM`, хотя локальный Node 24 разрешал этот interop и маскировал проблему.
- Fix commit `49893b5e5d13635200e542232295adb8640037de` перевёл CommonJS handlers на синхронный общий core и оставил ESM/browser API через тонкий фасад. Регрессия закреплена запуском API router с `--no-experimental-require-module`; `npm.cmd run check`, `npm.cmd test` (`124` server, `129` unit) и `npm.cmd run smoke` прошли.
- Исправленный Preview `dpl_4UZw77jtaTvxUPD53oXbk6uZMPoJ`, `https://mesto-city-guide-olq0twwbr-krevetkaaaas-projects.vercel.app`, exact runtime commit `49893b5e5d13635200e542232295adb8640037de`, получил `READY`. `/`, `/catalog`, `/help`, `/login`, `/register`, merchant/admin shells и `/api/auth/providers` отвечают без 5xx; `/profile` и `/favorites` возвращают ожидаемый private `302`; неизвестный web route — `404`. Главная и каталог фактически показали `Age` и `X-Vercel-Cache: STALE`; profile redirect сохранил `private, no-store`.
- Phase 9 functional acceptance остаётся красным: `/api/venues?summary=1` отвечает контролируемым `503 RATE_LIMIT_UNAVAILABLE`, а venue document транзитивно получает `503`. В Preview environment присутствуют только OAuth variables; отсутствуют Supabase, user/admin session secrets и `MESTO_RATE_LIMIT_*`. Memory fallback в production build намеренно запрещён. Внешние provider/env state, Supabase, production deployment и production alias не изменялись.

### Этап 12. Локальный React cutover release candidate

- Локальный checkpoint: `2026-08-08`; commit/remote SHA и Preview deployment фиксируются после независимого review и публикации.
- Главная теперь SSR + hydration React route и не загружает runtime `app.js`. Search, category/city links, featured cards, favorites, review и venue-submission flows перенесены на существующие typed modules/adapters; legacy files сохранены только для rollback/tests.
- Устранены найденные independent-review P1: stale anonymous при route transition, потеря безопасного submission `returnTo`, focus loss после dialog close, наследование `?page=20` главной, partial sitemap caching и нормализованный вместо фактического body byte limit.
- Sitemap использует отдельный rate-limited exact-count slug endpoint с provider-safe пагинацией по 1000 строк до стандартного лимита 50 000 URL и fail-closed `503 no-store`; query cache-busting канонизируется/отклоняется до Supabase, неполные, повторные и неканоничные slug не публикуются. Unconfigured database даёт только editorial sitemap без shared caching.
- Public image boundary отклоняет protocol-relative, credential, `javascript:`, `data:`, `file:` и произвольные relative URLs; правило применяется также к сохранённым favorite snapshots. Review author и submission contact name read-only и берутся из текущего профиля.
- API responses получили UUID `X-Request-ID`; internal HTTP requests не следуют redirects. JSON body size считается по authoritative raw/stream bytes и не обходится пробелами, escape или повторными ключами.
- CI workflow блокирует release на `check`, `test`, production `smoke`, dependency audit и полном Phase 4–8 + legacy E2E. Windows job скачивает Chrome `151.0.7922.72`, проверяет SHA-256 и не обновляет snapshots.
- Verification: `npm.cmd run check`; `npm.cmd test` — `148/148` server и `189/189` unit; `npm.cmd run smoke`; 50 client assets без secret leakage; public home `508,8/152,2 KiB`; Phase 4 `23/52`, Phase 5 `35/80`, Phase 6 `29/109`, Phase 7 `64/128`, Phase 8 `57/105`; все числа — passed/expected skipped, exact Chrome, no snapshot update. Дополнительно вся Phase 8 прошла под server `TZ=UTC`, browser `Europe/Simferopol` без hydration errors.
- Независимый Sol Ultra black-box после исправлений дал `PASS`: `/ → /catalog → /venue`, customer/merchant/admin и mobile keyboard charters, `0` console/page errors и неожиданных `4xx/5xx`. Свежий read-only release review дал `SHIP`; P0/P1 отсутствуют.
- Reviewer follow-up закрыл sitemap query/limiter DoS, реальный `413` вместо socket reset, раннюю отмену oversized response stream, anonymous-session console noise и provider row-cap pagination.
- Финальный ручной Preview-проход обнаружил и закрыл потерю клавиатурного фокуса после закрытия route-диалогов account/favorites. `replace` не позволяет Back повторно открыть dialog; route-state marker возвращает фокус на login/register/favorites trigger после монтирования главной. Targeted Phase 6 browser regression проверяет Enter, Escape, close button и оба account-состояния; независимый read-only review дал `ACCEPT` без P0/P1.
- Неблокирующий debt из финального `SHIP`: snapshot-consistent sitemap RPC/materialization, разделение edge/origin cache-fill request IDs и TTL/compensating cleanup для orphaned uploads.
- Production audit: 0 high/critical, 3 moderate AJV без fix. CommonJS no-ESM-loader gate прошёл.
- Локальный Visual Freeze зелёный, но production-like acceptance остаётся заблокирован: Preview не имеет Supabase/session/shared Redis env; формальный 300-VU burst ранее провален, soak не запускался; Web Vitals/provider telemetry/representative EXPLAIN отсутствуют; владелец ещё не одобрил финальный Preview.
- Production deployment, alias, merge, Supabase migration и внешняя load-атака не выполнялись. Откат после публикации — новый `git revert <phase-12-commit>`; baseline tag `pre-react-migration-20260805-1916` сохранён.
- Publication: implementation `398c4d8446d593e2976f1590275f4851d09c3fdf`, Vercel route-discovery fix `0b8f9e6a8675e09842479ea57f3c7113052e91b8`, cross-host Visual Freeze gate `562e55f1932d1c53cf72bb27f86351baa20bff87`, Phase 4 helper fix `68575fbc659163cc853053ac6ff59e9a32e8d1dd`, unified Phase 4–8 contract `f00ee7afd40107a5a8d6d3ecf10bd7d330951e98`, timezone-stable SSR `3fb5b760f71833f83d04c1a6689519f3df9147b7`; remote ref каждого push совпал с локальным SHA. READY Preview `dpl_7VfMiovccjuhUTuc9RFLVaoVrh9q` (`https://mesto-city-guide-c8yeinpgi-krevetkaaaas-projects.vercel.app`) прошёл ручной home/search/catalog/detail/back, theme, mobile focus, guest favorite/submission guard, auth, help, merchant/admin shell и health smoke без console errors. `/api/venues` остаётся контролируемым `503 RATE_LIMIT_UNAVAILABLE`, потому что Preview не настроен shared Redis/provider environment.

### Superseding update — 9 августа 2026 года

- Эта запись заменяет только устаревшие debt/status-утверждения в предыдущих Phase 9, 10 и 12 checkpoints; их commits, результаты и численные показатели остаются историческими.
- CSP получил отдельный nonce для каждого SSR render/cache fill (CDN HIT может повторно отдать тот же cached body/policy) и передаёт его React SSR scripts/styles; `unsafe-inline` удалён из `script-src` и общего `style-src`, при этом `style-src-attr 'unsafe-inline'` остаётся узким compatibility exception. Сужение всё ещё широкого `img-src` этим update не выполнено.
- Production bundle подключает Vercel Analytics и Speed Insights с bounded route templates. API/SSR structured telemetry ограничена request id, route, method, status, duration/cold-start, error name и валидированным provider id; query/body/cookies/tokens/user identifiers не записываются.
- Admin session revocation использует shared Upstash-compatible Redis, hashed keys и TTL до истечения session; production запрещает memory и fail closed при provider outage. Authenticated Phase 7/8 E2E сохраняют merchant/admin XSS payload, перезагружают страницу и доказывают inert text без выполнения markup.
- Public API/SSR responses получили Vercel cache tags `mesto-venues` / `mesto-venue-<uuid>` и `Vercel-CDN-Cache-Control`; project-scoped `invalidateByTag()` запрашивается после mutations с ограниченным blast radius и bounded failure telemetry.
- Исторический pre-implementation status (superseded текущим checkpoint ниже): безопасный upload fallback на тот момент оставался server-mediated, а direct signed staging upload/lifecycle/derivatives ещё считались внешним Phase 9 пунктом. Эта строка не описывает текущий code-only tree.
- Code-only части CSP nonce, observability wiring, bounded telemetry, shared admin revocation, fixture-backed production React stored-XSS coverage и cache-tag purge adapter закрыты. Реальные handlers/Supabase stored-XSS acceptance, фактические provider events/CDN purge, внешние env и migration, formal burst/soak, mobile p75 Web Vitals, representative `EXPLAIN`, snapshot-consistent sitemap, edge/origin cache-fill correlation, image-origin/contrast debt, owner approval, merge, production deploy и alias остаются незавершёнными.
- Финальный локальный verification run 10 августа: `165/165` server и `202/202` unit tests, `npm run check`, production smoke и полный последовательный `npm run test:e2e` (legacy + Phase 4–8) прошли без обновления snapshots; production dependency audit содержит `0 high`, `0 critical` и три транзитивных `moderate` AJV без доступного исправления.

На момент этой записи tree не объявлялся production-like или production готовым.

### Текущий release checkpoint — 11 августа 2026 года

- Этот checkpoint supersedes только текущие status/debt-утверждения предыдущих записей; исторические commits, deployments и результаты проверок сохранены без переписывания.
- GitHub topology приведена к проверяемой базе: `main` указывает на baseline `ee8476473b64de946d81dc1adbcd7dc3871e4ac9`, Draft PR [#1](https://github.com/Krevetkaaaa/mesto-react-migration/pull/1) направлен из `codex/react-migration` в `main`. Последний локальный commit — `e44cfd116f50e487a8dc6c4f742f2bfc0049c095`; интегрированные после него исправления ещё не закоммичены.
- Для `e44cfd1` required check `Types, tests, and production smoke` прошёл, но `Exact-browser functional and Visual Freeze` завершился ошибкой из-за font resource `ERR_NO_BUFFER_SPACE` и favorite optimistic-race. Fixture preloading/route fulfillment для шрифтов и ожидание фактического `POST /api/favorites` находятся в working tree; новый зелёный CI до commit/push не заявляется.
- Свежий локальный rerun текущего working tree: `git diff --check` — PASS; `npm run check` — PASS; `npm test` — `318/318` server и `203/203` Vitest; `npm run smoke` — PASS; `npm run audit:production` проходит high-severity gate при трёх транзитивных `moderate` AJV без доступного исправления.
- Полный exact-Chrome `npm run test:e2e` после последних изменений не перезапускался. Исторический проход с exit code `0` за `763.7 s` относится к более раннему working tree. Попытки локально получить pinned Chrome for Testing `151.0.7922.72` с official GCS и official `gvt1` mirror обе вернули HTTP 403; archive не сохранён, поэтому pinned GitHub CI step остаётся обязательным.
- Изолированный Preview Supabase ref — `foxqdoyqcfsqngfotayu`. До migration создан provider-backed snapshot 12 известных public tables и Storage bucket metadata вне Git: `C:\Users\kir21\AppData\Local\Temp\mesto-preview-backup-20260811\data-and-buckets.json`; известных table rows на момент backup не было.
- На Preview применены и сверены с remote history только исторические три migration: `20260728_external_identities.sql`, `20260808_public_catalog_summary.sql`, `20260810222309_direct_signed_media_pipeline.sql`. Четыре additive migration code-ready, но не применены ни к Preview, ни к Production: `20260811160000_media_publication_fencing.sql`, `20260811163000_signed_upload_tombstones.sql`, `20260811185937_submission_media_cleanup_receipts.sql`, `20260811212027_venue_media_cleanup_receipts.sql`.
- Direct signed staging upload, private derivatives, approval-only immutable publication, durable cleanup и protected manual Preview media reaper реализованы в коде. Acceptance создаёт два signed receipts, использует один общий latest-expiry/grace wait около `2 h 6 min`, выполняет ordinary cleanup → reaper → logouts, требует exact counts `{recovered:0,public:0,staging:1,review:0,expired:1}` и exact owner status `exists:true → false`.
- `MESTO_ACCEPTANCE_CRON_SECRET` берётся только из environment runner-процесса, без CLI fallback и вывода в report/error. Unauthenticated/authenticated reaper evidence доказывает handler/auth/provider reachability конкретного Preview deployment, а не настройку или выполнение Production schedule.
- Read-only derivation показал одинаковый Redis provider fingerprint у Preview и Production. `MESTO_LOAD_EXPECTED_REDIS_NAMESPACE=preview` обеспечивает логическую область ключей, но не физическую provider isolation; remote acceptance/load теперь fail closed до отдельного Preview Redis и distinct expected/forbidden digests.
- Production `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` variables существуют, но value length обоих равен `0`; production project ref/database readiness не установлены. READY deployment `dpl_A5sZXUDyWBFMe4nrm94cC3TN3tRg` доказывает только более ранний commit. Production data/env values/deployment/alias не изменялись; PR не merged, production migration не применялась, owner visual approval не получен.
- Следующий честный release gate: с backup/rollback применить четыре additive migration только к изолированному Preview и сверить remote history → физически разделить Redis providers и получить canonical distinct Production Supabase ref только после безопасной production-подготовки → commit/push → оба required CI checks, включая pinned exact-Chrome → новый immutable Preview с exact provider fingerprint → mutation/media/browser/reaper acceptance и cleanup → expected/burst/soak → свежий независимый review и owner approval. Только после этого допустим отдельный production backup/migration/promotion с rollback.

## GenericAgent

Основная установка GenericAgent в `C:\Users\kir21\GenericAgent` проверена повторно. В isolated `.venv` был установлен отсутствовавший `psutil`, а `ga.cmd` получил `PYTHONUTF8=1`; теперь `ga status` и `ga --help` запускаются в Windows без dependency/Unicode crash. `mykey.py`, локальный OpenAI-compatible backend и поддерживаемая авторизация через Codex subscription по-прежнему отсутствуют, поэтому реальные LLM-задачи через GenericAgent заблокированы и не имитировались. Подключение выполняется владельцем локально через `C:\Users\kir21\GenericAgent\ga.cmd configure`; секрет не должен передаваться в чат или Git.

## Общий rollback

До production cutover legacy HTML, CSS и JavaScript сохраняются. Кодовый откат опубликованной migration branch выполняется через `git revert` или развёртывание проверенного baseline tag. Force push и переписывание опубликованной истории запрещены. Git не откатывает Supabase data, Storage, environment variables или внешние сервисы.
