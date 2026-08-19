# Legacy browser safety net

Этот набор проверяет текущий HTML/CSS/JavaScript до переноса маршрутов на React. Локальный server использует только вымышленные UUID, адреса `example.test` и детерминированное состояние; это browser UI/contract safety net, а не проверка production Supabase или настоящих OAuth providers.

## Закреплённая среда baseline

- `@playwright/test`: `1.62.1`.
- Baseline browser: Google Chrome `151.0.7922.72` на Windows.
- Playwright Chromium для `1.62.1`: revision `151.0.7922.34`; его CDN download в текущем регионе возвращает HTTP 403. Для baseline используется официальный Chrome for Testing `151.0.7922.72` из `https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.72/win64/chrome-win64.zip`, SHA-256 `F77DFDF2978865CD1B8B98BD6FF72839E91650B9CBF43051F54C1A0811C183E5`.
- `deviceScaleFactor`: `1`.
- Locale: `ru-RU`.
- Timezone: `Europe/Simferopol`.
- Clock: `2026-08-05T09:00:00.000Z` (`12:00` UTC+03:00).
- Motion: `prefers-reduced-motion: reduce`; finite animations завершаются перед canonical capture, infinite decorative animations останавливаются в детерминированной позиции.
- Fonts: локальные WOFF2 из закреплённых `@fontsource/manrope@5.3.0` и `@fontsource/cormorant-garamond@5.3.0`.
- API/data: stateful fixture server, reset перед каждым тестом, один worker.

`playwright.config.js` сначала использует `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, затем установленный Playwright browser. На Windows fallback на системный Chrome разрешён только при наличии `chrome.exe`, но он подходит лишь для диагностики/functional checks: Visual Freeze считается воспроизводимым только на exact baseline binary. CI скачивает архив выше, проверяет hash и версию до запуска полного `npm run test:e2e`.

Даже exact binary не унифицирует субпиксельную растеризацию текста между Windows 11 и Windows Server GitHub Actions. Все legacy и Phase 4–8 Visual Freeze сравнения поэтому используют один ограниченный cross-host допуск `3 000` пикселей из `e2e/support/visual-freeze.js`: подтверждённый максимум CI составляет `2 615` пикселей (`0.01` в округлённом отчёте Playwright), при этом размеры PNG и полный документ проверяются отдельно. Снимки при таком расхождении не обновляются; геометрические сдвиги по-прежнему превышают этот предел на порядки.

## Команды

Обычная проверка, включая функциональные, axe smoke и visual regression:

```powershell
npm.cmd run test:e2e
```

Миграционные suites запускаются отдельно, чтобы новый route сравнивался с теми же frozen Phase 1 PNG без snapshot update:

```powershell
npm.cmd run test:e2e:phase4
npm.cmd run test:e2e:phase5
npm.cmd run test:e2e:phase6
npm.cmd run test:e2e:phase7
npm.cmd run test:e2e:phase8
```

Phase 8 использует `e2e/phase8-playwright.config.js`: один Chromium-проект выполняет admin functional/fixture/Axe scenarios, пять fixed-viewport проектов проверяют canonical login, overview, submissions, reviews, venues, merchants и утверждённые interactive states. Единый cross-host порог остаётся `3000` pixels; `--update-snapshots` в Phase 8 запрещён без отдельного согласования Visual Freeze.

Явный воспроизводимый local override:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = Join-Path $env:USERPROFILE '.codex\tools\chrome-for-testing\151.0.7922.72\chrome-win64\chrome.exe'
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
