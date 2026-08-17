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

Adapter дополнительно требует системные `VERCEL=1` и `VERCEL_ENV=preview|production`, которые Vercel задаёт автоматически. Успешный вызов означает только, что invalidation запрошена: публичный Function API намеренно не возвращает доказательство изменения CDN state, а вне поддерживаемого request context может завершиться без действия. Поэтому код не сообщает `invalidated: true`; фактическое изменение кэша подтверждается только Preview-проверкой. Vercel потребляет и удаляет `Vercel-Cache-Tag` и `Vercel-CDN-Cache-Control` до клиентского ответа, поэтому их публичное отсутствие не является ошибкой. Black-box oracle требует явный `X-Vercel-Cache: HIT` со старым ETag/body, затем после mutation `STALE` с теми же старыми ETag/body и только после этого `HIT` со свежими данными/новым ETag в том же PoP; контрольное venue обязано остаться неизменным явным `HIT`. `MISS`, `REVALIDATED`, Age-derived состояние и свежие данные до `STALE` считаются недоказательными. Неизвестный provider или запуск вне Vercel остаются наблюдаемой `CACHE_PURGE_NOT_CONFIGURED` ошибкой при попытке invalidation, но не ломают загрузку API-модулей. Provider failure записывается как безопасное структурированное событие `cache.purge.failed` без URL, venue id, slug, token или response body.

Это закрывает реализацию adapter и cache-tag wiring. Фактический purge всё ещё должен быть подтверждён в изолированном Preview указанной последовательностью `HIT(old) → STALE(old) → HIT(new)`, а несвязанные venue cache entries не должны инвалидироваться.

