# Этап 11. Локальный нагрузочный regression probe

Дата partial checkpoint: 7 августа 2026 года.

Implementation commit: `6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.

Статус: безопасный локальный harness и заранее заданные SLO созданы, smoke-ступень прошла, но mixed baseline на 25 VU провалился. Phase 11 не завершён; expected, burst и soak не запускались после провала gate.

## Граница доказательства

`npm.cmd run test:load:local` собирает production React SSR и запускает его вместе с однопроцессным in-memory legacy API fixture через production gateway. Это проверяет маршрутизацию, SSR, HTTP coordination и сам load-harness на одной машине. Это не измеряет Supabase, CDN, serverless duration/cold starts, distributed rate limiting или capacity нескольких runtime instances.

Target safety fail closed:

- разрешён только credential-free loopback origin;
- `/__phase4/health` обязан доказать одновременно React и legacy child processes;
- `/__e2e/state` и reset обязаны вернуть `X-E2E-Fixture: legacy-safety-net`;
- тот же sentinel проверяется на login и каждом `/api/*` response;
- remote/staging/production URL текущий harness не принимает вообще;
- runner использует динамические loopback ports и при завершении останавливает gateway и проверенные child PIDs.

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
| public-read | 464 / 464 | 153,90 | 70,41 ms | 169,01 ms | pass |
| popular-venue document | 467 / 467 | 154,71 | 46,23 ms | 65,98 ms | pass |
| auth-safe | 2778 / 2778 | 920,76 | 10,96 ms | 18,15 ms | pass |
| merchant-admin | 2635 / 2635 | 876,72 | 13,41 ms | 19,95 ms | pass |

Mixed baseline, 25 VU:

- 1148 attempts, 1123 HTTP 200;
- attempted 108,97 RPS, successful 106,59 RPS;
- p95 347,86 ms, p99 5007,88 ms;
- 25 transport timeouts;
- abort с причиной `five consecutive transport errors`;
- gate failed по p99, transport errors и abort criterion.

Порог не ослаблялся. Expected 100 VU, burst 300 VU и soak остановлены до диагностики mixed saturation. Короткие локальные durations также не являются capacity, cold-start или leak evidence; отдельный production-like план должен иметь warmup, повторения/рандомизацию порядка и более длинный soak.

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
- `npm.cmd run test:load:local`: smoke profiles прошли, baseline mixed ожидаемо завершил команду с exit 1 по predeclared SLO.
- `git diff --check`: чисто, кроме штатных CRLF notices Windows.

## Незакрытые критерии

1. Диагностировать mixed 25-VU document timeouts по per-label метрикам и исправить saturation без ослабления SLO.
2. После чистого baseline выполнить expected, burst и длительный soak с warmup/repeated order.
3. Подключить production handlers/representative Supabase в изолированном staging вместо fixture API.
4. Проверить shared limiter между несколькими instances и точный 429/Retry-After contract.
5. Собрать cache hit, Supabase, serverless/cold-start и browser error telemetry по correlation id.

Database migrations, provider provisioning, Preview/production load, merge, deployment и aliases отсутствуют.

Кодовый откат: `git revert 6d24dcac1d95c92fabbbfbbbfb009d1640fd4b6c`.
