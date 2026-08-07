# Этап 8. Административная панель

Дата локального завершения: 7 августа 2026 года.

## Владение маршрутами

React Router SSR и hydration теперь обслуживают:

- `/admin` с серверным redirect на `/admin/overview`;
- `/admin/overview`;
- `/admin/submissions`;
- `/admin/reviews`;
- `/admin/venues`;
- `/admin/merchants`.

Один parent loader проверяет admin session и загружает типизированный workspace snapshot. Leaf routes валидируют адресуемый view и возвращают приватный `404` для неизвестного раздела. Exact `/admin` обрабатывается до Vercel `filesystem`, поэтому сохранённый `admin.html` не перехватывает React route. Legacy `admin.html` и `admin.js` остаются rollback- и Visual Freeze-fixtures, но runtime-маршрут больше не подключает `admin.js`.

## Интерфейс и состояние

- Перенесены login, protected shell, overview, заявки, отзывы, заведения, рестораторы и назначения.
- Все опасные действия проходят через явный React-диалог подтверждения: решения модерации, удаление заведения, приостановка доступа и сброс пароля.
- Один `useFetcher` обеспечивает single-flight mutations; pending-формы получают `inert`, `aria-busy` и disabled controls.
- Venue и merchant editors закрываются только после подтверждённого ответа. Ошибка сохраняет введённые данные и отображается внутри открытого диалога.
- Таблицы имеют `thead`, column headers и row headers; существующий responsive overflow остаётся mobile fallback без изменения frozen layout.
- Список рестораторов загружается как независимый secondary slice. Его отказ сохраняет overview, каталог и модерацию, возвращает serializable plain error DTO и не создаёт hydration mismatch.
- Одноразовые credentials условно монтируются только после успешного create/reset. Закрытие удаляет dialog и пароль из DOM; snapshots и тесты проверяют отсутствие пароля в `body.textContent`.

## Backend и приватность

- Admin document/data/action/API responses используют `private, no-store, max-age=0`, `Vary: Cookie`, `X-Content-Type-Options: nosniff` и `X-Robots-Tag: noindex`.
- Login, logout и все cookie-authenticated unsafe mutations fail closed без same-origin evidence.
- Admin body должен быть JSON-объектом и проходит byte limit даже при pre-parsed runtime body.
- UUID принимаются только в canonical форме; `venueIds` должен быть массивом не более 100 элементов, и ни один некорректный id не отбрасывается молча.
- Некорректный или отсутствующий id в `PATCH /api/admin/venues` больше не превращает update в create. URL, enum и массивы venue payload валидируются до записи.
- Ошибки Supabase и Auth нормализованы в ограниченные `ADMIN_*` ответы; upstream message, hint и schema details клиенту не возвращаются.
- Audit после authoritative commit выполняется best-effort. Его отказ не превращает подтверждённое удаление или изменение в пользовательскую ошибку.
- Если пароль уже изменён, но обновление `must_change_password`/`session_version` не подтверждено, backend возвращает credentials вместе с `PASSWORD_RESET_METADATA_PENDING`; React показывает явное предупреждение вместо ложного полного успеха.

## Fixture contracts

- Fixture login принимает только `editor` / `fixture-password`; неверные credentials дают `401`, cross-origin — `403`.
- Dashboard, merchant list и все writes требуют активную `e2e-admin` session; unsafe writes дополнительно требуют same-origin.
- Moderation, venues и merchants возвращают wire payloads, совместимые с runtime Zod schemas.
- Delay, persistent-error и fail-next сценарии имеют отдельные counters. Ошибка списка рестораторов проверена как одноразовый partial outage.
- One-time passwords присутствуют только в mutation response и не сохраняются в fixture state.

## Проверки