Официальный контракт Vercel: [CDN cache purge](https://vercel.com/docs/caching/cdn-cache/purge), [`@vercel/functions` Function API](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#invalidatebytag), [stripping cache-tag header](https://vercel.com/changelog/tag-based-cache-invalidation-now-available-for-all-responses) и [`X-Vercel-Cache` states](https://vercel.com/docs/headers/response-headers).

## Исторический pre-implementation анализ (superseded)

> Этот раздел описывает состояние до реализации direct-signed media pipeline. Он сохранён только как история требований и не является текущим status/debt списком; актуальный контракт начинается в следующем разделе.

На том checkpoint `/api/uploads` принимал bytes через serverless function, но до записи проверял MIME, container signature, dimensions, 6 MiB и 40 MP. Выдать signed URL прямо в существующий public bucket означало бы убрать эти authoritative проверки и позволить объекту стать публичным до валидации. Это было бы регрессией безопасности, а не завершением Phase 9.

Безопасный вертикальный flow тогда требовал внешних ресурсов и решений:

1. Private bucket `venue-upload-staging` с provider-level allowlist `image/jpeg,image/png,image/webp`, лимитом 6 MiB и lifecycle cleanup для незавершённых объектов.
2. Authenticated/rate-limited sign endpoint, который выдаёт одноразовый versioned object path без `upsert`. Supabase signed upload URL действует 2 часа; приложение не должно обещать более короткий TTL без отдельного broker.
3. Browser загружает bytes напрямую в staging bucket.
4. Authenticated finalize endpoint скачивает staging object и повторяет authoritative signature, dimensions, byte и pixel-budget проверки. Клиентские MIME/size/dimensions не считаются доказательством.
5. Одобренный image processor генерирует минимум `thumb`, `card` и `hero` variants с зафиксированными dimensions/quality. Выбор между pre-generated objects и Supabase Image Transformations требует owner cost/plan decision; transformations доступны только на поддерживаемом paid plan.
6. Derivatives записываются в отдельный public bucket по новым immutable paths, без overwrite, с browser `cacheControl=31536000`. CDN/provider должен фактически вернуть `public, max-age=31536000, immutable`; если Storage API не позволяет добавить `immutable`, нужен согласованный media proxy/CDN, и пункт остаётся открытым. Submission хранит manifest variants, а не один непроверенный URL.
7. Staging original удаляется после успешной публикации и best-effort после любой ошибки. TTL покрывает падение между sign/upload/finalize.
8. В Preview фактическим `GET` проверяются `Cache-Control`, `Age`/`cf-cache-status`, MIME, immutable URL и отсутствие доступа к staging object.

Исторически до реализации требовались buckets/policies, lifecycle/cleanup, provider credentials, processor, media manifest и visual/LCP approval. Утверждение этого старого checkpoint о сохранённом base64 flow теперь superseded текущей code-only реализацией ниже; runtime/provider acceptance по-прежнему нельзя считать выполненным без нового immutable Preview.

Официальные provider-ограничения: [signed upload URLs](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl), [bucket restrictions](https://supabase.com/docs/guides/storage/buckets/fundamentals), [image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) и [Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Superseding implementation checkpoint — 11 августа 2026 года

Текущий code-only tree реализует безопасный вертикальный media-flow и supersedes pre-implementation status выше.

1. `POST /api/uploads/sign` после user-session, same-origin и distributed rate-limit создаёт UUID receipt и staging path без `upsert`. Signed URL Supabase имеет provider TTL 2 часа.
2. Браузер выполняет прямой `PUT` в private `mesto-media-staging`; байты не проходят через лимит тела Vercel Function и не кодируются в base64.
3. `POST /api/uploads/finalize` service-role запросом повторно скачивает объект и проверяет фактические bytes/signature/decode/dimensions: до 6 MiB, 8192 px и 40 MP. MIME клиента не считается доказательством.
4. Зафиксированный `sharp@0.35.3` применяет EXIF orientation, удаляет metadata и создаёт `thumb`, `card`, `hero` WebP в private `mesto-media-review`.
5. `POST /api/submissions` атомарным SECURITY DEFINER RPC прикрепляет только `processed` media того же владельца. Клиентские публичные URL больше не принимаются.
6. Approval заранее регистрирует UUID-versioned paths, копирует варианты в public `mesto-media-public` с `x-upsert:false` и `Cache-Control: public, max-age=31536000, immutable`, затем одной DB-транзакцией публикует venue и manifest. Rejection удаляет private objects.
7. Ошибка sign/finalize/последовательной загрузки/создания заявки/публикации запускает compensating delete. При отказе Storage сохраняются `cleanup_pending`/`*_cleanup_pending`; каждый новый sign ограниченно удаляет истёкшие unattached receipts.
8. `POST /api/uploads/release` удаляет только собственные unattached receipts; attached/published media пользователь удалить не может.
9. `GET /api/uploads/status?mediaId=<uuid>` даёт authenticated owner-scoped oracle `{mediaId,exists}` с `private, no-store`; чужой receipt неотличим от отсутствующего, поэтому acceptance перед каждым readback требует exact customer ID/username/email session.
10. Protected `GET /api/cron/media-reaper` после auth запускает bounded fixed-point cleanup. Acceptance вызывает его вручную только после ordinary media/venue cleanup, требует exact isolated counts `{recovered:0,public:0,staging:1,review:0,expired:1}` и доказывает abandoned receipt как owner status `exists:true → false`.

Исторические три migration уже применены и сверены только на изолированном Preview: `20260728_external_identities.sql`, `20260808_public_catalog_summary.sql`, `20260810222309_direct_signed_media_pipeline.sql`. Следующие четыре additive migration code-ready, но **не применены** ни к Preview, ни к Production: `20260811160000_media_publication_fencing.sql`, `20260811163000_signed_upload_tombstones.sql`, `20260811185937_submission_media_cleanup_receipts.sql`, `20260811212027_venue_media_cleanup_receipts.sql`. До runtime acceptance нужно:

- с существующим backup/rollback применить к изолированной Preview DB ровно четыре отсутствующие additive migration и сверить remote history;
- подтвердить CORS browser `PUT`; для custom Storage domain добавить точный origin в CSP;
- пройти authenticated sign → PUT → finalize → submit → approve/reject и доказать private denial staging/review;
- фактическим `GET` подтвердить CDN headers; код запрашивает immutable metadata, но не подменяет provider evidence;
- задать provider lifecycle/операционный retry для абсолютной очистки при полном отсутствии upload-трафика;
- отдельно решить backfill legacy bucket `venue-submissions`: новый код в него не пишет, migration старые production objects не меняет.

Mutation-capable acceptance создаёт ровно два signed receipts из одного изображения: один проходит finalize/submission/publication, второй после direct PUT намеренно остаётся abandoned. Оба deadline входят в один общий latest-expiry wait примерно `2 h 6 min`; второго двухчасового ожидания нет. После gate порядок строгий: ordinary submission/media/venue cleanup → protected manual Preview reaper → session logouts. `MESTO_ACCEPTANCE_CRON_SECRET` читается только из environment runner-процесса, требует уже trimmed значение длиной не меньше 32 символов и не попадает в report/error.

Reaper evidence подтверждает только handler/auth/provider reachability конкретного Preview deployment. Оно не доказывает наличие или исполнение Production schedule.

Approval response exposes a safe acceptance oracle as `media[]`: each entry contains only the media `id` and `thumb`/`card`/`hero` `{url,width,height,bytes,contentType}`. Private object paths and signed URLs are never returned.

Deleting an approved venue uses `delete_venue_with_media`: one database transaction marks associated published receipts `cleanup_pending` and deletes the venue. Only after that commit does the handler remove public/private objects and receipt rows. If Storage cleanup fails, the durable tombstones remain eligible for the bounded sign-time reaper. If the database RPC response is transport-ambiguous, no object is deleted, because the venue transaction may have rolled back. `venue_submissions.approved_venue_id` is the durable approval link used to claim the exact media set.

Supabase Smart CDN deletion invalidation is asynchronous and can take up to 60 seconds. On every poll, acceptance must require the exact Supabase 404 JSON `NoSuchKey` contract from both the original warmed public URL (without query/fragment) and a unique cache-nonce URL. A 404 only on the nonce URL while the exact immutable URL remains 200 is not sufficient.

That dual oracle proves CDN/origin invalidation, not revocation from caches outside operator control. A browser or other private cache that already stored a response under `max-age=31536000, immutable` can retain those bytes for up to one year. This is an explicit retention tradeoff only for owner-approved public venue photos; it is not a privacy-deletion guarantee and must never be used for user-private media. Immutable versioning remains unchanged.

`media_assets.owner_id` and `submission_id` use `ON DELETE RESTRICT`, not cascade/set-null: deleting an Auth user or submission cannot silently erase/detach the only database receipts while leaving Storage objects behind. Account/submission erasure must first run the media/venue lifecycle cleanup.

### Текущий verification/status checkpoint — 17 августа 2026 года

- Этот checkpoint заменяет только текущий status; исторические implementation checkpoints выше сохранены как история.
- Проверенный и развёрнутый runtime SHA — `85f8e81fcc9849e0b679ceb51caa0816f9806f11`; exact immutable Preview — deployment `dpl_GyoXdtHoHiQqoUhjHjuHxvmMrwL9` по адресу `https://mesto-city-guide-a98xir82k-krevetkaaaas-projects.vercel.app`. Exact-SHA push/PR CI runs `31965676156` и `31965678477` зелёные, все job прошли с первой попытки.
- Локальные `check`, server tests `340/340`, Vitest `213/213`, production smoke и high-severity audit gate прошли. Exact-Preview route/identity доказательства зелёные. Strict accessibility proof прошёл 9 проверок и 6 axe scans без serious/critical violations; disposable stored-XSS smoke прошёл `3/3`, две reload-проверки, полный cleanup и остаток `0`.
- Прерванный ранее acceptance не был выдан за terminal result: его exact остатки удалены hash-bound cleanup recovery, cleanup validator и durable finalizer прошли, временная cleanup task удалена. Затем ровно один durable full acceptance (scheduler runId `7c5c60caaa0b4fe880d83ccf38dc2d00`, acceptance-report runId `7364db2b0e55162e`) завершился exit `0`, `passed:true`, с `cleanup.complete:true`, без cleanup failures и с completed/drained media cleanup/reaper evidence. Validator вернул `ACCEPTANCE_EVIDENCE_VALID`, finalizer — `DURABLE_R2_TERMINAL_EVIDENCE_VALID`, acceptance task удалена.
- После PASS был выполнен ровно один formal load с hard acceptance precondition. Он завершился exit `1`, `passed:false`, а validator вернул `LOAD_EXIT_NOT_ZERO`. Expected profile: 500 запросов, 499 HTTP 200, один transport `ECONNRESET`, 0 response-validation errors, 499 cache hits (`0,998`), `3813,65 ms`, `131,11 rps`, p50 `101,79 ms`, p95 `315,46 ms`, p99 `359,60 ms`. SLO провален только по строгому требованию нулевых ошибок; burst и soak не запускались. Повтор не разрешался и не выполнялся.
- Изолированный scratch Redis временный и истекает 19 августа 2026 года; для устойчивого release proof нужен durable replacement. Production deployment/alias, Production data/migrations, `main` и merge не менялись.
- Release остаётся **NO-GO**. Помимо красного formal load остаются внешние ворота: durable isolated Redis, owner visual approval, field p75 Core Web Vitals, provider dashboard/trace evidence, representative non-production `EXPLAIN`, Production environment/preflight/shared-provider/cron и Production backup/PITR/migrations/rollback owner.
