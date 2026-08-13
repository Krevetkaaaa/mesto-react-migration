# Этап 12. Переключение и очистка

Дата текущего checkpoint: 13 августа 2026 года.

Статус: release candidate опубликован в Draft PR, привязан к exact immutable Preview и прошёл опубликованные локальные и GitHub CI ворота, включая frozen exact-Chrome Visual Freeze. Изолированные Preview Supabase/Redis готовы, а все семь Preview migrations применены и сверены. Сохранённый provider-backed acceptance завершился `FAIL`, но полностью завершил cleanup: единственная workflow-ошибка была в невозможном клиентском требовании публичного `Vercel-Cache-Tag`, который Vercel штатно удаляет из ответа. Oracle исправлен в working tree под публичный и более строгий контракт `HIT(old) → STALE(old) → HIT(new)` с неизменным контрольным venue; новый commit/deployment и полный повторный acceptance обязательны. Production deployment, alias, data и migrations не изменялись, PR не merged.

## Текущий checkpoint — 13 августа 2026 года

Этот раздел является единственным текущим статусом. Checkpoints 8–11 августа ниже сохранены как исторические доказательства и считаются superseded там, где их утверждения противоречат этому разделу.

- GitHub topology: `main` указывает на baseline `ee8476473b64de946d81dc1adbcd7dc3871e4ac9`; Draft PR [#1](https://github.com/Krevetkaaaa/mesto-react-migration/pull/1) направлен из `codex/react-migration` в `main`. Текущий опубликованный release commit — `5427a689c47635751ca76ba543bb15318932ca1b`; отдельный detached release worktree на этом SHA чистый.
- Branch protection для `main` требует оба точных job-name, strict status checks, conversation resolution и применяется к администраторам; force-push/delete запрещены. Для `5427a68` оба дублирующих quality job прошли. Push-triggered exact-browser job прошёл сразу; PR-triggered job один раз завершился runner/browser teardown-сбоем после успешного sibling run и прошёл целевой rerun на том же SHA. Текущий required-check snapshot зелёный.
- Свежий полный локальный rerun текущего working tree: `git diff --check` — PASS; `npm run check` — PASS; `npm test` — `320/320` server и `203/203` Vitest; `npm run smoke` — PASS. Targeted Preview acceptance suite — `44/44`. `npm run audit:production` проходит high-severity gate; остаются три транзитивных `moderate` AJV без доступного исправления.
- Текущий полный exact-Chrome E2E/Visual Freeze прошёл в GitHub CI на проверенном Chrome for Testing `151.0.7922.72` и SHA-256 архива из workflow, без snapshot update. Локальный Chrome `151.0.7922.76`, используемый acceptance-browser oracle, является отдельным runtime-доказательством и не подменяет frozen visual gate.
- Изолированный Preview Supabase имеет ref `foxqdoyqcfsqngfotayu`. До изменения БД создан provider-backed snapshot 12 известных public tables и Storage bucket metadata; он хранится вне репозитория: `C:\Users\kir21\AppData\Local\Temp\mesto-preview-backup-20260811\data-and-buckets.json`. На момент backup строки в известных таблицах отсутствовали.
- Только в Preview применены и сверены с remote history все семь migrations: `20260728_external_identities.sql`, `20260808_public_catalog_summary.sql`, `20260810222309_direct_signed_media_pipeline.sql`, `20260811160000_media_publication_fencing.sql`, `20260811163000_signed_upload_tombstones.sql`, `20260811185937_submission_media_cleanup_receipts.sql`, `20260811212027_venue_media_cleanup_receipts.sql`. Production migrations не применялись.
- Direct signed media flow, private review derivatives, approval-only immutable publication, durable cleanup и protected manual Preview media reaper реализованы в коде. Acceptance создаёт два signed receipts, использует один общий latest-deadline wait около `2 h 6 min`, сначала очищает обычные media/venue artifacts, затем требует exact reaper counts `{recovered:0,public:0,staging:1,review:0,expired:1}` и owner-scoped status `exists:true → false`, и только после этого завершает sessions.
- Protected reaper использует только env-only `MESTO_ACCEPTANCE_CRON_SECRET`; его unauthenticated/authenticated proof подтверждает handler/auth/provider reachability конкретного Preview deployment, но не доказывает настройку или выполнение Production schedule. Persisted acceptance завершился 12 августа с exit `1`, `passed:false`, единственной workflow-ошибкой `cache.warm-a/CACHE_TAG_CONTRACT_MISSING` и `cleanup.complete=true` без cleanup failures. Media sign/PUT/finalize/moderation и exact reaper proof прошли; browser stored-XSS oracle не запускался, потому что ошибочный cache warmup остановил workflow до создания menu/promotion. После исправления oracle требуется новый exact deployment и полный повторный acceptance; PASS не заявляется.
- Preview получил физически отдельный временный Free Redis, namespace `preview`; его provider fingerprint отличается от Production. Acceptance и load fail closed на shared/mismatched provider. Временный Preview Redis истекает 14 августа 2026 года: после этого текущие remote-доказательства нельзя считать действующими без замены provider, нового deployment/fingerprint и повторных gates.
- Exact READY Preview: `dpl_6hdWFZ4jjV8CsuiHZCXVTeXwm8Es`, immutable origin `https://mesto-city-guide-rzxk98vtr-krevetkaaaas-projects.vercel.app`, commit `5427a689c47635751ca76ba543bb15318932ca1b`. Production runtime Supabase ref определён read-only trace как `aelqtfzjvahpsdkabtny`; это не означает готовность следующего Production deploy. Future Production environment preflight остаётся красным, как минимум не подтверждены `MESTO_RELEASE_TARGET=production`, `MESTO_SUPABASE_PROJECT_REF`, `CRON_SECRET` и скрытые значения обязательных secrets. Production deployment/alias, data, migrations и PR merge не выполнялись.
- После strict acceptance остаются exact expected → 300-VU burst → soak edge-document load gate, дополнительный accessibility-first exploratory browser QA, свежий read-only reviewer и явное визуальное одобрение владельца. Реальные field p75 Web Vitals и provider dashboard/trace evidence не выводятся из лабораторного load JSON и остаются отдельными внешними воротами.

## Владение маршрутами

- React Router SSR/hydration обслуживает главную, help, catalog/city/venue, customer account, merchant и admin surfaces.
- Главная больше не подключает runtime `/app.js`; merchant и admin не подключают `/merchant.js` и `/admin.js`.
- `/theme.js` остаётся отдельным общим progressive-enhancement script и не возвращает legacy ownership страницам.
- Legacy HTML/JS сохраняются только как rollback inputs и test fixtures до подтверждённого стабильного периода. Их наличие в репозитории не означает загрузку пользователям.
- `robots.txt` и `sitemap.xml` являются SSR resource routes и используют доверенный `MESTO_PUBLIC_ORIGIN`.

## Обязательная конфигурация Preview и production

Секреты не записываются в Git, логи или client bundle. Для отдельного production-like Preview нужны:

- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` для изолированной базы и Storage;
- отдельные сильные `MESTO_USER_SESSION_SECRET` и `MESTO_ADMIN_SESSION_SECRET`;
- `MESTO_ADMIN_LOGIN` и `MESTO_ADMIN_PASSWORD_HASH` для admin acceptance;
- `MESTO_ACCEPTANCE_CRON_SECRET` только в environment запуска acceptance runner: raw value уже trimmed, длина не меньше 32 символов, без CLI fallback и вывода в report/error;
- `MESTO_PUBLIC_ORIGIN`, равный проверяемому публичному origin;
- `MESTO_RATE_LIMIT_PROVIDER=upstash-redis`, credential-free HTTPS `MESTO_RATE_LIMIT_REDIS_URL` и `MESTO_RATE_LIMIT_REDIS_TOKEN`;
- `MESTO_ADMIN_SESSION_REVOCATION_PROVIDER=upstash-redis`; отдельные `MESTO_ADMIN_SESSION_REDIS_URL` / `MESTO_ADMIN_SESSION_REDIS_TOKEN` нужны только при отказе от переиспользования rate-limit Redis;
- `MESTO_CACHE_PURGE_PROVIDER=vercel` только внутри Vercel Preview/Production Function runtime;
- OAuth variables только для реально включённых providers: `VK_ID_APP_ID`, при необходимости `VK_ID_SERVICE_TOKEN`, `YANDEX_OAUTH_CLIENT_ID`, `YANDEX_OAUTH_CLIENT_SECRET`.

Analytics и Speed Insights не требуют application secrets. Vercel request telemetry включается platform runtime; `MESTO_TELEMETRY_LOGS=1` используется только для локальной диагностики и не подменяет provider acceptance.

Memory rate limiter и memory admin-session revocation запрещены в production. Отсутствие shared provider должно оставаться контролируемым `503 RATE_LIMIT_UNAVAILABLE` / `503 ADMIN_SESSION_UNAVAILABLE`, а не скрытым process-local fallback.

## Database и provider шаги для production

Preview-подготовка и её backup зафиксированы в текущем checkpoint выше. Для production эти шаги выполняются отдельно, только после зелёного Preview и проверки backup/PITR:

1. Проверить точный production project ref, сделать пригодный для восстановления backup и зафиксировать rollback owner.
2. Выполнить dry-run и применить только отсутствующие versioned migrations из `supabase/migrations/` по инструкции `supabase/README.md`.
3. Подключить shared Redis/KV и подтвердить один rate-limit window между несколькими runtime instances.
4. Подтвердить отзыв одной admin session через logout между несколькими runtime instances, не отзывая параллельную session.
5. Включить Vercel tag purge и проверить `HIT → mutation → STALE/revalidation`, включая отсутствие invalidation у несвязанных venue.
6. Выполнить `scripts/phase9-catalog-explain.sql` на репрезентативном non-production snapshot и сохранить планы без пользовательских данных.
7. Не включать production alias, пока Preview acceptance ниже не завершён.

## Preview acceptance

Для exact commit обязательны:

Для текущего exact Preview backup/rollback уже создан, все семь migrations применены и remote history сверена, как зафиксировано в checkpoint выше. Перед любым новым Preview это доказательство нужно переснять; Production при этом не изменяется.

1. `npm ci`, `npm run check`, `npm test`, `npm run smoke` и все Phase 4–8 functional E2E.
2. Зелёная Visual Freeze matrix на закреплённом браузере и всех утверждённых viewport без необъяснённого snapshot update.
3. Ручные customer, merchant и admin сценарии с тестовыми ролями; logout и очистка test sessions после проверки.
4. Фактические cache headers и Vercel tags для public documents/API, tag purge после mutation и `private, no-store` для персональных/admin responses.
5. Каталог, venue, favorites, review и submission с provider-backed API без `RATE_LIMIT_UNAVAILABLE`.
6. Mobile p75 LCP <= 2.5 s, INP <= 200 ms и CLS <= 0.1 на согласованном наборе маршрутов.
7. Expected и burst load profiles по заранее зафиксированным SLO; soak запускается только после зелёного burst.
8. Goal-driven browser QA свежим независимым reviewer и устранение всех P0/P1.
9. SSR render/cache-fill-specific CSP nonce без `unsafe-inline` в `script-src`/общем `style-src` и отсутствие CSP violations на полном browser flow.
10. Shared Redis revocation между runtime instances и authenticated merchant/admin stored-XSS E2E.
11. Analytics, Speed Insights и bounded API/SSR telemetry без query, body, cookies, tokens и пользовательских идентификаторов; фактические provider events проверяются во внешнем dashboard.
12. Mutation-capable acceptance создаёт ровно два signed receipts и после одного общего expiry/grace wait выполняет ordinary cleanup → protected manual Preview reaper → logouts. Reaper обязан дать exact isolated counts и owner-scoped `exists:true → false`; это handler/auth/provider proof, а не Production schedule proof.
13. Ссылка на Preview передаётся владельцу; production cutover разрешён только после его явного визуального одобрения.

## Локальный release-candidate checkpoint 8 августа 2026 года (историческая запись)

Проверено 8 августа 2026 года на Node.js 24 и exact Chrome for Testing `151.0.7922.72` с SHA-256 архива `F77DFDF2978865CD1B8B98BD6FF72839E91650B9CBF43051F54C1A0811C183E5`:

- `npm.cmd run check` прошёл: syntax gates, React Router typegen, strict TypeScript и ESLint;
- `npm.cmd test` прошёл: `148/148` server и `189/189` unit/contract/component tests;
- `npm.cmd run smoke` прошёл: production SSR/client build, 50-asset secret scan, route ownership и public JavaScript budget;
- главная занимает `508,8 KiB raw / 152,2 KiB gzip` при общем лимите `580/160 KiB`; максимальный public route занимает `522,9/156,4 KiB`, отдельный legacy override удалён;
- Phase 4: `23 passed / 52 expected skipped`; Phase 5: `35/80`; Phase 6: `29/109`; Phase 7: `64/128`; Phase 8: `57/105`;
- frozen screenshots не обновлялись; Visual Freeze главной, help, catalog/city/venue, account, merchant и admin зелёный;
- свежий независимый Sol Ultra black-box прошёл customer, mobile keyboard/a11y, theme, merchant и admin charters; post-fix повтор `/ → /catalog → /venue` завершился с `0` console errors, `0` page errors и без неожиданных `4xx/5xx`;
- независимый финальный release review завершён вердиктом `SHIP`: P0/P1 не осталось;
- CommonJS Vercel gate с `--no-experimental-require-module` прошёл;
- production dependency audit: `0 high`, `0 critical`, `3 moderate` в транзитивном AJV через `@vercel/static-config`, доступного исправления нет.

Release-candidate опубликован без переписывания истории: основной commit `398c4d8446d593e2976f1590275f4851d09c3fdf`, Vercel navigation fix `0b8f9e6a8675e09842479ea57f3c7113052e91b8`, переносимый Visual Freeze gate `562e55f1932d1c53cf72bb27f86351baa20bff87`, Phase 4 CI helper fix `68575fbc659163cc853053ac6ff59e9a32e8d1dd`, единый Phase 4–8 visual contract `f00ee7afd40107a5a8d6d3ecf10bd7d330951e98` и timezone-stable SSR fix `3fb5b760f71833f83d04c1a6689519f3df9147b7`. READY Preview `dpl_7VfMiovccjuhUTuc9RFLVaoVrh9q` доступен по `https://mesto-city-guide-c8yeinpgi-krevetkaaaas-projects.vercel.app`. React Router включает полный initial route manifest, поэтому клиентская навигация не зависит от недоступного в явной Vercel route table `/__manifest`. Frozen snapshots не перезаписывались; cross-host допуск `3 000` пикселей документирует только подтверждённую субпиксельную растеризацию Windows 11/Windows Server (максимум `2 615` пикселей), а размеры и полный документ проверяются отдельно. Admin/merchant date text форматируется в явной product timezone `Europe/Simferopol`, поэтому Node SSR в UTC и браузер гидратируют один и тот же текст.

Главная теперь полностью hydrated React route: featured venues, search, mobile navigation, favorites, reviews и venue submission не зависят от runtime `/app.js`. Безопасный `returnTo`, восстановление фокуса, canonical image URLs, стабильные legacy venue keys и pending single-flight формы покрыты unit и browser regressions.

Route-диалоги входа, регистрации и избранного закрываются replacement-навигацией: кнопка Back не открывает закрытый dialog повторно, а клавиатурный фокус после монтирования главной возвращается на соответствующий логический trigger. Регрессия проверяет Enter, Escape, close button, историю и оба account-состояния.

SEO-контракт использует отдельный `/api/venue-sitemap`: provider-safe страницы по 1000 slug с exact-count consistency до стандартного лимита 50 000 URL, общий public-read limiter, запрет cache-busting query и redirect-follow, потоковое ограничение ответа, проверку уникальности/canonical form и `503 no-store` для неполной выборки. Query-варианты `/sitemap.xml` канонизируются `308` до обращения к каталогу; входные home query-параметры больше не могут разогнать server-side pagination.

API router выдаёт/сохраняет UUID `X-Request-ID`. JSON body limit считает фактические raw/stream bytes, включая пробелы, escape и повторные ключи; mismatch `Content-Length` отклоняется, а oversize возвращает настоящий `413` без socket reset. Общий HTTP seam не следует redirects и останавливает чтение sitemap response сразу при превышении фактического UTF-8 byte cap. Нормальная анонимная проверка customer session возвращает `200 {authenticated:false}`, поэтому публичная навигация не загрязняет консоль ожидаемыми `401`.

## Блокеры checkpoint 8 августа 2026 года (историческая запись)

- Последний READY Preview имеет только OAuth variables. `/api/venues` и `/api/venues?summary=1` поэтому честно возвращают `503 RATE_LIMIT_UNAVAILABLE`; Supabase/session/shared limiter acceptance не выполнен.
- Формальный локальный 300-VU burst ранее провалил SLO; soak не запускался. Loopback fixture не моделирует Vercel edge cache, Supabase или distributed limiter.
- Production-like Web Vitals, representative `EXPLAIN`, CDN purge, direct signed media upload/derivatives и provider telemetry отсутствуют.
- Visual Freeze локального release candidate зелёный на exact baseline browser; это не заменяет визуальное одобрение владельца нового Preview.
- Shared admin revocation, nonce/hash CSP и authenticated stored-XSS E2E остаются отдельным security debt.
- Provider-safe offset pagination sitemap не является единым DB snapshot при конкурентных insert/delete с неизменным total; для строгой согласованности нужен versioned/materialized snapshot либо отдельный DB RPC.
- `X-Request-ID` у shared-cacheable origin response обозначает запрос, заполнивший CDN cache, и может повторяться на cache hits; per-edge и origin/cache-fill correlation необходимо разделить перед provider telemetry acceptance.
- Если одна из последовательных загрузок изображения либо создание venue submission завершается ошибкой, уже загруженный объект требует TTL temporary namespace или компенсирующего удаления; direct signed upload/derivatives остаются внешним Phase 9 debt.
- Владелец ещё не одобрил финальный Preview.

## Superseding update — 9 августа 2026 года (историческая запись)

Список выше сохранён как часть checkpoint 8 августа. Его утверждения об отсутствии cache-tag adapter, CSP nonce, shared admin revocation, stored-XSS E2E и bounded telemetry superseded текущим tree:

- code-only закрыты SSR render/cache-fill-specific CSP nonce, Vercel Analytics/Speed Insights wiring, bounded API/SSR telemetry, shared Redis admin-session revocation, fixture-backed authenticated merchant/admin stored-XSS E2E для production React rendering, Vercel cache tags/project-scoped tag purge adapter и безопасный server-validated upload fallback; реальные handlers/Supabase stored-XSS acceptance остаются внешней проверкой;
- tag purge пока только запрашивается кодом: фактический CDN effect и изоляция tags должны быть проверены в Vercel Preview;
- direct signed staging upload, lifecycle cleanup, derivatives и immutable media CDN headers не реализованы; существующий fallback остаётся server-mediated и authoritative-validated;
- внешний Preview всё ещё требует Supabase/session/shared Redis env и применения согласованной migration; Preview-only `MESTO_CACHE_PURGE_PROVIDER=vercel` уже добавлен, но фактический runtime purge/CDN state ещё не проверен и database state этим update не менялся;
- формальный burst/soak, реальные mobile p75 Web Vitals, фактические Analytics/Speed Insights и structured provider telemetry, representative `EXPLAIN`, owner approval, merge, production deployment и alias остаются незавершёнными;
- snapshot-consistent sitemap, разделение edge request id и origin/cache-fill correlation, сужение CSP image origins и согласованная accessibility-задача для frozen palette также не закрыты этим update;
- финальная локальная проверка 10 августа дала `165/165` server и `202/202` unit tests; `npm run check`, production smoke и полный последовательный `npm run test:e2e` (legacy + Phase 4–8) прошли без snapshot update.

На момент этой исторической записи tree оставался code-only release candidate и не объявлялся production-like или production готовым.

## Superseding Preview acceptance раннего commit — 11 августа 2026 года (историческая запись)

Этот раздел описывает acceptance commit `a27f58e71ba981e79e9dee7815c58622deda0441` и заменяет только более ранние утверждения checkpoint 8–9 августа о не настроенном Preview, `RATE_LIMIT_UNAVAILABLE` и отсутствующем `EXPLAIN`. Он не доказывает состояние более позднего `e44cfd1` или текущего working tree.

- GitHub handoff оформлен Draft PR [#1](https://github.com/Krevetkaaaa/mesto-react-migration/pull/1): base `baseline/pre-react-migration-20260805` (`ee847647`) → head `codex/react-migration` (`a27f58e`). PR mergeable, merge state `CLEAN`; оба PR-triggered jobs — `Types, tests, and production smoke` и `Exact-browser functional and Visual Freeze` — завершились `SUCCESS` без snapshot update.
- Новый Vercel Preview `dpl_A5sZXUDyWBFMe4nrm94cC3TN3tRg` имеет состояние `READY` и доступен по `https://mesto-city-guide-4487ynk4t-krevetkaaaas-projects.vercel.app`. Production alias не переключался.
- Для Preview созданы отдельные Free-ресурсы `mesto-preview-supabase` и `mesto-preview-rate-limit` (Upstash Redis). Production variables и production resources не изменялись. В Preview Supabase применён полный `supabase/schema.sql`, включая `public_catalog_summary()` и bucket `venue-submissions`; production data не копировались и тестовые строки не сохранялись.
- Runtime acceptance прошёл: `/api/venues?summary=1` и `/api/venues?results=1` возвращают `200`, `databaseConfigured:true`, `source:"database"`; `/api/venue-sitemap` возвращает `200`, `complete:true`; `/api/auth/providers` возвращает `200` с `email:true`; гостевая `/api/auth/session` возвращает `200 {authenticated:false}`; неверный admin login возвращает ожидаемый `401`, а не provider/configuration `503`.
- `/`, `/catalog`, `/venue/barkas`, `/sitemap.xml` и `/robots.txt` возвращают `200`; query-вариант sitemap канонизируется `308` на `/sitemap.xml`. Повторные home/summary/sitemap запросы подтверждены как Vercel CDN `HIT`.
- Distributed limiter доказан 31 одновременным cache-miss запросом с одного источника: ровно `30 × 200` и `1 × 429 RATE_LIMITED`, `RateLimit-Limit: 30`, `RateLimit-Remaining: 0`, положительные `RateLimit-Reset`/`Retry-After`, `Cache-Control: no-store`. Runtime logs показали минимум два cold start при едином общем лимите, то есть это не process-local memory bucket.
- Structured telemetry содержит парные `api.request.start`/`api.request.complete` для всех 36 origin API-запросов acceptance-run, `0` неожиданных `5xx`, UUID request correlation и отсутствие body/cookie/password/token/e-mail/query-string полей.
- На целевой Preview-БД выполнен безопасный representative-scale `EXPLAIN (ANALYZE, BUFFERS)` на временной таблице с тем же schema/index contract и 20 000 синтетических строк: catalog list использовал `status,city,category,created_at` index (`50` rows, около `1.4 ms`), detail — unique slug index (около `0.09 ms`), summary aggregation завершилась примерно за `19 ms`. Временная таблица удалена с завершением сессии; постоянные строки не менялись.
- Встроенный Codex Browser отказался открывать защищённый Preview из-за своей URL policy; обход через другой browser/CDP намеренно не выполнялся. Browser layer остаётся подтверждён PR-triggered exact Chrome CI и ранее выполненным независимым black-box QA, а этот deployment дополнительно проверен на HTTP/API/data/runtime границах.

На момент этой исторической проверки незавершёнными оставались явное визуальное одобрение владельца, formal remote burst/soak, реальные mobile p75 Web Vitals, фактическая mutation→tag-purge проверка, direct signed media pipeline/derivatives и production promotion. Актуальный набор ворот приведён в текущем checkpoint в начале документа.

## Откат

- До следующего deployment последняя проверенная историческая точка платформенного отката — READY Preview `dpl_A5sZXUDyWBFMe4nrm94cC3TN3tRg`; предыдущий READY Preview `dpl_7VfMiovccjuhUTuc9RFLVaoVrh9q` сохранён, production alias ни на один из них не переключался. Ни один из этих deployments не доказывает текущий working tree.
- Phase 12 откатывается новыми revert-коммитами в обратном порядке: `3fb5b760f71833f83d04c1a6689519f3df9147b7`, `f00ee7afd40107a5a8d6d3ecf10bd7d330951e98`, `68575fbc659163cc853053ac6ff59e9a32e8d1dd`, `562e55f1932d1c53cf72bb27f86351baa20bff87`, `0b8f9e6a8675e09842479ea57f3c7113052e91b8`, затем `398c4d8446d593e2976f1590275f4851d09c3fdf`. Force push не используется. Более глубокий откат возможен на baseline tag `pre-react-migration-20260805-1916`.
- Vercel deployment/alias откатывается отдельно от Git. Environment variables и provider credentials возвращаются по сохранённому environment snapshot.
- Git не откатывает Supabase rows, Storage objects, Redis counters, sessions или OAuth/provider state. Database rollback/compensation описан рядом с migration и требует отдельного backup/restore решения.
- Legacy files удаляются только после стабильного периода. До этого откат route ownership не зависит от восстановления удалённых source files.
## Media implementation note — 11 августа 2026 года (историческая промежуточная запись)

На момент этой промежуточной записи direct signed upload, private review derivatives, compensating cleanup и approval-only immutable publication были реализованы только в коде. Позднее migration применена к Preview, как указано в текущем checkpoint выше; authenticated runtime acceptance текущего tree всё ещё не выполнен. Production не изменялась. Точные prerequisites находятся в `docs/PHASE9_MEDIA_CACHE_CONTRACT.md`.
