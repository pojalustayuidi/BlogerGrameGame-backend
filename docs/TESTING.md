# Проверка и качество

Тестирование состоит из трёх уровней: модульные проверки правил, интеграционные smoke-тесты с PostgreSQL и автоматический запуск в GitHub Actions.

## Основные команды

| Команда | Что проверяет |
|:--|:--|
| `npm test` | Правила шифра, экономику, миграции, токены и HTTP-контракты |
| `npm run db:migrate` | Применение или безопасный пропуск миграций |
| `npm run db:smoke` | SQL-связи и инварианты, в транзакции с откатом |
| `npm run auth:smoke` | Гостя, `me`, ротацию access/refresh и logout |
| `npm run game:smoke` | Неверную букву, три попытки, одну жизнь, сохранение клетки и автопобеду |
| `npm run economy:smoke` | Цены, повторную покупку, подсказку одной клетки, ноль жизней и регенерацию |
| `npm run db:status` | Таблицы, миграции, число уровней и игроков |
| `npm audit` | Известные уязвимости npm-зависимостей |

## Полная локальная проверка

```powershell
docker compose up -d
npm ci
npm run db:migrate
npm run db:migrate
npm run db:seed
npm run content:import-drafts
npm test
npm run db:smoke
npm run auth:smoke
npm run game:smoke
npm run economy:smoke
npm run db:status
npm audit
```

Интеграционные сценарии поднимают временный localhost HTTP-сервер на свободном порту, создают **тестового гостя** и удаляют его и связанный прогресс после проверки. Они не должны удалять других игроков и каталог цитат. Для дополнительных проверок перед работой с БД сделайте резервную копию.

## На что смотреть в логах

```text
PASS: immediate wrong-letter feedback, 3 tries = 1 life, retry idempotency
PASS: one cell accepted, matching number not filled, independent notes
PASS: last correct cell auto-solves, one reward and gated bonus reveal
```

```text
PASS: server-owned shop prices and idempotent purchases
PASS: one-cell hint costs once, is immutable, and never auto-fills equal numbers
PASS: zero lives blocks input and hints; buying one life unlocks play
PASS: 30-minute regeneration works without a background timer
```

Число модульных тестов увеличивается с развитием проекта; важны **нулевые падения** и прохождение интеграции, а не зафиксированная навсегда цифра.

## CI

Workflow находится в `.github/workflows/backend-ci.yml`. В Pull Request к `main` и после push в `main` запускаются Node.js, npm, PostgreSQL service, миграции, импорт и smoke-тесты. Для CI используется отдельная тестовая база, не локальные пользовательские данные.

Перед слиянием PR проверьте, что workflow завершился успешно. Если упала интеграция, не игнорируйте её только потому, что модульные тесты зелёные.

## Регрессии, которые особенно важно не пропустить

1. Повторный номер шифра **не** заполняет другую клетку.
2. Повтор `requestId` на неправильную букву не забирает вторую попытку.
3. Каждая третья ошибка отнимает **ровно** одну жизнь.
4. Нельзя получить вторую награду за уже пройденный уровень.
5. Чужая попытка недоступна по случайно известному UUID.
6. Черновой текст цитаты и имя автора не попадают в список уровней до победы.
7. Нельзя получить жизнь или монеты отправкой клиентской суммы.
