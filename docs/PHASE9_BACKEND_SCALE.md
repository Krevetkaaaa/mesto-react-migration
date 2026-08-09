# Этап 9. Backend-подготовка к росту

Дата локального checkpoint: 7 августа 2026 года.

Implementation commit: `dc8c9fbb4f4cdda46c343feb7d98d65f09889377`.

Статус этапа: локальные безопасные seams и проверки реализованы, но критерий завершения Phase 9 не достигнут. Внешний shared-state provider, репрезентативная база и production-like CDN/upload environment не предоставлены, поэтому distributed runtime и планы запросов не выдаются за проверенные.

## Superseding update — 9 августа 2026 года

Эта запись заменяет только устаревший текущий статус cache purge и upload fallback ниже. Исходный checkpoint 7 августа, его результаты и численные показатели сохранены как историческая запись.

- Code-only часть cache invalidation закрыта. Настроенные public API и React documents получают `Vercel-CDN-Cache-Control` и ограниченные tags `mesto-venues` / `mesto-venue-<uuid>`; post-commit seam вызывает project-scoped `invalidateByTag()` из `@vercel/functions` при `MESTO_CACHE_PURGE_PROVIDER=vercel` внутри Vercel Preview/Production Function runtime.
- Инвалидация ограничивает blast radius: menu/promotion mutation запрашивает purge entity tag, venue mutation — catalog и entity tags. Ошибка provider остаётся best-effort post-commit ошибкой и пишет только bounded событие `cache.purge.failed`, без slug, venue id, URL, token или response body.
- Поэтому исторический критерий 3 ниже разделён: adapter и cache-tag wiring реализованы кодом, но фактический `HIT → mutation → STALE/revalidation` и отсутствие purge у несвязанных venue всё ещё должны быть подтверждены во внешнем изолированном Preview.
- Безопасный upload fallback также закрыт только на code-only уровне: текущий server-mediated base64 flow сохраняет authoritative проверки encoded bytes, MIME/container signature, dimensions, `6 MiB` и `40 MP` до записи. Небезопасная заглушка в виде signed URL в public bucket не добавлялась.
- Direct signed staging upload, provider lifecycle cleanup, derivatives и подтверждённые immutable media headers остаются внешним Phase 9 критерием. Shared Redis runtime, provider configuration, database migration/state и representative `EXPLAIN` также не проверены этим update.
- Финальная локальная проверка 10 августа: `165/165` server и `202/202` unit tests, `npm run check`, production smoke и полный последовательный `npm run test:e2e` (legacy + Phase 4–8) прошли без обновления snapshots.

Ни Preview, ни production этим code-only update не объявляются готовыми.

## Публичное кеширование

- `json()` сохраняет явно заданный `Cache-Control`; безопасный default остаётся `no-store, max-age=0`.
- Успешные настроенные `GET /api/venues`, `GET /api/venues/:slug` и `GET /api/venue-content` используют `public, max-age=0, s-maxage=60, stale-while-revalidate=120`.
- Ответы получают weak SHA-256 ETag. `If-None-Match` возвращает `304` без повторного JSON body.
- Ошибки, отсутствие Supabase configuration, customer-private, merchant и admin responses не становятся публично кешируемыми.
- После publish/create/update/delete venue, menu и promotion вызывается best-effort post-commit invalidation seam. Его ошибка не превращает уже подтверждённую DB mutation в пользовательскую ошибку.
- По умолчанию invalidation adapter отсутствует и явно возвращает `configured: false`. Реальный CDN purge не имитируется. До подключения адаптера потенциальное shared stale window ограничено `60 + 120` секундами.

## Rate limiting

