# Аудит перед миграцией Mesto на React

Дата фиксации: 5 августа 2026 года

Статус: complete для локальной части Phase 0; production measurements остаются внешним blocker

Основной план: `docs/REACT_MIGRATION_PLAN.md`

## 1. Проверенная точка восстановления

- Migration remote: `https://github.com/Krevetkaaaa/mesto-react-migration`.
- Branch: `codex/react-migration`.
- Canonical baseline commit: `ee8476473b64de946d81dc1adbcd7dc3871e4ac9`.
- Canonical baseline tag: `pre-react-migration-20260805-1916`.
- Branch и dereferenced annotated tag проверены через remote refs.
- Исходный `origin` отключён GitHub и возвращает HTTP 403. Он не считается резервной копией.

## 2. Режим миграции и Visual Freeze

Это техническая preserve-migration, не редизайн. Текущие HTML, CSS, тексты, изображения, responsive breakpoints, hover/focus/active states и motion являются визуальным контрактом.

Критически важен текущий порядок публичных CSS:

1. `styles.css`;
2. `gastro-theme.css`;
3. `ambient-premium.css`;
4. `phone-premium.css`;
5. `editorial-sections.css`.

Эти файлы содержат несколько поколений перекрывающихся правил. До доказанного visual parity запрещено менять порядок, объединять или «чистить» их. Публичные страницы используют Cormorant Garamond и Manrope через Google Fonts. Merchant и admin используют тот же font stack в собственных CSS.

До переноса каждого маршрута требуются screenshots в 360x800, 390x844, 768x1024, 1440x900 и 1920x1080, включая стабильные интерактивные состояния. Новый snapshot не может автоматически заменить legacy baseline.

## 3. Текущая реализация

| Область | Legacy entry | Размер исходника | Наблюдаемая DOM-нагрузка |
| --- | --- | ---: | --- |
| Public | `index.html`, `app.js` | 93 KiB HTML, 104 KiB JS | 178 querySelector calls, 60 listeners, 18 innerHTML writes |
| Merchant | `merchant.html`, `merchant.js` | 15 KiB HTML, 44 KiB JS | 9 querySelector calls, 23 listeners, 8 innerHTML writes |
| Admin | `admin.html`, `admin.js` | 14 KiB HTML, 27 KiB JS | 60 querySelector calls, 20 listeners, 9 innerHTML writes |

Публичный статический shell из HTML, JavaScript и подключённых CSS весит около 447.5 KiB до сжатия и без изображений/шрифтов. В tracked `assets/` находятся 26 файлов общим объёмом около 15.83 MiB. Пять самых тяжёлых PNG занимают примерно 1.7-2.2 MiB каждый. Это baseline для последующего asset и LCP budget, а не целевой результат оптимизации внутри Visual Freeze.

Legacy venue card содержит nested interactive markup: внешний `button.venue-card` и вложенные action/favorite buttons. React не должен буквально воспроизводить недопустимую вложенность. Допустимое внутреннее изменение: семантический `article` с отдельными кнопками, сохранёнными class names, геометрией, click behavior, focus order и stopPropagation. Такое изменение требует e2e и visual regression.

## 4. Маршруты и критические пользовательские сценарии

### Public и account

- загрузка главной и статических информационных секций;
- открытие каталога, поиск, city/category фильтры, сортировка и пагинация;
- открытие venue card, меню и акций;
- открытие/закрытие mobile navigation и dialogs;
- login, register, logout, session restore и session expiry;
- VK/Yandex/Google OAuth return через управляемый test seam;
- добавление/удаление favorite, включая запрос входа для гостя;
- отправка venue submission, review и photos;
- `/help`;
- будущие адресуемые `/catalog`, `/city/:citySlug`, `/venue/:venueSlug`, `/profile`, `/favorites`.

### Merchant

- login и server-side role check;
- overview, venue selection и navigation;
- venue editor, menu items, promotions и reviews;
- password change, confirmations, dangerous actions;
- unsaved draft warning, double-submit protection, dialogs и mobile sidebar.

### Admin

- отдельный admin login/session/logout;
- overview с частично отказоустойчивыми sections;
- moderation submissions и reviews;
- venue CRUD;
- merchant creation/status/memberships/password reset;
- подтверждение dangerous actions и удаление one-time credentials из DOM после закрытия dialog.

## 5. Планировочный профиль данных и нагрузки

До появления production analytics зафиксирована проверяемая гипотеза:

- несколько тысяч зарегистрированных пользователей;
- до 1 000 DAU;
- до 100 одновременно активных пользователей в штатном режиме;
- burst до 300;
- 85-95% запросов приходится на public reads;
- 1 000 одновременных пользователей не обещаны и требуют отдельной capacity review.

Локальный исследовательский dataset используется только как planning proxy, не как production truth:

- 544 restaurants;
- 1 021 photo records;
- 158 records marked for review;
- JSON snapshot около 1.4 MiB.

Production catalog size, Supabase row counts, Storage usage, CDN hit ratio и реальные DAU/concurrency пока неизвестны.

## 6. Provisional browser contract

Пока владелец не дал отдельную browser matrix, Phase 1 использует:

- pinned Chromium для visual baseline;
- последние стабильные Chromium/Edge, Firefox и WebKit для функционального smoke;
- обязательные viewport из Visual Freeze: 360x800, 390x844, 768x1024, 1440x900 и 1920x1080;
- keyboard-only smoke и `prefers-reduced-motion`;
- light/dark theme parity в пределах уже существующего theme behavior.

Этот contract является явным рабочим допущением и может быть расширен без изменения Visual Freeze.

## 6.1. Canonical URL и compatibility policy

