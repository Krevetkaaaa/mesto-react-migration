# Данные каталога «Место»

`schema.sql` создаёт постоянную базу собственных карточек, заявок пользователей,
очереди отзывов и функции модерации.

## Внешняя авторизация

Перед включением входа через VK ID и Яндекс примените
`migrations/20260728_external_identities.sql`. Таблица хранит только стабильную
связку «провайдер — идентификатор — пользователь»; OAuth-токены в базу не
записываются.

Если VK ID не выдаёт почту, сервер создаёт технический недоставляемый адрес в
зарезервированном домене `oauth.mesto.invalid` и отмечает профиль флагом
`email_is_internal`. Этот адрес не возвращается клиенту и не используется для
автоматического объединения аккаунтов. Яндекс по-прежнему требует реальную
почту.

Точные callback URL для кабинетов провайдеров:

- `https://mesto-city-guide.vercel.app/api/auth/oauth-vk-callback`
- `https://mesto-city-guide.vercel.app/api/auth/yandex/callback`

Серверные переменные перечислены в `.env.example`. `VK_ID_SERVICE_TOKEN`
добавляется только для конфиденциального приложения VK ID, которое требует
Service access key.

## Read-only preflight перед выпуском

Перед применением migrations и перед cutover запустите fail-closed проверку через
управляемое PostgreSQL-подключение, где `psql` доступен в `PATH`:

```text
npm run preflight:supabase-schema -- --target production
```

`--target` обязан совпадать с `MESTO_RELEASE_TARGET`.
`MESTO_SUPABASE_PROJECT_REF` задаёт точный проверяемый ref, а
`MESTO_FORBIDDEN_SUPABASE_PROJECT_REF` — ref другого окружения; они обязательны
и не могут совпадать. И `SUPABASE_URL`, и direct/pooler PostgreSQL identity в
`SUPABASE_DB_URL` должны точно указывать на ожидаемый ref.

`SUPABASE_DB_URL` передаётся только через secret environment и обязан содержать
TLS `sslmode=require`, `verify-ca` или `verify-full`. `MESTO_PSQL_PATH` обязан
быть доверенным абсолютным путём к реальному `psql`/`psql.exe`; поиск исполняемого
файла через `PATH` запрещён. `MESTO_PSQL_SHA256` обязан содержать заранее
проверенный lowercase SHA-256 этого exact executable; digest пересчитывается
перед каждым запуском на Windows и Unix. Команда не принимает DSN в аргументах и не печатает
его. Она выполняет один repeatable-read `READ ONLY` snapshot, сверяет точную
versioned migration history, таблицы/колонки/constraints/RPC, RLS/ACL,
`pgcrypto` и три Storage buckets. Contract требует `ENABLE ROW LEVEL SECURITY`
и запрещает `FORCE ROW LEVEL SECURITY` на application tables. Для честного
обхода RLS текущая PostgreSQL-роль должна фактически иметь `rolsuper`, иметь
`rolbypassrls` либо владеть всеми application tables при отсутствии FORCE RLS;
одно лишь имя роли `postgres` ничего не доказывает. Иначе проверка завершается
ошибкой до workflow scan.

Cutover блокируется, если существует хотя бы одна `publishing` media operation
или cleanup backlog. Проверка сканирует только необходимые media rows для двух
агрегатных `count(*)`, но не выбирает и не выводит значения строк. В stdout
попадают только redacted PASS и два агрегатных нулевых счётчика.

## Агрегаты публичного каталога

Перед выпуском главной страницы с серверными счётчиками примените
`migrations/20260808_public_catalog_summary.sql`. Миграция добавляет вызываемую
только ролью `service_role` функцию `public.public_catalog_summary()` с правами
вызывающей стороны (`security invoker`). Пока миграция ещё не применена, сервер
совместимости постранично считает те же опубликованные строки по колонкам
`city,category`.

Явный rollback:

```sql
revoke execute on function public.public_catalog_summary() from service_role;
drop function if exists public.public_catalog_summary();
```

Маршрут `/api/venues` читает собственный каталог Supabase и возвращает только
карточки `venues` со статусом `published`. Поиск организаций Яндекса в реальном
времени не используется. Ссылки карточек могут по-прежнему открывать внешний
картографический сервис для просмотра места или построения маршрута, а вход через
Яндекс остаётся отдельным OAuth-механизмом и не зависит от каталога.

## Data API ACL

`migrations/20260817092029_explicit_data_api_acl_and_function_hardening.sql`
фиксирует server-only модель доступа после всех media migrations. Схема `public`
закрыта для `CREATE`, все таблицы приложения остаются под RLS, а `PUBLIC`, `anon`
и `authenticated` не получают прямых прав на таблицы, sequence или RPC.
Серверная роль получает только DML,
sequence `USAGE` и `EXECUTE`, реально используемые backend-кодом. Привилегированные
`SECURITY DEFINER` RPC используют пустой `search_path`; legacy
`moderate_venue_submission` сохранён для безопасного отката старого runtime.

Миграцию применяют один раз через обычную migration history. Старые migration
файлы нельзя переигрывать вручную или подменять `schema.sql`: перед Production
нужно сверить remote history, ACL/RLS и function signatures на изолированном
окружении с отключёнными automatic Data API grants.

Rollback ACL выполняется только новой additive compensating migration после
сравнения сохранённых `pg_namespace.nspacl` и effective `pg_default_acl` с
pre-change snapshot. Опубликованную migration history нельзя удалять или
переписывать. Legacy и React runtime работают через `service_role`, поэтому при
откате кода сохраняются `USAGE` schema `public`, минимальные DML/sequence grants
и allowlist RPC для `service_role`; `CREATE`, table DML и function `EXECUTE` для
`PUBLIC`/`anon`/`authenticated` не возвращаются автоматически. Если старому
provider contract доказанно нужен schema `USAGE`, compensating migration может
вернуть только этот `USAGE`, не открывая relations/RPC и не восстанавливая
опасные automatic default grants. Любое более широкое восстановление выполняется
только из точного ACL snapshot с отдельным rollback owner и повторным preflight.

Секретный ключ Supabase и параметры администратора хранятся только в переменных
окружения. Создание, изменение и модерация выполняются серверными API после
проверки подписанной HttpOnly-сессии администратора.

## Развёртывание на VPS

Сервер рассчитан на Node.js 20+ и обычные переменные окружения из `.env.example`.
Для каждого окружения задайте `MESTO_PUBLIC_ORIGIN` равным публичному HTTPS-адресу
сайта. Доступ к каталогу выполняется через HTTP API Supabase без Vercel-специфичного
SDK базы данных, поэтому тот же код можно запускать на Timeweb VPS; Vercel может
оставаться промежуточным тестовым окружением.
