# Этап 10. Производительность, безопасность и доступность

> **Исторический checkpoint.** Этот файл сохраняет последовательность Phase 10 и её численные доказательства, но не задаёт текущую готовность релиза. Актуальные release-gates, exact Preview и production status находятся в [`PHASE12_CUTOVER.md`](./PHASE12_CUTOVER.md).

Дата локального checkpoint: 7 августа 2026 года.

Implementation commit: `ddff8daff8d702bb6c6cebaad7e810a5e26b2d03`.

Статус этапа: локальные защитные механизмы и release-gates реализованы, но production-критерии Phase 10 не достигнуты. Реальные mobile p75 Web Vitals, production-like Preview, окончательная политика зависимостей и доступность frozen palette не подтверждены.

## Бюджет публичного JavaScript

`scripts/check-public-js-budget.mjs` читает production runtime manifest React Router и считает уникальные initial entry/root/route imports, общий `/theme.js` и route-specific legacy scripts. `/app.js`, который пока загружается только на главной во время Visual Freeze, включён явно; независимый review обнаружил и закрыл его первоначальный пропуск.

Базовый бюджет всех публичных маршрутов: `580 KiB` raw и `160 KiB` gzip. Для главной действует прозрачный переходный override `680 KiB` raw и `185 KiB` gzip, потому что она всё ещё несёт `/app.js`. Этот override не ослабляет остальные маршруты.

| Маршрут | Raw | Gzip |
| --- | ---: | ---: |
| `/catalog` | 530,2 KiB | 146,7 KiB |
| `/city/:citySlug` | 530,3 KiB | 146,8 KiB |
| `/favorites` | 528,7 KiB | 146,1 KiB |
| `/help` | 414,6 KiB | 128,1 KiB |
| `/` | 621,4 KiB | 166,7 KiB |
| `/login` | 528,7 KiB | 146,1 KiB |
| `/profile` | 528,5 KiB | 146,0 KiB |
| `/register` | 528,7 KiB | 146,1 KiB |
| `/venue/:venueSlug` | 538,6 KiB | 149,2 KiB |

Безопасно удаляемой direct dependency не найдено. Vite `8.2.0` и вложенный Vite `7.3.6` относятся к tooling graph через `vite-node`/`@react-router/dev`, а не к двум копиям публичного runtime. React, React DOM, React Router и Zod deduplicated.

Бюджет измеряет передаваемые внешние JavaScript-файлы. Он не заменяет mobile p75 LCP/INP/CLS, inline hydration data, parse/execute time и реальную сеть. Эти измерения не выполнялись без production-like environment.

## Security headers и CSP

Единый source-controlled contract находится в `config/security-headers.json` и применяется первым catch-all route Vercel, CommonJS API router и React SSR responses. Тест требует точного совпадения Vercel-конфигурации с canonical JSON.

Настроены:

- CSP с `default-src 'self'`, `base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, запрещёнными workers/frames и без `unsafe-eval`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` с отключёнными camera, microphone, geolocation, payment и USB.

Полный browser Phase 8 сначала обнаружил, что слишком узкий `connect-src 'self'` блокировал Google Fonts preconnect. Policy исправлена до точных `fonts.googleapis.com` и `fonts.gstatic.com`, после чего Phase 8 прошёл полностью.

Оставшиеся CSP-компромиссы зафиксированы явно: `unsafe-inline` нужен текущей hydration/inline-style/legacy совместимости, а images допускают HTTPS origins. До production cutover следует перейти на nonce/hash policy и, по возможности, ограничить image origins.

## Admin session

Новые admin tokens получили отдельные `typ`, `aud`, `version`, случайный 128-bit `jti`, строгие `sub`/role/`iat`/`exp` и максимальный срок 12 часов. Отклоняются claim confusion, future `iat`, `exp <= now`, лишние token segments и слишком длинная сессия. Admin secret обязан иметь минимум 32 символа и отличаться от customer session secret. Malformed cookies игнорируются без падения auth path; legacy tokens принимаются только в ограниченном 12-часовом окне.

`jti` пока stateless. Немедленный серверный отзыв конкретной admin session требует shared denylist/session store либо проверяемого `session_version`; process-local imitation намеренно не добавлена.

## XSS, приватные данные и security coverage

