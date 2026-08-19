# Visual Freeze contract Mesto

Дата: 5 августа 2026 года

Назначение: проверяемый визуальный и поведенческий baseline для route-by-route React migration

## Режим

React migration не меняет видимый дизайн. Все значения ниже извлечены из legacy HTML/CSS/JS и сохраняются до отдельного письменного решения. Несовпадение snapshot нельзя исправлять автоматическим обновлением baseline.

## CSS cascade

Public route сохраняет точный порядок:

1. `styles.css`;
2. `gastro-theme.css`;
3. `ambient-premium.css`;
4. `phone-premium.css`;
5. `editorial-sections.css`.

`/help` использует `help.css`. Merchant использует `merchant.css`. Admin использует `admin.css`, затем `admin-overrides.css`.

До доказанного parity запрещены объединение файлов, перестановка слоёв, переименование class names и общая «чистка» cascade.

## Typography

- Public/help body: Manrope 400/500/600/700/800.
- Public/help headings: Cormorant Garamond 500/600/700.
- Merchant headings: Cormorant Garamond 600/700.
- Minimum document width: 320px.
- Font loading и line wrapping являются частью screenshot contract.

## Public themes

| Token | Light | Graphite | Midnight |
| --- | --- | --- | --- |
| ink | `#211f1c` | `#f2efe9` | `#edf3fb` |
| muted | `#746f69` | legacy CSS value | legacy CSS value |
| paper | `#fbfaf7` | dark surface family | dark surface family |
| cream | `#f4efe8` | `#111214` | `#0a1320` |
| elevated surface | `#eee5da` | `#1b1d20` | `#111c2c` |
| line | `#e5ded5` | legacy CSS value | legacy CSS value |
| gold/accent | `#b08a58` | `#d3aa70` | `#84b7e8` |
| black | `#222220` | legacy CSS value | legacy CSS value |

Также сохраняются отдельные token families `--ambient-*`, `--phone-*`, `--editorial-*` и старые `--ink/--accent/...`, пока любой legacy selector продолжает их использовать.

Help core palette: `#211f1c`, `#716c66`, `#fbfaf7`, `#f4efe8`, `#e4ddd4`, `#ae8755`.

Merchant palette:

- ink `#17202c`;
- muted `#718094`;
- navy `#102235`;
- blue `#3478b9`;
- warm `#c6955f`;
- green `#387961`;
- red `#b54b4b`;
- canvas `#f4f7f9`;
- line `#dce4ea`;
- component radius 18px.

Admin palette:

- ink `#191816`;
- muted `#756f68`;
- cream `#f5f0e8`;
- panel `#fffdfa`;
- line `#e8dfd5`;
- gold `#b78953`;
- navy `#101d2f`;
- green `#3d7d68`;
- red `#b95151`.

## Geometry

- Header container: `min(1480px, 100% - 64px)`.
- Hero/content container: `min(1420px, 100% - 96px)`.
- Search container: `min(1320px, 100% - 96px)`.
- Public venue cards: 3 columns, media 300px, body 365px in the current desktop layout.
- Categories: 8 columns in the current desktop layout.
- Venue dialog: 2 columns, media 420px.
- Public footer remains full width.

## Breakpoints

Public cascade содержит пересекающиеся media rules на:

`340`, `360`, `430`, `520`, `660`, `760/761`, `840`, `900`, `950`, `1100`, `1199`, `1440`, а также `hover/pointer:fine`, `prefers-reduced-motion` и print.

При ширине ниже 660px одновременно действуют старые 660px и новые 760px rules. Их нельзя механически заменить единым framework breakpoint.

- Help: 580px, 900px.
- Merchant: 390px, 680px, 900px, 1180px.
- Admin: 760px, 1050px.

## Motion timings

- Hero enter: 1s.
- Ambient hero Ken Burns: 26s.
- Atlas: 30s; coastline: 22s; light: 19s.
- Phone orbit: 18s; drift: 14s.
- Phone content interval: 4400ms; swap: 190ms.
- Map route: 7s; pins: 3.3s; chips: 5s.
- Catalog pulse: 2.4s.
- Reveal: 580-720ms; stagger: 45ms.
- Favorite flight: 760ms; cleanup: 900ms.
- Toast: public 2600ms, merchant 3300ms, admin 3600ms.
- Existing reduced-motion behavior сохраняется. Admin gap фиксируется отдельно: собственного reduced-motion media rule сейчас нет.

## Legacy states to capture

### Public

- home;
- categories;
- catalog populated, empty, loading and error fallback;
- profile;
- help;
- venue, login, register, review, submission and favorites dialogs;
- mobile nav and custom select open;
- favorite guest first/second click, authenticated success and rollback;
- light, graphite and midnight theme;
- responsive and keyboard focus states.

### Merchant

- login and boot/loading;
- wrong role/session expiry;
- empty workspace and multiple venue selector;
- overview, venue, menu, promotions and reviews;
- forced password change;
- owner/manager, content_editor and analyst permissions;
- editor/delete dialogs, unsaved draft and mobile sidebar.

### Admin

- login;
- overview, submissions, reviews, venues and merchants;
- DB/setup error and partial dashboard error;
- empty/loading tables;
- create/edit/delete dialogs;
- approve/reject dialog events;
- one-time credentials visible and scrubbed after close;
- mobile navigation.

## Required screenshot environment

- pinned Chromium and deviceScaleFactor 1;
- locale `ru-RU`;
- timezone `Europe/Simferopol`;
- fixed clock and deterministic API fixture data;
- pinned/local fonts and images where possible;
- `document.fonts.ready` before capture;
- animations disabled or completed for primary pixel snapshots;
- separate behavioral tests for motion;
- viewports 360x800, 390x844, 768x1024, 1440x900 and 1920x1080.

## Approved internal corrections and target behavior

План сам требует несколько наблюдаемых улучшений поверх Visual Freeze. Они считаются разрешёнными только в следующей узкой форме:

- catalog filters переходят в URL search params без изменения control layout и labels;
- Back/Forward восстанавливает view/filter state;
- retry, session-expiry и unsaved-draft safeguards добавляются с использованием существующих feedback/dialog patterns;
- `/login` и `/register` реализуются как addressable modal routes, визуально совпадающие с legacy dialogs;
- `/venue/:venueSlug` на первом совместимом UI может использовать modal-route composition на public shell, чтобы сохранить legacy dialog geometry;
- invalid nested interactive venue card заменяется семантическим `article` с отдельными buttons при сохранении CSS classes, geometry, click behavior, focus order и stopPropagation.

Любое более широкое изменение требует нового письменного решения и отдельного visual review.
