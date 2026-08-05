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
| 3. Core modules | complete | pending (SHA записывается после push) | 26 server + 42 unit tests, strict typecheck, ESLint, production build и coexistence smoke прошли | `getBySlug` ждёт published-only backend endpoint; upload workflow не может удалить orphaned object; откат через revert Phase 3 commit |
| 4-8. Route migration | pending | pending | pending | Visual Freeze обязателен для каждого маршрута |
| 9-11. Scale and quality | pending | pending | pending | Distributed limiter требует внешнего shared-state provider |
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
- Commit: pending; полный SHA будет записан следующим journal commit после push и remote verification.
- Architecture: один typed HTTP seam; точные endpoints и wire DTO локализованы в adapters; Session, VenueCatalog, Favorites, Submissions, MerchantWorkspace и AdminConsole имеют intent interfaces, production adapters и stateful controllable fakes.
- Transport security: browser `credentials: same-origin`; SSR origin выводится только из входящего `Request`; forward allowlist ограничен `Cookie`, `Accept-Language`, UUID `X-Request-ID`; response sink принимает только все значения `Set-Cookie`.
- Runtime boundary: восемь `ApplicationError` kinds, Zod validation критических DTO, strict UUID/status/role/coordinates contracts и backend-compatible input normalization.
- Tests: `npm.cmd test` — 26/26 server и 42/42 unit/contract tests; `npm.cmd run check` — legacy syntax, React Router typegen, strict TypeScript и ESLint; `npm.cmd run smoke` — production client/SSR build и Phase 2 coexistence matrix. Independent contract review: P0/P1 отсутствуют.
- Visual regression: не применимо — routes, HTML, CSS, assets и Vercel mapping не менялись.
- Database migrations: отсутствуют.
- Ограничения: `getBySlug` намеренно отсутствует до published-only backend endpoint; последовательность upload → submission может оставить orphaned Storage object, поскольку delete/transaction API отсутствует. Backend scale/security gaps остаются Phases 9–10.
- Подробный контракт: `docs/PHASE3_CORE_MODULES.md`.
- Откат: `git revert <phase-3-commit>` удаляет только TypeScript modules/adapters/fakes/tests/docs; legacy runtime, API, database и Vercel coexistence не меняются.

## GenericAgent

Основная установка GenericAgent в `C:\Users\kir21\GenericAgent` не имеет `mykey.py`, локального OpenAI-compatible backend или поддерживаемой авторизации через Codex subscription. Обнаруженная вложенная локальная копия `genericagent/` исключена из Git; её единственный профиль является пустым `mixin_config` и инициализируется как `BADCONFIG_MIXIN`, а не как рабочая LLM-сессия. Реальные LLM-задачи через GenericAgent сейчас заблокированы. Подключение выполняется владельцем локально через `C:\Users\kir21\GenericAgent\ga.cmd configure`; секрет не должен передаваться в чат или Git.

## Общий rollback

До production cutover legacy HTML, CSS и JavaScript сохраняются. Кодовый откат опубликованной migration branch выполняется через `git revert` или развёртывание проверенного baseline tag. Force push и переписывание опубликованной истории запрещены. Git не откатывает Supabase data, Storage, environment variables или внешние сервисы.