- `/` остаётся canonical home.
- `/index.html` получает permanent redirect на `/` только после проверки production routing.
- `/help` становится canonical, `/help.html` перенаправляется на `/help` после route parity.
- `/merchant` перенаправляет на `/merchant/overview`; старый `/merchant.html` сохраняется как fallback до завершения merchant phase, затем перенаправляется.
- `/admin` перенаправляет на `/admin/overview`; старый `/admin.html` сохраняется как fallback до завершения admin phase, затем перенаправляется.
- `/?open=submission` получает совместимый addressable modal route без изменения dialog layout.
- `/?open=favorites` и `/?open=profile` сохраняются до переноса session/account и затем получают documented redirect в `/favorites` и `/profile`.
- `/login`, `/register` и `/venue/:venueSlug` используют modal-route composition на public shell, пока Visual Freeze требует legacy dialog geometry.

Canonical venue slug должен храниться или вычисляться на server boundary и быть уникальным/стабильным. Нельзя использовать только изменяемый title. До backward-compatible API extension slug routes остаются implementation blocker; production schema change выполняется отдельной additive migration с rollback plan.

## 6.2. Deterministic test identities

Phase 1 fixtures используют только вымышленные UUID и данные, не совпадающие с production users:

- active customer;
- merchant owner/manager;
- merchant content_editor;
- merchant analyst;
- admin в отдельном admin-session seam.

Fixture environment: locale `ru-RU`, timezone `Europe/Simferopol`, фиксированный clock `2026-08-05T12:00:00+03:00`. OAuth не вызывает внешних providers: callback success/error моделируются через test seam. Mock-based browser tests обозначаются как component/contract e2e и не выдаются за full preview e2e с настоящей test DB.

## 7. Текущие проверки и quality targets

Проверено до React edits:

- `npm test`: 19/19 server tests прошли;
- `npm run check`: syntax check прошёл;
- Node.js 24.18.0 и npm 11.16.0;
- secret scan текущего дерева и 71 локального commit не нашёл высокосигнальных credential patterns;
- baseline branch/tag доступны на новом remote.

Цели на production-like данных:

- LCP p75 <= 2.5 s;
- INP p75 <= 200 ms;
- CLS p75 <= 0.1;
- expected profile 100 VU и burst 300 VU имеют заранее заданные thresholds;
- public cache policy подтверждается response headers и cache hit behavior;
- personal, merchant и admin responses остаются private/no-store.

Локальный resource baseline зафиксирован в `docs/BASELINE_METRICS.md`. На desktop navigation главная выполняет 35 запросов и передаёт около 14,76 MB в детерминированном fixture environment; `/help` выполняет 6 запросов и передаёт около 0,38 MB. Lighthouse `13.4.1` пока заблокирован Windows `EPERM` при cleanup временного Chrome profile, поэтому FCP/LCP/TBT/CLS не выдумываются и остаются обязательной повторной проверкой. Production latency и platform metrics без Vercel/Supabase access также неизвестны.

## 8. Environment contract без значений

Текущие server-only names:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `MESTO_ADMIN_LOGIN`;
- `MESTO_ADMIN_PASSWORD_HASH`;
- `MESTO_ADMIN_SESSION_SECRET`;
- `MESTO_USER_SESSION_SECRET`;
- `MESTO_PUBLIC_ORIGIN`;
- `VK_ID_APP_ID`;
- `VK_ID_SERVICE_TOKEN`;
- `YANDEX_OAUTH_CLIENT_ID`;
- `YANDEX_OAUTH_CLIENT_SECRET`.

Ни одно значение не должно попадать в client bundle, fixtures, screenshots, traces или Git. User/admin session secrets должны стать обязательными, раздельными и иметь разные token audiences.

## 9. Подтверждённые архитектурные и эксплуатационные риски

- `lib/http.js` перезаписывает явный `Cache-Control` значением `no-store`.
- Четыре набора process-local `Map` rate limits не работают распределённо на serverless.
- Все backend Supabase calls используют service role, поэтому handler checks являются реальной security boundary.
- Public venue content не проверяет published status.
- Public venue content выполняет Auth Admin `listAuthUsers(page=1, per_page=1000)` на каждом запросе и не масштабируется за первую тысячу users.
- `/api/venues` не возвращает slug; get-by-slug contract для SSR venue route отсутствует.
- Wildcard search, exact count и deep offset требуют EXPLAIN/load measurement. Exact count нельзя удалить незаметно: legacy показывает total пользователю.
- Uploads передаются base64 через function; нет dimension/pixel limits, re-encode, derivative generation, lifecycle cleanup и private staging.
- Admin venue PATCH с отсутствующим/невалидным id может создать запись.
- Merchant dashboard раскрывает reviews роли `content_editor`, хотя permission отсутствует.
- Нет production monitoring, shared limiter provider и безопасного cache invalidation seam.

Подробный HTTP baseline находится в `docs/API_CONTRACT_BASELINE.md`.

## 10. Внешние блокеры

- Нет production analytics для уточнения DAU/concurrency и реальных Web Vitals.
- Нет Supabase access для `EXPLAIN ANALYZE`, фактической schema/RLS/Storage проверки и representative query timings.
- Нет разрешённой production-like load target.
- Нет выбранного distributed rate-limit provider.
- Нет Vercel preview metrics и подтверждённого CDN invalidation path.
- OAuth e2e требует provider test credentials и callback configuration.
- GenericAgent установлен, но ни одна обнаруженная копия не имеет рабочей LLM-сессии. Codex subscription auth им не поддерживается.

Эти блокеры запрещают заявлять production readiness, но не мешают создать локальные seams, safety tests, React foundation и route-by-route migration.

Подробный визуальный baseline, theme tokens, breakpoints, motion timings и разрешённые узкие поведенческие исключения находятся в `docs/VISUAL_FREEZE_CONTRACT.md`.
