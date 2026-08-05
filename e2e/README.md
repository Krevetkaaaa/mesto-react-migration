# Legacy browser safety net

Этот набор проверяет текущий HTML/CSS/JavaScript до переноса маршрутов на React. Локальный server использует только вымышленные UUID, адреса `example.test` и детерминированное состояние; это browser UI/contract safety net, а не проверка production Supabase или настоящих OAuth providers.

## Закреплённая среда baseline

- `@playwright/test`: `1.62.1`.
- Baseline browser: Google Chrome `151.0.7922.72` на Windows.
- Playwright Chromium для `1.62.1`: revision `151.0.7922.34`; его CDN download в текущем регионе возвращает HTTP 403, поэтому локально используется явно проверенный системный Chrome patch `151.0.7922.72`.
- `deviceScaleFactor`: `1`.
- Locale: `ru-RU`.
- Timezone: `Europe/Simferopol`.
- Clock: `2026-08-05T09:00:00.000Z` (`12:00` UTC+03:00).
- Motion: `prefers-reduced-motion: reduce`; finite animations завершаются перед canonical capture, infinite decorative animations останавливаются в детерминированной позиции.
- Fonts: локальные WOFF2 из закреплённых `@fontsource/manrope@5.3.0` и `@fontsource/cormorant-garamond@5.3.0`.
- API/data: stateful fixture server, reset перед каждым тестом, один worker.

`playwright.config.js` сначала использует `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, затем установленный Playwright browser. На Windows fallback на системный Chrome разрешён только при наличии version directory `151.0.7922.72`; после browser update visual baseline нельзя молча пересоздавать.

## Команды

Обычная проверка, включая функциональные, axe smoke и visual regression:

```powershell
npm.cmd run test:e2e
```

Явный воспроизводимый local override:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run test:e2e
```

Baseline нельзя обновлять автоматически в CI. `--update-snapshots` допустим только при первичном создании заранее определённого legacy state или после объяснённого намеренного изменения и ручного просмотра actual PNG.

## Матрица снимков

В `e2e/__screenshots__/` хранятся:

- 90 canonical full-page PNG: 18 экранов × `360x800`, `390x844`, `768x1024`, `1440x900`, `1920x1080`;
- 60 viewport/state/theme PNG для dialogs, loading/error, permissions, empty states, editors, mobile navigation и graphite/midnight.

Canonical screenshots снимаются через Chromium DevTools Protocol на полной высоте документа и строго ширине viewport. Это исключает невидимый horizontal overflow декоративного `.hero-photo`, который Chrome включает в `body.scrollWidth`, хотя `documentElement.scrollWidth` и пользовательский viewport остаются неизменными. Test helper проверяет PNG width/height до сравнения.

## Ограничения

- Fixture login намеренно подтверждает UI flow и cookie/session behavior, но не реальную password verification.
- OAuth success/error выполняется через управляемый callback seam без внешнего provider.
- Axe на Phase 1 блокирует только `critical` violations. Полный serious/moderate, keyboard, focus-return и authenticated workspace gate относится к Phase 10.
- Настоящие preview E2E требуют отдельного test Supabase project, test accounts и OAuth callback configuration.
