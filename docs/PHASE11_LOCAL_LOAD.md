# Этап 11. Локальный нагрузочный regression probe

Дата partial checkpoint: 8 августа 2026 года.

Implementation commits: `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`, isolation fix `ea542198675b03917f0aa19429dab20012a0a7a5`.

Статус: безопасный локальный harness, smoke и mixed baseline на 25 VU прошли. Expected mixed на 100 VU вернул только HTTP 200 и не имел transport errors, но провалил заранее заданный p95 SLO: `1159,35 ms` при пределе `1000 ms`. Phase 11 не завершён; burst и soak не запускались после провала expected gate.

## Граница доказательства

`npm.cmd run test:load:local` собирает production React SSR и запускает его вместе с однопроцессным in-memory legacy API fixture через production gateway. Это проверяет маршрутизацию, SSR, HTTP coordination и сам load-harness на одной машине. Это не измеряет Supabase, CDN, serverless duration/cold starts, distributed rate limiting или capacity нескольких runtime instances.

Target safety fail closed:

- разрешён только credential-free loopback origin;
- `/__phase4/health` обязан доказать одновременно React и legacy child processes;
- `/__e2e/state` и reset обязаны вернуть `X-E2E-Fixture: legacy-safety-net`;
- тот же sentinel проверяется на login и каждом `/api/*` response;
- remote/staging/production URL текущий harness не принимает вообще;
- runner использует workspace-exclusive PID lock и динамические loopback ports, а при завершении останавливает gateway и проверенные child PIDs.

Нагрузочные операции read-only, кроме входа в hardcoded fixture accounts (`anna`, `merchant.owner`, `editor` с `fixture-password`), который меняет только in-memory fixture session state. Реальные аккаунты, пароли, mutations и внешние системы не используются.

## Профили и метрики

- `public-read`: home, catalog, filtered catalog, venue document, catalog API и venue API.
- `popular-venue`: полная SSR document route `/venue/tihiy-sad`, не только быстрый fixture JSON endpoint.
- `auth-safe`: 90% fixture customer session reads и 10% входов с одним известным fixture credential; это не password guessing.
- `mixed`: 90% public reads, 6% customer favorites reads, 3% merchant dashboard и 1% admin dashboard.
- `merchant-admin`: 70% merchant dashboard и 30% admin dashboard.

Harness измеряет p50/p95/p99, attempted и successful throughput, bytes, HTTP status classes, отдельный 429, 5xx, transport errors, cache headers и per-label latency/status/transport. Длинные прогоны используют bounded reservoir вместо сохранения только первых samples. Abort criteria: пять последовательных transport errors, более 5% 5xx после 100 запросов или отсутствие успешного response 10 секунд.

Local fixture SLO заданы до прогона: public/auth/mixed p95 не выше 1000 ms и p99 не выше 2500 ms; merchant/admin p95 не выше 1500 ms и p99 не выше 3000 ms; 5xx, transport и неожиданные statuses равны нулю; минимальный successful throughput для smoke — 5 RPS, baseline — 20 RPS.

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

Expected mixed, 100 VU:

- 4891 attempts, 4891 HTTP 200;
- attempted и successful 242,60 RPS;
- p50 401,68 ms, p95 1159,35 ms, p99 1707,18 ms;
- transport errors, 5xx и неожиданных statuses нет;
- gate failed только по p95: `1159,35 ms > 1000 ms`; p99 остался ниже предела `2500 ms`.

Самый медленный label — SSR home document: p50 `1083,39 ms`, p95 `1753,84 ms`, p99 `2329,88 ms`. Direct fixture API labels остались быстрыми: p95 `13,25–18,69 ms`. Порог не ослаблялся; burst 300 VU и soak не запускались после expected failure. Короткие локальные durations также не являются capacity, cold-start или leak evidence; отдельный production-like план должен иметь warmup, повторения/рандомизацию порядка и более длинный soak.

## Что нельзя измерить локально

- `X-Vercel-Cache`, `Age` и cache hit ratio не сообщаются fixture gateway;
- время/число Supabase queries, serverless duration и cold starts требуют provider telemetry;
- HTTP harness не собирает browser console/page errors;
- fixture не использует production limiter, поэтому 429 и shared Upstash behavior не проверяются;
- один IP с production policies 30–60 public requests/min быстро измерит limiter, а не origin capacity.

Для production-like load test нужен отдельный staging environment с обезличенными representative data, shared Redis/KV, согласованной тестовой rate policy или distributed generator, provider telemetry и явным разрешением владельца. Production нагрузка запрещена.

## Проверки

- `npm.cmd run check`: Phase 6–11 syntax, typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: `102/102` server и `113/113` unit/contract/component tests прошли. Один существующий jsdom admin-dialog test ранее сфлапал один раз, затем прошёл три isolated runs и финальный полный suite.
- `npm.cmd run test:load:local`: четыре smoke profile и baseline mixed прошли.
- `node scripts/run-phase11-local.mjs --stage expected --scenario mixed`: все 4891 responses получили HTTP 200, команда ожидаемо завершилась с exit 1 только из-за p95 SLO.
- `git diff --check`: чисто, кроме штатных CRLF notices Windows.

## Незакрытые критерии

1. Снизить p95 SSR home document на expected 100 VU без изменения Visual Freeze и без ослабления SLO; отдельно проверить production-like CDN/cache поведение, которого локальный all-origin probe не моделирует.
2. После чистого expected выполнить burst и длительный soak с warmup/repeated order.
3. Подключить production handlers/representative Supabase в изолированном staging вместо fixture API.
4. Проверить shared limiter между несколькими instances и точный 429/Retry-After contract.
5. Собрать cache hit, Supabase, serverless/cold-start и browser error telemetry по correlation id.

Database migrations, provider provisioning, Preview/production load, merge, deployment и aliases отсутствуют.

Кодовый откат isolation fix: `git revert ea542198675b03917f0aa19429dab20012a0a7a5`. Полный откат Phase 11 после этого: `git revert 6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.
