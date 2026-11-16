# Локальный запуск

> **Назначение:** Windows 11, PowerShell, Docker Desktop и Node.js 20+. Это руководство относится к локальному backend; публичное развёртывание пока не поддерживается.

## Что понадобится

- **Git** — чтобы клонировать репозиторий и работать с ветками.
- **Node.js 20+ / npm** — для сервера и тестов.
- **Docker Desktop** с запущенным Docker Engine — для PostgreSQL 17.
- **PowerShell** — примеры команд написаны для него.

Проверка инструментов:

```powershell
git --version
node --version
npm --version
docker compose version
```

## Вариант A. Первый запуск из чистой копии

```powershell
git clone https://github.com/pojalustayuidi/BlogerGrameGame-backend.git
cd BlogerGrameGame-backend
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
npm run db:migrate
npm run db:seed
npm run content:import-drafts
npm run dev
```

Сценарий `setup-local.ps1` создаёт `.env`, если его нет, генерирует случайный `ADMIN_API_KEY`, поднимает контейнер и проверяет зависимости. **Он не заменяет значения пароля, скопированные из `.env.example`.** Это допустимо только для изолированного локального тестирования: для собственного нового окружения лучше задать уникальный пароль *до первого создания тома* (см. вариант B).

## Вариант B. Настроить `.env` самостоятельно

```powershell
Copy-Item .env.example .env
notepad .env
```

Установите собственный длинный пароль в **обоих** полях `PGPASSWORD` и `POSTGRES_PASSWORD`; значения должны совпадать при первом запуске чистой БД. Для `ADMIN_API_KEY` нужна случайная шестнадцатеричная строка длиной 64 символа. Сгенерировать её в PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
-join ($bytes | ForEach-Object { $_.ToString('x2') })
```

Скопируйте полученное значение в `ADMIN_API_KEY`. Не публикуйте `.env` и не передавайте ключ мобильному приложению.

Далее:

```powershell
docker compose up -d
npm ci
npm run db:migrate
npm run db:seed
npm run content:import-drafts
npm test
npm run dev
```

По умолчанию сервер: `http://127.0.0.1:8085`, PostgreSQL: `127.0.0.1:5433`.

> **Важно:** PostgreSQL запоминает пароль в данных своего тома. Если база уже существует, изменение `POSTGRES_PASSWORD` в `.env` само по себе **не меняет** пароль существующего пользователя БД. Не удаляйте том ради смены пароля; сначала запланируйте безопасную смену в PostgreSQL.

## Черновые уровни

Команда `npm run content:import-drafts` добавляет в БД 42 черновые цитаты (22 стримера, 8 блогеров, 12 тиктокеров), но **не публикует** их. Чтобы разрешить их просмотр только в локальном API, добавьте в `.env`:

```dotenv
LOCAL_DRAFT_PREVIEW=1
```

Перезапустите `npm run dev`. При выключенном флаге обычный API не выдаёт черновые уровни. Флаг не используется в публичной среде.

## Быстрая проверка API

В другом окне PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8085/health

$guest = Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:8085/api/v1/auth/guest' `
  -ContentType 'application/json' -Body '{}'

$headers = @{ Authorization = "Bearer $($guest.accessToken)" }
Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/v1/game/categories' -Headers $headers
Invoke-RestMethod -Uri 'http://127.0.0.1:8085/api/v1/game/levels?category=streamers' -Headers $headers
```

Сохраняйте `accessToken` только в текущем сеансе разработки. Не вставляйте настоящие токены в Issues, PR, скриншоты или логи.

## Обычный повторный запуск

```powershell
cd D:\Bloger\BlogerGrameGame-backend  # или ваш путь
docker compose up -d
npm run db:migrate
npm run dev
```

Остановка Node.js: `Ctrl+C`. Остановить контейнер БД без удаления данных: `docker compose stop`.

## Данные и резервная копия

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup-local.ps1
npm run db:status
```

Архивы сохраняются в `backups/`, которая исключена из Git. **Не выполняйте** `docker compose down -v`, если нужно сохранить игроков, каталог и прогресс. Миграции уже применённых версий не редактируют; добавляют новые `006_*.sql`, `007_*.sql` и т. д.

## Если что-то не запускается

| Симптом | Что проверить |
|:--|:--|
| `ECONNREFUSED` к PostgreSQL | Docker Desktop запущен, `docker compose ps`, порт 5433 свободен |
| Неверный пароль PostgreSQL | `PGPASSWORD` соответствует паролю в уже существующей БД; `.env` не синхронизирует его автоматически |
| Ошибка `ADMIN_API_KEY` | В `.env` строка из **64** символов `0-9a-f` |
| Миграция сообщает `has changed` | Проверьте SQL-файл и окончания строк; не подменяйте контрольную сумму вручную |
| `GET /levels` возвращает пустой список | Каталог лишь черновой; импортируйте его и установите `LOCAL_DRAFT_PREVIEW=1` |
| `401 UNAUTHORIZED` | Создайте гостя, передавайте `Bearer`-токен; после истечения обновляйте сессию |
| `NO_LIVES` | Жизни кончились: ждите восстановления или купите жизнь за монеты |

Проверки по слоям: [TESTING.md](TESTING.md). Описание авторизации: [GUEST_AUTH.md](GUEST_AUTH.md).
