# Phase 9: cache purge и безопасный media-контракт

Дата code-only checkpoint: 9 августа 2026 года.

## Что закрыто кодом

Для публичных API-ответов добавлены `Vercel-CDN-Cache-Control` и Vercel cache tags:

- `mesto-venues` — каталог и summary;
- `mesto-venue-<uuid>` — карточка, меню и акции конкретного заведения.

Post-commit seam теперь использует официальный project-scoped `invalidateByTag()` из `@vercel/functions`. Он работает в контексте текущего Vercel project и deployment environment, поэтому приложению не нужен долгоживущий Vercel API token, а Preview не может случайно инвалидировать Production. Provider-ошибки нормализуются без прокидывания внутренних подробностей в API-ответ.

Причины `menu.*` и `promotion.*` инвалидируют только entity tag. Изменения `venue.*` инвалидируют каталог и entity tag. Одобрение submission без известного venue id инвалидирует только общий каталог. Это ограничивает blast radius и сохраняет best-effort post-commit семантику: уже подтверждённая DB mutation не превращается в пользовательскую ошибку из-за purge.

Конфигурация намеренно отключена по умолчанию:

```text
MESTO_CACHE_PURGE_PROVIDER=vercel
```

Adapter дополнительно требует системные `VERCEL=1` и `VERCEL_ENV=preview|production`, которые Vercel задаёт автоматически. Успешный вызов означает только, что invalidation запрошена: публичный Function API намеренно не возвращает доказательство изменения CDN state, а вне поддерживаемого request context может завершиться без действия. Поэтому код не сообщает `invalidated: true`; фактическое изменение кэша подтверждается только Preview-проверкой `HIT → mutation → STALE/revalidation`. Неизвестный provider или запуск вне Vercel остаются наблюдаемой `CACHE_PURGE_NOT_CONFIGURED` ошибкой при попытке invalidation, но не ломают загрузку API-модулей. Provider failure записывается как безопасное структурированное событие `cache.purge.failed` без URL, venue id, slug, token или response body.

Это закрывает реализацию adapter и cache-tag wiring. Фактический purge всё ещё должен быть подтверждён в изолированном Preview: после mutation следующий запрос должен показать `STALE`/revalidation для соответствующего tag, а несвязанные venue cache entries не должны инвалидироваться.

Официальный контракт Vercel: [CDN cache purge](https://vercel.com/docs/caching/cdn-cache/purge) и [`@vercel/functions` Function API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#invalidatebytag).

## Почему direct upload и derivatives не подменены заглушкой

Текущий `/api/uploads` принимает bytes через serverless function, но зато до записи проверяет MIME, container signature, dimensions, 6 MiB и 40 MP. Выдать signed URL прямо в существующий public bucket означало бы убрать эти authoritative проверки и позволить объекту стать публичным до валидации. Это регресс безопасности, а не завершение Phase 9.

Безопасный вертикальный flow требует внешних ресурсов и решений:

1. Private bucket `venue-upload-staging` с provider-level allowlist `image/jpeg,image/png,image/webp`, лимитом 6 MiB и lifecycle cleanup для незавершённых объектов.
2. Authenticated/rate-limited sign endpoint, который выдаёт одноразовый versioned object path без `upsert`. Supabase signed upload URL действует 2 часа; приложение не должно обещать более короткий TTL без отдельного broker.
3. Browser загружает bytes напрямую в staging bucket.
4. Authenticated finalize endpoint скачивает staging object и повторяет authoritative signature, dimensions, byte и pixel-budget проверки. Клиентские MIME/size/dimensions не считаются доказательством.
5. Одобренный image processor генерирует минимум `thumb`, `card` и `hero` variants с зафиксированными dimensions/quality. Выбор между pre-generated objects и Supabase Image Transformations требует owner cost/plan decision; transformations доступны только на поддерживаемом paid plan.
6. Derivatives записываются в отдельный public bucket по новым immutable paths, без overwrite, с browser `cacheControl=31536000`. CDN/provider должен фактически вернуть `public, max-age=31536000, immutable`; если Storage API не позволяет добавить `immutable`, нужен согласованный media proxy/CDN, и пункт остаётся открытым. Submission хранит manifest variants, а не один непроверенный URL.
7. Staging original удаляется после успешной публикации и best-effort после любой ошибки. TTL покрывает падение между sign/upload/finalize.
8. В Preview фактическим `GET` проверяются `Cache-Control`, `Age`/`cf-cache-status`, MIME, immutable URL и отсутствие доступа к staging object.

До реализации нужны: создание buckets и policies, lifecycle/cleanup, provider credentials, решение о derivative processor/стоимости, схема media manifest и visual/LCP approval. Поэтому existing base64 flow сохранён, а direct signed upload, derivatives и подтверждённый immutable media CDN остаются внешним блокером, а не ложно отмеченным «готово».

Официальные provider-ограничения: [signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals), [image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) и [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
