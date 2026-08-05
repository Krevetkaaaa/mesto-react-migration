# Журнал миграции Mesto на React

## Git и точки восстановления

- Migration branch: `codex/react-migration`.
- Migration remote: `migration-origin` (`https://github.com/Krevetkaaaa/mesto-react-migration.git`).
- Видимость нового remote: public, создан по явному разрешению владельца 5 августа 2026 года.
- Legacy remote `origin` недоступен: GitHub возвращает HTTP 403 и сообщает, что репозиторий отключён из-за trade-controls restriction.
- Локальная исходная ветка до миграции: `codex/database-catalog`.
- Последний локальный исходный commit до чистого baseline: `c03adf8`.
- Baseline commit: будет записан после создания и проверки remote ref.
- Baseline tag: будет записан после создания и проверки remote ref.

Новый migration remote начинается с чистого root commit. Полная локальная object-база старого отключённого репозитория не публикуется: она занимает около 1 GiB и не нужна для отката миграции. Baseline содержит текущее проверенное дерево исходников, конфигурацию, схемы, документацию и архитектурные диаграммы. Локальные `work/` и `outputs/` исключены: это около 2,5 GiB исследовательских данных и сгенерированных артефактов.

## Проверки перед baseline

- `npm test`: прошло 19 из 19 server tests.
- `npm run check`: синтаксическая проверка всех перечисленных legacy и server JavaScript-файлов прошла.
- Текущая среда: Node.js 24.18.0, npm 11.16.0.
- Поиск высокосигнальных секретов в текущих кандидатах и 71 локальном commit: совпадений не найдено.
- История не содержит tracked путей `work/` или `outputs/` и blobs крупнее 10 MiB.
- Visual baseline: ещё не создан.
- E2E baseline: ещё не создан.

## Этапы

| Этап | Статус | Commit | Проверки | Ограничения и откат |
| --- | --- | --- | --- | --- |
| Baseline checkpoint | in progress | pending | server tests и syntax check прошли | После создания откат по annotated baseline tag |
| 0. Требования и показатели | in progress | pending | аудит выполняется | Нагрузочный профиль пока является гипотезой из плана |
| 1. Legacy safety net | pending | pending | pending | Legacy остаётся рабочим fallback |
| 2. Framework foundation | pending | pending | pending | Не начат до подтверждённого baseline push |
| 3. Core modules | pending | pending | pending | Не начат |
| 4-8. Route migration | pending | pending | pending | Visual Freeze обязателен для каждого маршрута |
| 9-11. Scale and quality | pending | pending | pending | Distributed limiter требует внешнего shared-state provider |
| 12. Cutover preparation | pending | pending | pending | Merge и production deploy требуют отдельного разрешения |

## GenericAgent

Основная установка GenericAgent в `C:\Users\kir21\GenericAgent` не имеет `mykey.py`, локального OpenAI-compatible backend или поддерживаемой авторизации через Codex subscription. Обнаруженная вложенная локальная копия `genericagent/` исключена из Git; её единственный профиль является пустым `mixin_config` и инициализируется как `BADCONFIG_MIXIN`, а не как рабочая LLM-сессия. Реальные LLM-задачи через GenericAgent сейчас заблокированы. Подключение выполняется владельцем локально через `C:\Users\kir21\GenericAgent\ga.cmd configure`; секрет не должен передаваться в чат или Git.

## Общий rollback

До production cutover legacy HTML, CSS и JavaScript сохраняются. Кодовый откат опубликованной migration branch выполняется через `git revert` или развёртывание проверенного baseline tag. Force push и переписывание опубликованной истории запрещены. Git не откатывает Supabase data, Storage, environment variables или внешние сервисы.