- Client React source gate запрещает `dangerouslySetInnerHTML`, assignment в `innerHTML`, `eval` и `new Function` вне server-only modules.
- Production bundle scanner проверяет 43 client assets на имена server secrets, high-signal token formats и фактические непустые значения чувствительных environment variables длиной не менее 16 символов. Значения никогда не печатаются. Проверка фактических значений добавлена после независимого review.
- Существующие tests покрывают same-origin/CSRF guards, OAuth state/expiry/provider mismatch, upload signatures/dimensions/size budgets и deny-by-default role boundaries.
- Отдельного полноценного stored-XSS E2E для authenticated merchant/admin content пока нет.

`npm.cmd audit --omit=dev` возвращает `5 high`, `3 moderate`, `0 critical`. High — React Router RSC Mode CSRF advisory `GHSA-qwww-vcr4-c8h2`; RSC в текущем `react-router.config.ts` не включён, но исправление требует несовместимого major `8.3.0`. Moderate — AJV `$data` ReDoS через `@vercel/static-config`, доступного fix нет. Слепой major upgrade не выполнялся; красный audit остаётся release decision/blocker.

## Accessibility и браузерная регрессия

Локальный аудит подтвердил существующие native dialogs, focus handling, labels/live regions, pending `disabled`/`inert`, keyboard contracts и reduced-motion coverage. Axe-проверки охватывают public/customer/merchant/admin scenarios. Известный `color-contrast` debt frozen palette не исправлялся скрытым редизайном: Visual Freeze запрещает менять цвета без отдельного согласования владельца.

Полные Chromium-регрессии без snapshot update:

- Phase 8: `57 passed / 105 skipped`;
- Phase 7: `58 passed / 98 skipped`;
- Phase 6: `19 passed / 59 skipped`;
- Phase 5: `28 passed / 52 skipped`;
- Phase 4: `16 passed / 24 skipped`.

Phase 6 controlled outage allowlist ограничен точной парой `/api/auth/session` + `503` только внутри соответствующего сценария; обязательный `/login` + `500` по-прежнему должен наблюдаться. Повторный targeted run и полный suite прошли.

## Проверки

- `npm.cmd run check`: Phase 6–10 syntax, React Router typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: `99/99` server и `113/113` unit/contract/component tests прошли.
- `npm.cmd run smoke`: production build, public JS budgets, 43-asset client secret scan и coexistence smoke прошли.
- `git diff --check`: чисто; Windows выводит только ожидаемые CRLF notices.
- CSS, frozen screenshots и snapshot baselines не менялись.

## Незакрытые критерии Phase 10

Это исходный список на дату checkpoint. Последующий update ниже supersedes code-only пункты про CSP nonce, shared admin revocation, authenticated stored-XSS coverage и telemetry wiring; внешние измерения и release acceptance он не заменяет.

1. Разблокировать production-like Preview и измерить mobile p75 LCP, INP и CLS на реальных маршрутах/данных.
2. Принять и выполнить отдельную accessibility-задачу для contrast debt без нарушения Visual Freeze.
3. Убрать CSP `unsafe-inline` через nonce/hash-compatible SSR и сузить разрешённые image origins.
4. Добавить shared server-side revocation для admin sessions.
5. Добавить authenticated stored-XSS E2E для merchant/admin content.
6. Принять release-решение по React Router/AJV advisories и добиться согласованного audit gate.
7. Добавить route/request correlation id и production telemetry без токенов, cookies и персональных секретов.

Vercel Preview по-прежнему заблокирован `TEAM_ACCESS_REQUIRED` для Git author предыдущего deployment. Platform check не обходился. Database migrations, merge, production deployment и aliases отсутствуют.

Кодовый откат: `git revert ddff8daff8d702bb6c6cebaad7e810a5e26b2d03`. Git не откатывает внешние provider settings, secrets, sessions или telemetry data.

## Follow-up Phase 12 — 8 августа 2026 года

На момент follow-up эта запись заменяла только устаревшие численные показатели checkpoint выше, не переписывая его исторический контекст. Текущий release status теперь ведётся в Phase 12.