- `npm.cmd run check`: legacy/Phase 6/Phase 7/Phase 8 syntax, React Router typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: 65/65 server и 107/107 unit/contract/component tests прошли.
- `npm.cmd run smoke`: production client/SSR build, route ordering, private admin redirect, React SSR marker, отсутствие `admin.js`, staged legacy manifest и terminal `404` прошли.
- Phase 8 browser matrix: 57 passed, 105 ожидаемо skipped, 0 failed. Из них 12 functional/fixture scenarios и 45 Visual Freeze assertions.
- Canonical admin login и пять protected routes сравнены на `360x800`, `390x844`, `768x1024`, `1440x900` и `1920x1080`; interactive editor/error/empty/credentials/mobile states проверены на утверждённых viewport.
- Visual threshold остался `1500` pixels; frozen Phase 1 snapshots не изменялись и не обновлялись.
- Axe блокирует неожиданные serious/critical нарушения на login и пяти protected routes; унаследованный frozen `color-contrast` debt остаётся этапом 10.
- Регрессии: Phase 7 — 58 passed / 98 expected skipped; Phase 6 — 19/59; Phase 5 — 28/52; Phase 4 — 16/24.

## Visual Freeze findings

Visual regression не ослаблялся. Он выявил и помог исправить реальные различия: неверный приоритет `updatedAt` вместо legacy `createdAt`, две лишние flex-gap от form wrappers, неправильную позицию sidebar logout, mobile nav position, постоянно зарезервированную строку ошибки в dialogs, структуру partial merchant table/toast, несовпадающий moderation toast и non-enumerable `ApplicationError.message`, вызывавший hydration mismatch. После исправлений вся матрица прошла на исходном пороге.

## Ограничения до production

- Обновление merchant profile и memberships остаётся двумя внешними записями без общей транзакции. Ввод полностью валидируется до первой записи, но редкий partial commit всё ещё возможен.
- Основные dashboard slices `venues/submissions/reviews/stats` пока связаны одним store call; независимый partial failure реализован для merchant list. Более глубокое разбиение требует изменения backend contract.
- Admin session использует отдельный секрет и role check, но minimum entropy, typed audience/version claims и server-side revocation ещё не введены. Это обязательная security-задача этапа 10 до production cutover.
- Login rate limit остаётся in-memory и не является распределённым для serverless; production path относится к этапу 9.
- Production deployment, production alias, merge и реальные Supabase mutations отсутствуют.
- GenericAgent в `C:\Users\kir21\GenericAgent` теперь запускает CLI: установлен отсутствовавший `psutil`, Windows launcher переведён в UTF-8. Однако `mykey.py` и LLM credentials отсутствуют, поэтому запуск агентной LLM-сессии без пользовательской локальной настройки невозможен и не имитировался.

## Preview и откат

- Implementation commit: `3b46732e8e5829f789b35276649165c06f3d2589`; migration remote подтверждён тем же hash.
- Создан deployment `dpl_GYPSPwhXkvRhHYUjBsxtRtfvQWu5`, URL `https://mesto-city-guide-fqxje6hwj-krevetkaaaas-projects.vercel.app`, target `preview`, exact metadata commit `3b46732e8e5829f789b35276649165c06f3d2589`.
- Deployment не собран: Vercel API вернул `readyState: BLOCKED`, `buildSkipped: true`, `seatBlock.blockCode: TEAM_ACCESS_REQUIRED` и причину: Git author `176798612+Krevetkaaaa@users.noreply.github.com` должен иметь доступ к team `krevetkaaaa's projects`.
- Принятые deployment routes уже показывают correct private `/admin` redirect до `filesystem` и dynamic admin mappings, но runtime verification невозможна: URL отдаёт служебную страницу `Deployment is building`, а не приложение. Статус не выдаётся за `READY`.
- Для разблокировки владелец должен подтвердить/добавить Git author в Vercel team configuration, затем повторить Preview deployment exact implementation commit. Git metadata не удалялась, автор не подменялся и platform access check не обходился.
- Production deployment, production alias и merge не выполнялись.

До production cutover legacy admin files сохранены. Кодовый откат: `git revert 3b46732e8e5829f789b35276649165c06f3d2589`; заблокированный Preview удаляется отдельно. Git не откатывает cookies, environment variables или внешние данные.