- Один async contract заменил независимые process-local `Map`.
- Memory adapter разрешён только local/test. `NODE_ENV=production` или `VERCEL_ENV=production` запрещают его.
- Подготовлен atomic Upstash-compatible Redis REST adapter: один `EVAL` увеличивает счётчик и назначает TTL. URL обязан быть credential-free HTTPS origin; token передаётся только в `Authorization`.
- Production без distributed configuration fail closed с контролируемым `503 RATE_LIMIT_UNAVAILABLE`; fallback на локальную память отсутствует.
- Политики разделены для public catalog/detail, login, registration, OAuth, upload и mutations. Authenticated mutations используют actor id только внутри SHA-256 key.
- `429` содержит `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` и `RateLimit-Reset`. Структурированная метрика содержит category/scope/hash, но не IP, login или исходный actor id.
- Provider configuration: `MESTO_RATE_LIMIT_PROVIDER=upstash-redis`, `MESTO_RATE_LIMIT_REDIS_URL`, `MESTO_RATE_LIMIT_REDIS_TOKEN`.

Тесты подтверждают contract, atomic command shape, provider-response validation, controlled `429/503`, запрет memory в production и отсутствие raw identifiers в метрике. Реальный provider не создавался и поведение между несколькими serverless instances не проверено.

## Каталог, поиск и база

- Page query выбирает только используемые поля вместо `select=*`.
- Порядок стабилизирован как `created_at.desc,id.desc`.
- `_` больше не проходит как пользовательский wildcard в `ILIKE`; остальные управляющие символы уже удалялись нормализацией.
- `count=exact` сохранён намеренно: текущий UI показывает точное «видно X из Y». Незаметная замена на estimate нарушила бы пользовательский контракт.
- Существующий индекс имеет форму `(status, city, category, created_at desc)` и не включает стабильный `id`; wildcard-поиск остаётся пятью `ILIKE` без `pg_trgm`/FTS.
- `scripts/phase9-catalog-explain.sql` содержит только профили `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` для базового, filtered, wildcard-search, deep-offset и exact-count запросов. Скрипт должен запускаться на анонимизированном репрезентативном non-production snapshot.

Ни новый индекс, ни `pg_trgm`, ни cursor migration не добавлены: без реальных планов и объёма данных это было бы спекуляцией. Доступный React-сценарий ограничен page 20 / offset 950, хотя HTTP handler сохраняет более широкий legacy-compatible предел.

## Медиа

- API принимает один файл; upload policy ограничивает actor до 12 операций в час.
- Поддерживаются JPEG, PNG и WebP; проверяются MIME, container signature, структура dimension header и фактические dimensions.
- Лимиты: `6 MiB`, `8192×8192`, максимум `40 MP`. Encoded length отклоняется до `Buffer.from`, чтобы oversized base64 не декодировался.
- Имена нормализуются, а object path versioned через UUID. Данные сохраняются в Supabase Storage, не в базе.

Незакрытые media-пункты: payload всё ещё проходит base64 через serverless function; direct signed upload отсутствует; derivative/resizing pipeline не реализован; immutable CDN cache metadata не подтверждена фактическими headers. Эти свойства нельзя заявлять по одному UUID в URL.

## Проверки

- `npm.cmd run check`: legacy/Phase 6-9 syntax, React Router typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: `86/86` server и `107/107` unit/contract/component tests прошли.
- `npm.cmd run smoke`: production client/SSR build прошёл; 43 staged legacy файла не изменились; React route ownership и terminal 404 сохранены.
- `git diff --check`: чисто; Windows выводит только ожидаемые CRLF notices.
- Frozen UI, CSS и snapshots не менялись, поэтому новый visual baseline для backend-only checkpoint не создавался.

## Незакрытые критерии Phase 9

1. Подключить shared Redis/KV credentials в отдельном preview/pre-production environment и подтвердить один лимит между несколькими runtime instances.
2. Разблокировать Vercel Preview author access, развернуть exact checkpoint и проверить фактические CDN response headers/ETag/304 и private responses.
3. Реализовать provider-specific cache invalidation adapter и проверить purge после publish/update.
4. Выполнить подготовленный EXPLAIN-профиль на репрезентативной базе; только после этого принять решение об индексе, `pg_trgm`/FTS и cursor pagination.
5. Перевести media flow на direct signed upload, добавить derivatives и проверить immutable CDN policy фактическим запросом.

Database migrations, provider provisioning, merge, production deployment и aliases отсутствуют.

Кодовый откат: `git revert dc8c9fbb4f4cdda46c343feb7d98d65f09889377`. Git не откатывает внешние provider keys, Supabase data или Storage objects.