- Главная больше не загружает `/app.js`; переходный `680/185 KiB` override удалён. Все public routes используют единый бюджет `580 KiB raw / 160 KiB gzip`.
- Главная на этом checkpoint: `508,4 KiB raw / 152,1 KiB gzip`; максимальный измеренный public route (`/venue/:venueSlug`) — `522,9/156,4 KiB`.
- Secret scanner проверил 49 production client assets, включая фактические непустые sensitive environment values с redacted reporting.
- API router создаёт или сохраняет валидный UUID `X-Request-ID`; server adapters пересылают только allowlisted same-origin correlation header.
- Application JSON limit измеряет authoritative raw body или восстановленный Vercel stream, а не нормализованный объект. Oversize возвращает `413`, invalid/mismatched `Content-Length` — `400`; lazy `req.body` getter не уничтожает исходное byte evidence.
- Внутренний typed HTTP seam использует `redirect: manual`; sitemap response ограничивается во время чтения фактического UTF-8 потока, отменяет остаток при overflow и валидируется Zod-контрактом до 50 000 canonical slug.
- Oversize request stream дренируется после раннего отказа, поэтому handler возвращает контролируемый `413`, а не `ECONNRESET`; это подтверждено реальным loopback HTTP regression.
- Нормальный anonymous customer session представлен успешным `200 {authenticated:false}`; защищённые операции и неверные credentials сохраняют `401`.
- `npm audit --omit=dev --audit-level=high` проходит с `0 high / 0 critical`; остаются 3 moderate AJV `$data` ReDoS через `@vercel/static-config`, fix отсутствует.
- Exact Chrome Visual Freeze без snapshot update: Phase 4 `23/52`, Phase 5 `35/80`, Phase 6 `28/104`, Phase 7 `64/128`, Phase 8 `57/105` (passed/expected skipped).

Не закрыты production-критерии: реальные p75 LCP/INP/CLS, nonce/hash CSP, shared admin revocation, authenticated stored-XSS E2E и provider telemetry. Они остаются внешними/отдельными release blockers и не маскируются локальными тестами.

## Superseding update — 9 августа 2026 года

Эта запись заменяет только устаревший текущий статус security/observability debt в checkpoint и follow-up выше. Их исторические результаты и численные показатели не переписываются.

- React SSR теперь создаёт отдельный cryptographic base64 nonce на каждый SSR render/cache fill, добавляет его в `script-src` и `style-src` и передаёт React Router для SSR scripts/styles. CDN HIT может повторно отдать уже закешированные body и CSP с тем же nonce до revalidation; это не заявляется как уникальность каждой edge-доставки. `unsafe-inline` удалён из `script-src` и общего `style-src`; узкий `style-src-attr 'unsafe-inline'` пока сохранён для существующих inline style attributes. `img-src` по-прежнему допускает `data:`, `blob:` и произвольный HTTPS origin, поэтому его сужение остаётся отдельным debt. Статический CSP снят с Vercel catch-all, чтобы не конфликтовать с render-specific policy.
- Production build подключает Vercel Analytics и Speed Insights на public, merchant и admin surfaces. Dynamic paths сворачиваются в ограниченные route templates, неизвестные paths — в `/[unmatched]`; это не доказательство фактических Web Vitals без внешнего deployment и трафика.
- API/SSR telemetry пишет только bounded structured fields: UUID request id, route template, method, status, duration, cold-start flag, error name и валидированный ограниченный `x-vercel-id`. Query, request/response bodies, cookies, tokens и пользовательские идентификаторы не логируются. На Vercel события включаются автоматически, `MESTO_TELEMETRY_LOGS=1` предназначен только для локальной диагностики.
- Shared admin-session revocation реализован через Upstash-compatible Redis REST. Redis key содержит SHA-256 digest `jti`/token, TTL ограничен остатком session lifetime; logout сохраняет revocation до очистки cookie. Production запрещает memory adapter и fail closed с `ADMIN_SESSION_UNAVAILABLE`, если shared provider недоступен. Можно переиспользовать `MESTO_RATE_LIMIT_REDIS_*` либо задать отдельные `MESTO_ADMIN_SESSION_REDIS_*`.
- Fixture-backed authenticated merchant/admin stored-XSS E2E проверяют production React rendering: сохраняют вредоносно выглядящий menu/venue payload в персистентном test fixture, подтверждают inert text до и после reload, отсутствие injected node и нулевой execution marker. Реальные production handlers/Supabase этим тестом не считаются проверенными.
- Nonce-часть прежнего критерия 3 и code-only части критериев 4, 5 и 7 закрыты. Сужение image origins, согласованная accessibility-задача для frozen palette, внешние env/provider acceptance, фактические Analytics/Speed Insights и structured telemetry, mobile p75 Web Vitals, migrations, load gates и representative `EXPLAIN` остаются незавершёнными.
- Финальная локальная проверка 10 августа: `165/165` server и `202/202` unit tests, `npm run check`, production smoke и полный последовательный `npm run test:e2e` (legacy + Phase 4–8) прошли без обновления snapshots.

Этот update не является production-readiness или production-like acceptance.
