# Baseline-метрики legacy Mesto

Дата измерения: 5 августа 2026 года

Среда: Windows, Node.js `24.18.0`, npm `11.16.0`, Google Chrome `151.0.7922.72`

## Область измерения

Baseline снят с неизменённой legacy-реализации до React. HTTP-проверки выполнялись на детерминированном локальном fixture server, поэтому они описывают размер и поведение приложения, но не задержки Vercel, Supabase или production CDN.

Данные production analytics, реальные Web Vitals p75, Supabase timings и CDN hit ratio недоступны. Их нельзя заменять локальными цифрами.

## Размер исходных ресурсов

| Группа tracked-файлов | Файлов | Raw | gzip | Brotli q5 |
| --- | ---: | ---: | ---: | ---: |
| HTML, включая legacy pages и архитектурные диаграммы | 11 | 528 841 B | 133 770 B | 124 420 B |
| CSS | 9 | 332 599 B | 71 486 B | 68 009 B |
| JavaScript, включая browser, server и tests | 58 | 338 914 B | 99 446 B | 91 980 B |
| `assets/` | 26 | 16 601 940 B | 16 515 084 B | 16 522 004 B |

Эти агрегаты описывают дерево проекта, а не один browser navigation. Для публичного legacy runtime ключевые файлы имеют следующие размеры:

| Файл | Raw | gzip | Brotli q5 |
| --- | ---: | ---: | ---: |
| `index.html` | 93 432 B | 17 829 B | 16 128 B |
| `styles.css` | 128 124 B | 26 712 B | 25 487 B |
| `app.js` | 106 202 B | 24 859 B | 23 350 B |
| `help.html` | 16 528 B | 4 916 B | 4 491 B |
| `help.css` | 18 195 B | 4 447 B | 4 171 B |

Изображения являются главным bandwidth/LCP-риском. Повторное gzip/Brotli-сжатие почти не уменьшает уже сжатые PNG/JPEG. Самые тяжёлые файлы:

| Файл | Raw |
| --- | ---: |
| `assets/card-coffee.png` | 2,24 MB |
| `assets/card-dessert.png` | 2,09 MB |
| `assets/mesto-hero.png` | 1,97 MB |
| `assets/card-bar.png` | 1,87 MB |
| `assets/card-restaurant.png` | 1,80 MB |

Visual Freeze запрещает незаметно заменять эти изображения во время переноса. Responsive derivatives и современные форматы должны внедряться с visual regression и отдельной проверкой LCP.

## Локальный HTTP baseline

| Route | Status | `Content-Length` | `Cache-Control` | Content encoding |
| --- | ---: | ---: | --- | --- |
| `/` | 200 | 93 432 B | `no-store` | отсутствует |
| `/help` | 200 | 16 528 B | `no-store` | отсутствует |

Fixture server не реализует gzip/Brotli и не имитирует Vercel CDN. Эти заголовки нельзя выдавать за production cache/transfer measurement.

## Browser navigation baseline

Измерение выполнено чистым browser context в Chrome `151.0.7922.72`: viewport `1440x900`, `deviceScaleFactor: 1`, locale `ru-RU`, timezone `Europe/Simferopol`, `prefers-reduced-motion: reduce`. Google Fonts заменены закреплёнными локальными `@fontsource` WOFF2, API — детерминированным Phase 1 fixture. После события `load` ожидалось `document.fonts.ready` и 500 ms.

| Route | Requests, включая document | Transfer | Encoded body | Decoded body | DOMContentLoaded | Load |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 35 | 14 758 726 B | 14 748 826 B | 14 748 826 B | 148 ms | 433 ms |
| `/help` | 6 | 381 777 B | 380 577 B | 380 577 B | 39 ms | 173 ms |

Главная в первом desktop viewport загрузила 9 `<img>`-ресурсов и 13 ресурсов, инициированных CSS; только эти две группы передали около 14,3 MB. Также выполнены три fixture API-запроса: venues, auth providers и anonymous session probe.

Это однократный локальный lab-run с тёплым диском, без network/CPU throttling и без production CDN. Время `DOMContentLoaded`/`load` пригодно только как smoke baseline той же машины; оно не является Web Vitals или пользовательским p75. Request/byte totals воспроизводимы при закреплённых viewport, fonts, fixtures и browser version.

## Lighthouse blocker

Использован Lighthouse `13.4.1` через одноразовый `npx`, без изменения `package.json` или lockfile. Chrome успешно стартует, но `chrome-launcher` завершается ошибкой Windows `EPERM` при удалении временного профиля `Temp\lighthouse.*`; JSON-отчёт не создаётся. Это инструментальный blocker, а не результат приложения.

Воспроизводимая команда:

```powershell
npx.cmd --yes --package=lighthouse@13.4.1 lighthouse http://127.0.0.1:4173/ `
  --chrome-path="C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --only-categories=performance --output=json --output-path=<temporary-path>\home.json --quiet
```

Поэтому FCP, LCP, TBT и CLS сейчас не зафиксированы. До появления валидного отчёта нельзя утверждать соответствие целям LCP p75 `<= 2.5 s`, INP p75 `<= 200 ms` и CLS p75 `<= 0.1`.

## Сравнительный контракт

После миграции измерения повторяются в той же локальной среде и отдельно на Vercel Preview с production-like обезличенными данными. Сравниваются:

- request count, encoded/decoded transfer и critical JS по маршрутам;
- server-rendered HTML и status codes;
- Lighthouse mobile/desktop при исправном runner;
- реальные Web Vitals p75 после появления analytics;
- Vercel/Supabase latency, cache hit ratio и error rate;
- изображения, их фактически загруженные размеры и LCP element.
