# Hotfix 05B — исправление формата ответа на ввод буквы

Накладывается **поверх Patch 05 v2** (после выполнения миграций 004 и 005).

## Причина

`PATCH /api/v1/game/attempts/:id/cells/:position` возвращал `{ "cell": { "correct": ... } }`, тогда как игровой сервис, оба smoke-теста и документация ожидают плоский результат `{ "correct": ..., "triesRemaining": ... }`.

Исправлена ровно одна строка в `routes/game.js`. Дополнительно включены два регрессионных unit-теста на контракт ответа.

## Что заменить

Распакуй ZIP в `D:\Bloger\BlogerGrameGame-backend` (корень проекта) с заменой `routes/game.js`; `tests/cell-response-contract.test.js` добавится автоматически.

```powershell
cd D:\Bloger\BlogerGrameGame-backend
npm test
npm run game:smoke
npm run economy:smoke
npm run auth:smoke
npm run db:status
```

Ожидается **50/50 модульных тестов**, а smoke-тесты должны продолжить выполнение после ранее падавших строк 49 и 80. Интеграционные тесты запускаются против твоей локальной PostgreSQL. Если после этого откроется новая ошибка, пришли вывод; её нужно будет расследовать отдельно.

**Никаких новых миграций, изменений `.env`, очистки базы, пересоздания контейнера и импорта цитат не требуется.** Не меняй хеши в `schema_migrations`.

Затем, если тесты проходят и ветка `feat/05-economy` создана от `main`, коммить и отправляй PR. Для проверки `git status --short` и `git branch --show-current`.
