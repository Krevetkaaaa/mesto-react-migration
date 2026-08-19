# Phase 2: Vercel coexistence contract

Дата проверки: 5 августа 2026 года

## Зачем нужна явная конфигурация

Переходный release одновременно содержит:

- legacy static routes `/`, `/help`, `/merchant`, `/admin`;
- единственный React Router SSR route `/__react/health`;
- CommonJS backend под `/api/*`.

Vercel zero-config не собирает эти две runtime-модели вместе. Кроме того, React Router создаёт implicit `index.func`, который без явного приоритета перехватывает `/` у legacy `index.html`. Успешный `react-router build` этого дефекта не обнаруживает.

`vercel.json` поэтому закрепляет два exact builder и low-level route order. Сначала обслуживаются canonical legacy URL, затем API rewrite, затем filesystem outputs React Router и статики, после чего неизвестный путь получает 404. Никакого общего React catch-all на Phase 2 нет.

В development serve-only Vite middleware отдаёт ровно четыре legacy document route и их `.html` aliases до React Router middleware. Он не участвует в production build и не подменяет API; production topology определяется только Vercel routes.

## Проверенный Preview

- Deployment: `dpl_GspxSWrXyeP8oQtJh4ZFbUx8CwHi`.
- URL: `https://mesto-city-guide-irenl5h1a-krevetkaaaas-projects.vercel.app`.
- Target: Preview; production не изменялся.
- Vercel deployment protection включён; HTTP matrix проверена через authenticated `vercel curl`.

Проверенная матрица:

| Path | Результат |
| --- | --- |
| `/` | `200 text/html`, legacy document; исходный `index.html` является точным prefix, после него Vercel Preview добавляет только feedback-toolbar script |
| `/index.html` | `308` на `/` |
| `/help`, `/merchant`, `/admin` | `200`, соответствующий legacy document |
| `/help.html` | `308` на `/help` |
| `/__react/health` | `200` SSR React, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` |
| `/__react/not-found` | `404`, не legacy homepage и не health route |
| `/api/phase2-unknown` | `404 application/json`, CommonJS API router |
| `/api/venues` | `200 application/json` |
| `/api/auth/yandex/callback` | `503 application/json` без provider config, то есть callback остаётся backend route |
| `/assets/mesto-hero.png` | `200 image/png`, SHA-256 совпадает с source asset |

## Локальное ограничение

`vercel build` 56.3.1 и 58.7.0 на этой Windows-машине доходят до создания React и API function outputs, но завершаются `EPERM` при создании служебного function symlink. Linux Preview build проходит полностью. Это ограничение локальной Windows policy, а не пропущенный build gate.

## Откат

Revert Phase 2 commit возвращает исходный single-API/static Vercel config. Preview deployment можно удалить отдельно; production deployment и aliases Phase 2 не менял.
