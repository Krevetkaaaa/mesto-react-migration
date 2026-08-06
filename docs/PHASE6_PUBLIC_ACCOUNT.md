# Этап 6. Пользовательская авторизация и профиль

Дата локального завершения: 7 августа 2026 года.

## Владение маршрутами

React Router SSR и hydration теперь обслуживают:

- `/login`;
- `/register`;
- `/profile`;
- `/favorites`.

`/profile` и `/favorites` выполняют серверную проверку сессии до рендеринга. Route guard остаётся UX-слоем: API повторно проверяет cookie-session и не доверяет состоянию React. Merchant/admin и их legacy JavaScript на этом этапе не менялись.

## Сессия и формы

- Вход, регистрация, выход и восстановление сессии проходят через typed Session adapter; leaf UI не знает API URL и не вызывает `fetch`.
- Персональные document/data/action responses имеют `private, no-store, max-age=0`, `Vary: Cookie` и `X-Content-Type-Options: nosniff`.
- Ошибки формы остаются на текущем маршруте без лишней перезагрузки loader; двойная отправка блокируется состоянием navigation.
- Истёкшие, отозванные, отсутствующие и повреждённые customer cookies считаются anonymous. Ошибка profile/favorites storage возвращается как контролируемый 503, а не маскируется под 401.
- User-session secret теперь обязателен, не короче 32 символов и не может совпадать с admin-session secret. Новые cookies содержат отдельные `typ`, `aud` и `version`; legacy token принимается только при строгом наборе claims.
- Небезопасные cookie-auth mutations проходят общий same-origin guard. Явный cross-site, конфликтующий или неверный `Origin` отклоняется; при отсутствии и `Origin`, и `Sec-Fetch-Site` запрос fail-closed.

## OAuth

- Сохранены Google, Yandex и VK flows через управляемый provider seam.
- Google fragment token удаляется из адресной строки до обмена на cookie-session; token не попадает в localStorage, React state, логи или следующий URL.
- VK/Yandex callback и ошибки провайдера возвращаются на `/login` с безопасным same-origin `returnTo` и контролируемым пользовательским сообщением.
- Open redirect блокируется для абсолютных чужих URL, protocol-relative путей, backslash и некорректного percent-encoding.

## Профиль и избранное

- Один `PublicAccountProvider` владеет user/favorite state на публичных интерактивных маршрутах.
- Generation guard не позволяет старому session restore перезаписать более новый результат; per-key pending guard блокирует параллельную запись одного favorite.
- Favorite snapshot получил optional canonical `slug`. Старые записи без slug остаются читаемыми; небезопасные slug отклоняются до сохранения.
- Каталог, карточка заведения, профиль и `/favorites` используют один набор favorite keys. Удаление сохраняет frozen legacy-сценарий: пользователь открывает карточку из списка и снимает сердечко.
- Локальные изображения принимаются в формах `assets/...` и `/assets/...` и нормализуются на границе модуля.

## Проверки

- `npm.cmd run check`: legacy/Phase 6 syntax, React Router typegen, strict TypeScript и ESLint прошли.
- `npm.cmd test`: 51/51 server и 92/92 unit/contract/component tests прошли.
- `npm.cmd run smoke`: production client/SSR build и coexistence smoke прошли.
- Phase 5/6 fixture contracts: 11/11 прошли.
- Phase 6 Chromium: 10 functional/accessibility scenarios прошли; 3 visual-only сценария ожидаемо skipped.
- Phase 6 visual matrix: 9 snapshot assertions прошли, 56 project-tests ожидаемо skipped по viewport gating. Проверены `360x800`, `390x844`, `768x1024`, `1440x900`, `1920x1080`.
- Phase 5 regression: 28 passed, 52 ожидаемо skipped.
- Phase 4 regression: 16 passed, 24 ожидаемо skipped.
- 11 Phase 6 PNG занимают 3 305 586 bytes. Login/register/favorites проверены на mobile и desktop, profile — на всех пяти baseline viewport.

## Visual Freeze и accessibility

React-маршруты используют существующие CSS, изображения, typography, breakpoints и dialog-композицию. Отдельная строка удаления favorite была выявлена ручным сравнением и удалена как regression; финальный диалог снова совпадает с legacy-сценарием.

Axe блокирует все неожиданные serious и critical нарушения. У frozen legacy palette остаётся известный `color-contrast` debt в auth dialog (`eyebrow`, вспомогательный текст, divider и social note). Тайная смена цветов нарушила бы Visual Freeze, поэтому исправление вынесено в отдельную согласуемую accessibility/design задачу этапа 10.

## Ограничения и эксплуатация

- Реальные OAuth credentials/providers не вызываются в массовом E2E; browser flow проверяется deterministic fixture seam.
- Смена user-session secret намеренно инвалидирует cookies, ранее подписанные неверным admin-secret fallback.
- CLI/server-to-server unsafe auth requests должны передавать подтверждённый same-origin `Origin` или `Sec-Fetch-Site: same-origin`.
- Database migrations, Storage mutations, production aliases и production deployment отсутствуют.
- GenericAgent установлен отдельно, но до локального `C:\Users\kir21\GenericAgent\ga.cmd configure` не является рабочей LLM-сессией и не использовался фиктивно.

## Откат

После публикации Phase 6 откатывается обычным `git revert` соответствующего implementation commit. Это возвращает React account routes и security changes к предыдущему checkpoint, но не восстанавливает внешние secrets, cookies или данные Supabase. Production deployment на этапе 6 не выполняется.
