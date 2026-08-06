# Этап 7. Кабинет ресторатора

Дата локального завершения: 7 августа 2026 года.

## Владение маршрутами

React Router SSR и hydration теперь обслуживают:

- `/merchant` с серверным redirect на `/merchant/overview`;
- `/merchant/overview`;
- `/merchant/venue`;
- `/merchant/menu`;
- `/merchant/promotions`;
- `/merchant/reviews`.

Один parent loader загружает авторизованный workspace snapshot для всех дочерних представлений. Leaf routes валидируют адресуемый view, но не дублируют server state. Legacy `merchant.html` и `merchant.js` сохранены как rollback- и Visual Freeze-fixtures; runtime-маршрут больше не подключает `merchant.js`. Admin остаётся legacy до этапа 8.

## Сессия, права и приватность

- Login, logout и смена пароля проходят через typed Session adapter; merchant data и mutations — через MerchantWorkspace adapter.
- UI использует deny-by-default permission gates, но не является границей безопасности: dashboard и каждая mutation повторно проверяют активную merchant session, назначение заведения и permission membership на сервере.
- Неизвестная или отсутствующая membership role больше не получает owner-права по fallback.
- До смены временного пароля backend блокирует venue/menu/promotion writes кодом `PASSWORD_CHANGE_REQUIRED`.
- Dashboard возвращает menu, promotions и reviews только для заведений, где membership разрешает соответствующий slice.
- Все merchant document/data/action/API responses имеют `private, no-store, max-age=0`, `Vary: Cookie`, `nosniff` и `noindex`.
- Ошибки Supabase/Auth нормализованы: upstream messages/details не попадают в пользовательский ответ.

## Формы и подтверждённое состояние

- Saved server snapshot отделён от venue/menu/promotion/password drafts.
- `useBlocker` и `beforeunload` предупреждают о переходе с несохранёнными изменениями; смена заведения, refresh и закрытие редактора используют явное подтверждение.
- Mutation идёт через один `useFetcher`; повторная отправка блокируется. На время pending форма получает `inert` и `aria-busy`, поэтому значения уже отправленного draft нельзя тихо изменить и затем ошибочно пометить сохранёнными.
- Controlled inputs используют functional state updates; строгий browser test воспроизводил и блокирует stale-closure race при быстрых последовательных изменениях полей.
- UI закрывает редактор и обновляет loader state только после подтверждённого ответа. Ошибка оставляет draft открытым для повторной отправки.
- Время акции из `datetime-local` преобразуется в ISO в браузере до server action. Это сохраняет локальное намерение пользователя при другом timezone у Vercel runtime.
- Счётчик активных акций и overview получают SSR timestamp для стабильной hydration и планируют обновление на ближайшей временной границе акции.

## Интерфейс

- Перенесены login, protected layout, navigation, venue switcher, overview, venue editor, menu CRUD, promotion CRUD, reviews, password и dangerous-action confirmations.
- Активное заведение сохраняется в `localStorage`; данные, counters и permissions вычисляются только для выбранного заведения.
- Mobile sidebar сохраняет focus trap, Escape, возврат фокуса на menu trigger и keyboard navigation.
- Forced-password dialog не закрывается до успешной смены пароля и показывается также для merchant без назначенных заведений.
- Loading, empty, wrong-role, unavailable/retry и mutation error состояния являются явными.

## Backend commit boundary

Подтверждённая запись в базе является authoritative result. Необязательный legacy auth-metadata cleanup и audit после commit выполняются best-effort и больше не превращают подтверждённый успех в ошибку для пользователя. Если таблица отсутствует и metadata является единственным authoritative fallback, его ошибка по-прежнему пробрасывается. Pre-commit database/network failures не проглатываются.

## Проверки

- `npm.cmd run check`: legacy/Phase 6/Phase 7 syntax, React Router typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: 60/60 server и 98/98 unit/contract/component tests прошли.
- `npm.cmd run smoke`: production client/SSR build и coexistence smoke прошли; React владеет public/catalog/account/merchant routes, admin остаётся legacy.
- Phase 5/6/7 fixture contracts: 17/17 прошли.
- Phase 7 Chromium: 10 functional/accessibility scenarios прошли; 16 visual-only сценариев ожидаемо skipped.
- Phase 7 Visual Freeze: 48 snapshot assertions прошли на `360x800`, `390x844`, `768x1024`, `1440x900` и `1920x1080`; 82 project-tests ожидаемо skipped по viewport gating.
- Phase 6 regression: 19 passed, 59 ожидаемо skipped.
- Phase 5 regression: 28 passed, 52 ожидаемо skipped.
- Phase 4 regression: 16 passed, 24 ожидаемо skipped.
- Frozen Phase 1 snapshots не обновлялись.

## Visual Freeze и accessibility

React использует существующие `merchant.css`, assets, SVG sprite, typography, тексты, breakpoints и legacy class/DOM contract. В ходе сравнения исправлены три реальные несовместимости: лишние классы overview cards, disabled pristine venue button и обновление saved identity из несохранённого draft.

Axe проверяет anonymous login, пять merchant routes и основные dialogs и блокирует неожиданные serious/critical нарушения. Унаследованный frozen `color-contrast` debt не маскируется скрытой сменой palette и остаётся отдельной задачей этапа 10.

## Ограничения и эксплуатация

- Post-commit audit/cleanup пока best-effort без безопасной observability и request-id correlation; это задача этапа 9.
- Потерянный сетевой ответ после фактического внешнего commit нельзя полностью отличить локально; idempotency keys и optimistic concurrency остаются отдельной работой.
- Dual-storage legacy metadata fallback сохраняется для совместимости до отдельного cutover.
- Реальный Supabase и production данные browser suite не изменяет; права, задержки, ошибки и counters проверены deterministic fixture seam.
- Database migrations, production aliases, merge и production deployment отсутствуют.
- GenericAgent установлен отдельно, но до локального `C:\Users\kir21\GenericAgent\ga.cmd configure` не является рабочей LLM-сессией и не использовался фиктивно.

## Откат

До production cutover legacy `merchant.html` и `merchant.js` сохранены. После публикации implementation commit кодовый откат выполняется через `git revert` указанного в migration log Phase 7 commit; внешний Preview удаляется отдельно. Git не восстанавливает внешние cookies, environment variables или данные Supabase.
