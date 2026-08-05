# Toolchain decision для React migration

Дата проверки: 5 августа 2026 года

Статус: approved foundation для Phase 2

## Решение

Для первого production-compatible React Router Framework Mode foundation используется последняя проверенная совместимая stable-линия React Router 7, а не просто latest Router 8.

Причина: `react-router` 8.3.0 stable, но официальный `@vercel/react-router` 1.3.2 по состоянию на дату проверки имеет peer dependencies только на `@react-router/dev` и `@react-router/node` major 7. План требует проверяемый Vercel SSR/SSG path. Установка RR8 вместе с несовместимым preset либо игнорирование peer conflict не допускаются.

RR8 может быть рассмотрен отдельным upgrade после появления официальной Vercel preset support и прохождения preview smoke. Это не блокирует миграцию на Framework Mode.

## Exact package baseline

Dependencies:

| Package | Exact version |
| --- | --- |
| `react` | `19.2.8` |
| `react-dom` | `19.2.8` |
| `react-router` | `7.18.2` |
| `@react-router/node` | `7.18.2` |
| `@react-router/serve` | `7.18.2` |
| `@vercel/react-router` | `1.3.2` |
| `isbot` | `5.2.1` |
| `zod` | `4.4.3` |

Development dependencies:

| Package | Exact version |
| --- | --- |
| `@react-router/dev` | `7.18.2` |
| `vite` | `8.2.0` |
| `typescript` | `6.0.3` |
| `@types/node` | `24.13.3` |
| `@types/react` | `19.2.18` |
| `@types/react-dom` | `19.2.4` |
| `vitest` | `4.1.10` |
| `jsdom` | `30.0.1` |
| `@testing-library/react` | `16.3.2` |
| `@testing-library/dom` | `10.4.1` |
| `@testing-library/jest-dom` | `7.0.0` |
| `@testing-library/user-event` | `14.6.3` |
| `@playwright/test` | `1.62.1` |

`@vitest/coverage-v8` добавляется только при включении coverage и должен иметь exact `4.1.10`, совпадающий с Vitest.

Project runtime фиксируется как Node `24.x`, npm `11.x`, `packageManager: npm@11.16.0`. Текущая среда Node 24.18.0 совместима с выбранными packages.

TypeScript 7.0.2 не выбран, хотя он stable: Router 7 dev package допускает TypeScript 5/6, но не 7; официальный TS7 announcement также фиксирует временное отсутствие compiler API. Dual compiler/alias во время migration не даёт ценности и повышает риск линтера/tooling.

## Framework Mode foundation

- `package.json` получает `type: module`, но legacy CommonJS server files сначала должны быть изолированы через package boundary или переведены совместимо, чтобы не сломать handlers.
- `vite.config.ts` использует только `reactRouter()` plugin. Tailwind и второй React plugin не добавляются.
- `react-router.config.ts` использует `ssr: true` и `vercelPreset()` на совместимой RR7-линии.
- `tsconfig.json` включает strict, noUncheckedIndexedAccess, DOM libs, Bundler resolution и `.react-router/types` через `rootDirs`.
- `app/root.tsx` владеет document shell, Meta, Links, Outlet, ScrollRestoration, Scripts и ErrorBoundary.
- `app/routes.ts` описывает RouteConfig.
- Первый React route появляется под отдельным migration path, пока legacy root остаётся доступным.
- `/api/*`, OAuth callbacks, `/assets/*` и legacy fallback имеют более высокий/явный routing priority.

## Rendering decision

Целевой режим: SSR (`ssr: true`) плюс selective prerender для действительно статических маршрутов, начиная с `/help` после visual parity.

- Dynamic `/catalog`, `/city/:citySlug` и `/venue/:venueSlug` требуют SSR или безопасного revalidation path.
- Protected profile/merchant/admin не prerenderятся как user-specific HTML.
- SPA-only режим запрещён для индексируемого public content.
- Prerender loaders исполняются во время build и не должны обращаться к browser globals, user sessions или выполнять production mutations.

## Обязательные smoke checks Phase 2

1. Legacy `/`, `/help.html`, `/merchant.html`, `/admin.html` продолжают открываться.
2. Первый React health route работает в dev и production build/serve.
3. `/api/venues` и неизвестный `/api/*` сохраняют backend semantics.
4. OAuth callback paths не попадают в React catch-all.
5. Vercel preview подтверждает framework output, clean URLs, SSR headers и API rewrite priority.
6. Public build не содержит server-only env names/values.
7. Lockfile и exact versions не меняются скрыто между CI runs.

## Официальные источники

- React Router installation: <https://reactrouter.com/start/framework/installation>
- Official template: <https://github.com/remix-run/react-router-templates/tree/main/default>
- Rendering: <https://reactrouter.com/start/framework/rendering>
- Pre-rendering: <https://reactrouter.com/how-to/pre-rendering>
- SPA constraints: <https://reactrouter.com/how-to/spa>
- React Router deploy: <https://reactrouter.com/start/framework/deploying>
- Vercel React Router: <https://vercel.com/docs/frameworks/frontend/react-router>
- Vercel Node versions: <https://vercel.com/docs/functions/runtimes/node-js/node-js-versions>
- Vite: <https://vite.dev/guide/>
- Vitest: <https://vitest.dev/guide/>
- Playwright snapshots: <https://playwright.dev/docs/test-snapshots>
- Playwright traces: <https://playwright.dev/docs/trace-viewer>
- Testing Library: <https://testing-library.com/docs/react-testing-library/setup/>
- Zod: <https://zod.dev/>
- TypeScript 7 announcement and limitations: <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
