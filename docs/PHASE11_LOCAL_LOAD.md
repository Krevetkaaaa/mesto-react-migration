# Этап 11. Локальный нагрузочный regression probe

Дата partial checkpoint: 8 августа 2026 года.

Implementation commits: `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, isolation fix `ea542198675b03917f0aa19429dab20012a0a7a5`, safety hardening `5b733153b85f07e54ef03fff83a04e96c0add924`, home SSR optimization `64a3c493b0b18ad280c74392f41a2ec9e23fbd05`.

Статус: безопасный локальный harness, smoke, mixed baseline на 25 VU и три независимых expected mixed прогона на 100 VU прошли. После удаления недостижимого hidden DOM главная уменьшилась с `90 422` до `51 904` bytes; три expected p95 составили `857,49`, `704,20` и `699,00 ms` при пределе `1000 ms`. Формальный burst popular-venue на 300 VU провалил SLO и вернул 42 HTTP 503, поэтому soak не запускался. Phase 11 не завершён: локальный all-origin fixture не моделирует Vercel edge cache или production multi-instance capacity.

## Граница доказательства

`npm.cmd run test:load:local` собирает production React SSR и запускает его вместе с однопроцессным in-memory legacy API fixture через production gateway. Это проверяет маршрутизацию, SSR, HTTP coordination и сам load-harness на одной машине. Это не измеряет Supabase, CDN, serverless duration/cold starts, distributed rate limiting или capacity нескольких runtime instances.

Target safety fail closed:

- разрешён только credential-free loopback IP literal (`127.0.0.1` или `::1`), без DNS/hosts-разрешения `localhost`;
- `/__phase4/health` обязан доказать одновременно React и legacy child processes;
- `/__e2e/state` и reset обязаны вернуть `X-E2E-Fixture: legacy-safety-net`;
- тот же sentinel проверяется на login и каждом `/api/*` response;
- все setup/workload fetch используют `redirect: manual`, поэтому локальный redirect не может увести нагрузку на другой origin;
- remote/staging/production URL текущий harness не принимает вообще;
- runner использует OS-owned workspace lock (Windows named pipe, Linux abstract socket, безопасный loopback fallback) и динамические loopback ports;
- private IPC сообщает child identity, HTTP health обязан совпасть с ним, а завершение выполняет сам gateway с IPC acknowledgement. Runner не посылает сигналы сырым PID, которые ОС могла переиспользовать.

Нагрузочные операции read-only, кроме входа в hardcoded fixture accounts (`anna`, `merchant.owner`, `editor` с `fixture-password`), который меняет только in-memory fixture session state. Реальные аккаунты, пароли, mutations и внешние системы не используются.

## Профили и метрики

- `public-read`: home, catalog, filtered catalog, venue document, catalog API и venue API.
- `popular-venue`: полная SSR document route `/venue/tihiy-sad`, не только быстрый fixture JSON endpoint.
- `auth-safe`: 90% fixture customer session reads и 10% входов с одним известным fixture credential; это не password guessing.
- `mixed`: 90% public reads, 6% customer favorites reads, 3% merchant dashboard и 1% admin dashboard.
- `merchant-admin`: 70% merchant dashboard и 30% admin dashboard.

Harness измеряет p50/p95/p99, attempted и successful throughput, bytes, HTTP status classes, отдельный 429, 5xx, transport errors, cache headers и per-label latency/status/transport. Длинные прогоны используют deterministic bounded reservoir как для aggregate, так и для каждого label вместо сохранения только первых samples. CLI отклоняет неизвестные, дублированные и неполные параметры до запуска gateway. Abort criteria: пять последовательных transport errors, более 5% 5xx после 100 запросов или отсутствие успешного response 10 секунд.

Local fixture SLO заданы до прогона: public/auth/mixed p95 не выше 1000 ms и p99 не выше 2500 ms; merchant/admin p95 не выше 1500 ms и p99 не выше 3000 ms; 5xx, transport и неожиданные statuses равны нулю; минимальный successful throughput для smoke — 5 RPS, baseline — 20 RPS, expected/burst/soak — 40 RPS.

## Финальный локальный прогон

Smoke, 5 VU на профиль:

| Профиль | Requests / HTTP 200 | Successful RPS | p95 | p99 | Результат |
| --- | ---: | ---: | ---: | ---: | --- |
| public-read | 453 / 453 | 149,89 | 66,14 ms | 240,52 ms | pass |
| popular-venue document | 351 / 351 | 115,97 | 64,72 ms | 79,70 ms | pass |
| auth-safe | 2798 / 2798 | 926,80 | 9,91 ms | 18,09 ms | pass |
| merchant-admin | 2435 / 2435 | 810,39 | 16,77 ms | 20,76 ms | pass |

Mixed baseline, 25 VU:

- 2416 attempts, 2416 HTTP 200;
- attempted и successful 240,68 RPS;
- p95 325,23 ms, p99 351,63 ms;
- transport errors, 5xx и неожиданных statuses нет;
- gate passed.

Первоначальный baseline с 25 transport timeouts признан недействительным: production gateway запускал `@react-router/serve` с непрочитанным stdout pipe, а сервер пишет access-log на каждый SSR request. После заполнения Windows pipe React child блокировался. Isolation fix отключил этот stdout, добавил отмену upstream при разрыве клиента, потребление health-response body, exclusive lock и явный выбор одного stage/scenario. Это был дефект harness, а не доказанная деградация приложения.

Последующий safety review закрыл redirect escape, PID reuse/process-group risk, stale lock, silent CLI fallback и неполный upstream response. Proxy теперь уничтожает оборванный response после уже отправленных headers, возвращает 503 только до headers и отменяет upstream при разрыве downstream. Реальный lifecycle smoke подтвердил gateway-owned shutdown acknowledgement; после завершения project-owned Node processes не остались.

Первый expected mixed, 100 VU, до оптимизации главной:

- 4891 attempts, 4891 HTTP 200;
- attempted и successful 242,60 RPS;
- p50 401,68 ms, p95 1159,35 ms, p99 1707,18 ms;
- transport errors, 5xx и неожиданных statuses нет;
- gate failed только по p95: `1159,35 ms > 1000 ms`; home document был самым медленным label с p95 `1753,84 ms`.

Порог не ослаблялся. Из React home SSR удалены только три заранее скрытых и недостижимых слоя: `#platform`, in-page catalog fallback и 28 `hidden` editorial venue cards. Видимые три карточки, dialogs, counters и route navigation сохранены; компактный `staticVenueInventory` продолжает считать все 31 editorial records и предотвращает API-дубликаты. Legacy `index.html` не менялся. Фактический production-gateway response `/` уменьшился с `90 422` до `51 904` bytes (`-38 518`, `-42,6%`), `PublicHomeMarkup` client chunk — с `107,23` до `69,32 KiB`, server bundle — с `615,44` до `539,89 KiB`. `app.js` получил cache-buster `v=ui-motion-3` только на React home.

Три независимых expected mixed прогона после оптимизации, каждый на свежем gateway:

| Trial | Requests / HTTP 200 | Successful RPS | p95 | p99 | Результат |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 5672 / 5672 | 281,57 | 857,49 ms | 1272,34 ms | pass |
| 2 | 6234 / 6234 | 309,31 | 704,20 ms | 891,98 ms | pass |
| 3 | 6240 / 6240 | 310,12 | 699,00 ms | 948,61 ms | pass |

Итого 18 146/18 146 HTTP 200, без transport errors, 4xx/5xx и неожиданных statuses. Expected gate считается устойчиво пройденным локально.

Burst evidence, 300 VU:

- дополнительный mixed stress: 890 attempts, 860 HTTP 200, 30 transport timeouts, p95 `4562,02 ms`, p99 `5009,37 ms`; abort после пяти последовательных transport errors;
- формальный `popular-venue` document burst: 600 attempts, 558 HTTP 200, 42 HTTP 503, p95 `4633,06 ms`, p99 `4653,91 ms`; abort после превышения 5% HTTP 5xx.

Оба burst-прогона честно провалили заранее заданный SLO. Soak не запускался после проваленного burst gate. Это доказывает предел единственного локального uncached React SSR process, но не поведение Vercel edge: fixture gateway не реализует `s-maxage` cache и не сообщает cache HIT. Production-like Preview должен отдельно прогреть карточку, подтвердить `X-Vercel-Cache`/`Age`, затем повторить burst с provider telemetry. Короткие локальные durations не являются cold-start или multi-instance evidence.

## Что нельзя измерить локально

- `X-Vercel-Cache`, `Age` и cache hit ratio не сообщаются fixture gateway;
- время/число Supabase queries, serverless duration и cold starts требуют provider telemetry;
- HTTP harness не собирает browser console/page errors;
- fixture не использует production limiter, поэтому 429 и shared Upstash behavior не проверяются;
- один IP с production policies 30–60 public requests/min быстро измерит limiter, а не origin capacity.

Для production-like load test нужен отдельный staging environment с обезличенными representative data, shared Redis/KV, согласованной тестовой rate policy или distributed generator, provider telemetry и явным разрешением владельца. Production нагрузка запрещена.

## Проверки

- `npm.cmd run check`: Phase 6–11 syntax, typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: `115/115` server и `113/113` unit/contract/component tests прошли.
- Targeted Phase 11 safety suite: `15/15`; отдельный real smoke подтвердил корректный IPC shutdown и освобождение OS-owned lock без orphan project processes.
- `npm.cmd run test:load:local`: четыре smoke profile и baseline mixed прошли.
- Phase 4: `17` passed; Phase 5: `28` passed; Phase 6: `19` passed. Viewport skips ожидаемые, frozen snapshots не обновлялись.
- `npm.cmd run smoke`: production build, public JS budget, client secret scan и 43-file legacy freeze прошли.
- Три `node scripts/run-phase11-local.mjs --stage expected --scenario mixed`: `0/0/0` exit codes; формальный burst `popular-venue` завершился exit 1 по зафиксированному SLO и HTTP 503.
- `git diff --check`: чисто, кроме штатных CRLF notices Windows.

## Незакрытые критерии

1. Проверить formal burst на Vercel Preview после warmup и фактического `X-Vercel-Cache: HIT`/`Age`; локальный uncached burst провалился.
2. Только после пройденного burst gate выполнить длительный soak expected-профиля с warmup, provider telemetry и повторениями.
3. Подключить production handlers/representative Supabase в изолированном staging вместо fixture API.
4. Проверить shared limiter между несколькими instances и точный 429/Retry-After contract.
5. Собрать cache hit, Supabase, serverless/cold-start и browser error telemetry по correlation id.

Database migrations, provider provisioning, Preview/production load, merge, deployment и aliases отсутствуют.

Кодовый откат home SSR optimization: `git revert 64a3c493b0b18ad280c74392f41a2ec9e23fbd05`; затем safety hardening: `git revert 5b733153b85f07e54ef03fff83a04e96c0add924`; isolation fix: `git revert ea542198675b03917f0aa19429dab20012a0a7a5`. Полный откат Phase 11 после этого: `git revert 6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.
