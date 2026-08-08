# Этап 12. Переключение и очистка

Дата локального checkpoint: 8 августа 2026 года.

Статус: локальный release candidate подготовлен и прошёл кодовые, функциональные и Visual Freeze ворота. Production cutover, production alias, внешние migrations и provider configuration не выполнялись. Этап нельзя объявить завершённым до production-like Preview с shared providers, нагрузочного SLO и явного одобрения владельца.

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
- `MESTO_PUBLIC_ORIGIN`, равный проверяемому публичному origin;
- `MESTO_RATE_LIMIT_PROVIDER=upstash-redis`, credential-free HTTPS `MESTO_RATE_LIMIT_REDIS_URL` и `MESTO_RATE_LIMIT_REDIS_TOKEN`;
- OAuth variables только для реально включённых providers: `VK_ID_APP_ID`, при необходимости `VK_ID_SERVICE_TOKEN`, `YANDEX_OAUTH_CLIENT_ID`, `YANDEX_OAUTH_CLIENT_SECRET`.

Memory rate limiter запрещён в production. Отсутствие shared provider должно оставаться контролируемым `503 RATE_LIMIT_UNAVAILABLE`, а не скрытым process-local fallback.

## Database и provider шаги

Внешние шаги выполняются только после отдельного разрешения и backup/PITR проверки:

1. Создать изолированный Preview project/data set без production PII.
2. Применить additive migration `supabase/migrations/20260808_public_catalog_summary.sql` по инструкции `supabase/README.md`.
3. Подключить shared Redis/KV и подтвердить один rate-limit window между несколькими runtime instances.
4. Выполнить `scripts/phase9-catalog-explain.sql` на репрезентативном non-production snapshot и сохранить планы без пользовательских данных.
5. Не включать production alias, пока Preview acceptance ниже не завершён.

## Preview acceptance

Для exact commit обязательны:

1. `npm ci`, `npm run check`, `npm test`, `npm run smoke` и все Phase 4–8 functional E2E.
2. Зелёная Visual Freeze matrix на закреплённом браузере и всех утверждённых viewport без необъяснённого snapshot update.
3. Ручные customer, merchant и admin сценарии с тестовыми ролями; logout и очистка test sessions после проверки.
4. Фактические cache headers для public documents/API и `private, no-store` для персональных/admin responses.
5. Каталог, venue, favorites, review и submission с provider-backed API без `RATE_LIMIT_UNAVAILABLE`.
6. Mobile p75 LCP <= 2.5 s, INP <= 200 ms и CLS <= 0.1 на согласованном наборе маршрутов.
7. Expected и burst load profiles по заранее зафиксированным SLO; soak запускается только после зелёного burst.
8. Goal-driven browser QA свежим независимым reviewer и устранение всех P0/P1.
9. Ссылка на Preview передаётся владельцу; production cutover разрешён только после его явного визуального одобрения.

## Локальный release-candidate checkpoint

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

## Текущие блокеры

- Последний READY Preview имеет только OAuth variables. `/api/venues` и `/api/venues?summary=1` поэтому честно возвращают `503 RATE_LIMIT_UNAVAILABLE`; Supabase/session/shared limiter acceptance не выполнен.
- Формальный локальный 300-VU burst ранее провалил SLO; soak не запускался. Loopback fixture не моделирует Vercel edge cache, Supabase или distributed limiter.
- Production-like Web Vitals, representative `EXPLAIN`, CDN purge, direct signed media upload/derivatives и provider telemetry отсутствуют.
- Visual Freeze локального release candidate зелёный на exact baseline browser; это не заменяет визуальное одобрение владельца нового Preview.
- Shared admin revocation, nonce/hash CSP и authenticated stored-XSS E2E остаются отдельным security debt.
- Provider-safe offset pagination sitemap не является единым DB snapshot при конкурентных insert/delete с неизменным total; для строгой согласованности нужен versioned/materialized snapshot либо отдельный DB RPC.
- `X-Request-ID` у shared-cacheable origin response обозначает запрос, заполнивший CDN cache, и может повторяться на cache hits; per-edge и origin/cache-fill correlation необходимо разделить перед provider telemetry acceptance.
- Если одна из последовательных загрузок изображения либо создание venue submission завершается ошибкой, уже загруженный объект требует TTL temporary namespace или компенсирующего удаления; direct signed upload/derivatives остаются внешним Phase 9 debt.
- Владелец ещё не одобрил финальный Preview.

## Откат

- До production cutover безопасная точка платформенного отката — READY Preview `dpl_7VfMiovccjuhUTuc9RFLVaoVrh9q`; production alias на него не переключался.
- Phase 12 откатывается новыми revert-коммитами в обратном порядке: `3fb5b760f71833f83d04c1a6689519f3df9147b7`, `f00ee7afd40107a5a8d6d3ecf10bd7d330951e98`, `68575fbc659163cc853053ac6ff59e9a32e8d1dd`, `562e55f1932d1c53cf72bb27f86351baa20bff87`, `0b8f9e6a8675e09842479ea57f3c7113052e91b8`, затем `398c4d8446d593e2976f1590275f4851d09c3fdf`. Force push не используется. Более глубокий откат возможен на baseline tag `pre-react-migration-20260805-1916`.
- Vercel deployment/alias откатывается отдельно от Git. Environment variables и provider credentials возвращаются по сохранённому environment snapshot.
- Git не откатывает Supabase rows, Storage objects, Redis counters, sessions или OAuth/provider state. Database rollback/compensation описан рядом с migration и требует отдельного backup/restore решения.
- Legacy files удаляются только после стабильного периода. До этого откат route ownership не зависит от восстановления удалённых source files.
