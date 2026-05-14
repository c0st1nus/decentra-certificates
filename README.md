# Decentrathon Certificates Platform

Платформа для автоматической выдачи сертификатов участникам хакатона.

Участник вводит email, backend проверяет его в базе, создает или находит сертификат, генерирует PDF на сервере и отдает ссылку на скачивание. Администратор управляет шаблонами, layout, категориями, импортом участников и публичной выдачей.

## Статус

Сейчас реализовано:

- Rust backend на `Actix Web` с `SeaORM`, миграциями и PostgreSQL.
- Next.js 16 frontend с публичной страницей и админ-панелью.
- JWT admin auth: `login`, `refresh`, `logout`, `me`.
- Protected admin routes и role-ready middleware.
- Загрузка шаблонов `PNG/JPG/PDF`.
- Layout editor, preview и snapshot для шаблонов.
- Категории шаблонов.
- Импорт участников из `CSV/XLSX`.
- Асинхронная генерация сертификатов через Redis-backed очередь.
- Download endpoint, verification lookup endpoint и job status/events.
- DB-backed `issuance_enabled` setting.
- Local FS/S3-compatible storage strategy.
- Rate limit для public/admin API scopes.
- Admin audit log.
- Telegram subscription gate для публичной выдачи, если включен в env.

Не завершено:

- Публичная frontend verification page.
- QR-код на сертификате.
- Полноценная статистика выдач в UI.
- Production deployment checklist и reverse proxy конфигурация.

Подробности лежат в `docs/`.

## Документация

- [Обзор документации](docs/README.md)
- [Архитектура](docs/architecture.md)
- [API](docs/api.md)
- [Разработка](docs/development.md)
- [Performance](docs/performance.md)
- [Roadmap](docs/roadmap.md)

## Производительность

Последний production stress run: backend ограничен `2` физическими ядрами / `4` потоками (`taskset -c 0-3`), `HTTP_WORKERS=4`, `CERTIFICATE_WORKERS=4`, `RENDER_PARALLELISM=4`.

Коротко: ready certificates выдержали `1000 VU` без ошибок, `p95=77.89ms`, `p99=116.22ms`, `~1255 RPS`; 1000 сертификатов предгенерировались за `26s`; peak backend RSS был `~370 MiB`. Полный отчет: [docs/performance.md](docs/performance.md).

## Переменные окружения

Создайте `.env` на основе `.env.example`. Ниже — описание всех переменных.

### Общие

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `APP_NAME` | нет | `decentra-certificates` | Имя приложения, используется в логах и метаданных. |
| `BIND_ADDRESS` | нет | `127.0.0.1:8080` | Адрес и порт, на котором слушает backend. |
| `HTTP_WORKERS` | нет | кол-во физических ядер | Число Actix Web worker-потоков. |
| `CORS_ORIGINS` | нет | `http://localhost:3000,http://127.0.0.1:3000` | Список разрешённых CORS-origin через запятую. |
| `STRESS_TEST_MODE` | нет | `false` | Включает послабления для нагрузочных тестов (не для production). |

### База данных и Redis

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `DATABASE_URL` | **да** | — | PostgreSQL connection string. Формат: `postgres://user:password@host:port/dbname`. При локальной разработке через `docker compose` подходит значение из `.env.example`. |
| `REDIS_URL` | нет | `redis://127.0.0.1:6379/0` | URL Redis-сервера. Используется как broker для очереди генерации сертификатов. |

### JWT (аутентификация админов)

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `JWT_ACCESS_SECRET` | **да** | — | Секретный ключ для подписи access-токенов. Используйте длинную случайную строку (32+ символа). Генерация: `openssl rand -base64 48`. |
| `JWT_REFRESH_SECRET` | **да** | — | Секретный ключ для подписи refresh-токенов. Должен отличаться от `JWT_ACCESS_SECRET`. Генерация: `openssl rand -base64 48`. |
| `JWT_ACCESS_TTL_MINUTES` | нет | `60` | Время жизни access-токена в минутах. |
| `JWT_REFRESH_TTL_DAYS` | нет | `30` | Время жизни refresh-токена в днях. |

### Генерация сертификатов

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `ISSUANCE_ENABLED` | нет | `false` | Начальное значение флага «выдача сертификатов разрешена». Управляется через админ-API, но это значение применяется при первом запуске. |
| `CERTIFICATE_WORKERS` | нет | кол-во логических ядер | Число worker-потоков, обрабатывающих очередь генерации сертификатов. |
| `RENDER_PARALLELISM` | нет | `min(CERTIFICATE_WORKERS, физ. ядра)` | Максимальное число параллельных рендеров PDF. Ограничивает CPU-bound нагрузку. |
| `CERTIFICATE_RENDER_SCALE` | нет | `1.5` | Масштаб рендера сертификата (DPI-множитель). Выше — качественнее, но тяжелее. |
| `PREVIEW_RENDER_SCALE` | нет | `1.25` | Масштаб рендера превью шаблона. |

### Хранилище файлов

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `STORAGE_DRIVER` | нет | `local_fs` | Драйвер хранилища: `local_fs` (файловая система) или `s3` (S3-совместимое хранилище, включая MinIO). |
| `UPLOADS_DIR` | нет | `./uploads` | Базовая директория для локального хранения. Внутри неё создаются `templates/` и `generated/`. |
| `STORAGE_S3_BUCKET` | при `s3` | — | Имя S3-бакета. |
| `STORAGE_S3_REGION` | при `s3` | — | Регион бакета (например, `us-east-1`). Для MinIO — любое значение. |
| `STORAGE_S3_PREFIX` | нет | `decentra-certificates` | Префикс (папка) внутри бакета. |
| `STORAGE_S3_ENDPOINT_URL` | нет | — | Custom endpoint. Для MinIO: `http://127.0.0.1:9000`. Для AWS S3 — не указывайте. |
| `STORAGE_S3_FORCE_PATH_STYLE` | нет | `false` | `true` для MinIO и S3-совместимых сервисов, использующих path-style URLs. |
| `AWS_ACCESS_KEY_ID` | при `s3` | — | Ключ доступа к S3/MinIO. |
| `AWS_SECRET_ACCESS_KEY` | при `s3` | — | Секретный ключ доступа к S3/MinIO. |

### Telegram

Telegram-интеграция позволяет требовать подписку на канал перед выдачей сертификата. Пользователь авторизуется через Telegram OAuth (OIDC), backend верифицирует `id_token` по JWKS и проверяет подписку через Bot API. Если `TELEGRAM_SUBSCRIPTION_REQUIRED=false` — вся Telegram-логика отключена, остальные переменные можно не заполнять.

| Переменная | Обязательная | По умолчанию | Описание |
|---|---|---|---|
| `TELEGRAM_SUBSCRIPTION_REQUIRED` | нет | `false` | Главный переключатель. `true` — сертификат выдаётся только подписчикам канала. |
| `TELEGRAM_BOT_TOKEN` | при включённой подписке | — | Токен Telegram-бота. Нужен для проверки подписки через Bot API (`getChatMember`) и валидации `initData` в Mini Apps. |
| `TELEGRAM_CHANNEL_ID` | при включённой подписке | — | ID канала/группы, подписку на который проверяем. |
| `TELEGRAM_CHANNEL_URL` | нет | `https://t.me/channelname` | Публичная ссылка на канал. Показывается пользователю, чтобы он мог подписаться. |
| `TELEGRAM_CLIENT_ID` | при включённой подписке | — | Client ID для Telegram OAuth (OIDC). Выдаётся в BotFather. |
| `TELEGRAM_CLIENT_SECRET` | при включённой подписке | — | Client Secret для Telegram OAuth (OIDC). Выдаётся в BotFather. |

#### Как получить Telegram Bot Token

1. Откройте Telegram и найдите [@BotFather](https://t.me/BotFather).
2. Отправьте команду `/newbot`.
3. Следуйте инструкциям: введите имя бота и username (должен заканчиваться на `bot`).
4. BotFather выдаст токен вида `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`. Это и есть `TELEGRAM_BOT_TOKEN`.
5. **Важно:** добавьте бота администратором в канал, подписку на который хотите проверять. Без этого Bot API не сможет проверить статус участника.

#### Как получить Channel ID

1. Если канал **публичный** (например, `@mychannel`), можно использовать username с префиксом `@`: `TELEGRAM_CHANNEL_ID=@mychannel`.
2. Для **приватных** каналов нужен числовой ID. Способы узнать:
   - Перешлите любое сообщение из канала боту [@userinfobot](https://t.me/userinfobot) или [@getidsbot](https://t.me/getidsbot) — он покажет ID.
   - Откройте канал в [Telegram Web](https://web.telegram.org), ID будет в URL (например, `-1001234567890`).
   - Используйте Bot API: вызовите `https://api.telegram.org/bot<TOKEN>/getChat?chat_id=@username` — в ответе будет числовой `id`.
3. ID каналов обычно отрицательный и начинается с `-100`.

#### Как получить Telegram OAuth Client ID и Client Secret

Telegram теперь использует стандартный OpenID Connect через `oauth.telegram.org`. Client ID и Client Secret — это **отдельные credentials**, которые генерируются в BotFather (это больше не bot numeric ID и не bot token).

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram.
2. Нажмите кнопку **Open** (или иконку Mini App рядом с полем ввода) — откроется интерфейс BotFather Mini App.
3. Выберите вашего бота.
4. Перейдите в **Bot Settings** → **Web Login**.
5. Скопируйте **Client ID** и **Client Secret** — они будут показаны в этом разделе. Это значения для `TELEGRAM_CLIENT_ID` и `TELEGRAM_CLIENT_SECRET`.
6. Настройте **Trusted Origins** — домены, с которых разрешена авторизация (обязательно HTTPS, например `https://certificates.example.com`). Для локальной разработки используйте туннель (ngrok, cloudflared) или добавьте `https://localhost`.
7. Настройте **Redirect URIs** — URL, на который Telegram вернёт пользователя после авторизации.

#### Как работает авторизация

```
Пользователь → нажимает "Войти через Telegram"
           → открывается popup oauth.telegram.org
           → пользователь подтверждает вход
           → frontend получает id_token (JWT)
           → backend верифицирует JWT по JWKS (oauth.telegram.org/.well-known/jwks.json)
           → backend проверяет подписку через Bot API (getChatMember)
           → сертификат выдаётся
```

На фронтенде используется скрипт `https://oauth.telegram.org/js/telegram-login.js` с callback `data-onauth`, который получает `id_token`. Backend валидирует подпись токена через публичные ключи Telegram (JWKS endpoint), без HMAC-хеширования.

> **Совет:** для локальной разработки без Telegram-интеграции оставьте `TELEGRAM_SUBSCRIPTION_REQUIRED=false` — никакие Telegram-переменные не понадобятся.

## Быстрый старт

### Что нужно установить

| Инструмент | Версия | Где взять |
|---|---|---|
| Rust | stable | https://rustup.rs |
| bun | ≥ 1.x | https://bun.sh |
| Docker + docker compose | последний | https://docs.docker.com/get-docker/ |

### 1. Клонировать и настроить переменные окружения

```bash
git clone https://github.com/c0st1nus/decentra-certificates.git
cd decentra-certificates
cp .env.example .env
```

Откройте `.env` и замените как минимум:

```env
# Сгенерируйте два разных случайных секрета:
#   openssl rand -hex 32
JWT_ACCESS_SECRET=<случайная_строка_64_символа>
JWT_REFRESH_SECRET=<другая_случайная_строка_64_символа>
```

Остальные значения подходят для локальной разработки без изменений.

### 2. Настроить frontend

```bash
echo "NEXT_PUBLIC_API_URL=http://localhost:8080" > frontend/.env.local
```

### 3. Запустить инфраструктуру, применить миграции, стартовать сервисы

```bash
make setup          # npm deps + PostgreSQL/Redis/MinIO + миграции
make backend        # Rust API на :8080
```

В отдельном терминале:

```bash
make seed-admin ARGS="--login admin --password 'strong-password-here' --role super_admin"
make frontend       # Next.js на :3000
```

### 4. Проверить

- Frontend: http://localhost:3000
- Admin-панель: http://localhost:3000/admin  (логин/пароль из шага выше)
- API: http://localhost:8080/health
- MinIO console: http://localhost:19001  (minioadmin / minioadmin)

Backend по умолчанию стартует на `127.0.0.1:8080`. Frontend запускается отдельно из `frontend/`.

## Команды

```bash
make install       # install frontend dependencies
make up            # start PostgreSQL, Redis and MinIO
make down          # stop local infrastructure
make backend       # run Rust API
make seed-admin    # create/update first admin
make frontend      # run Next.js frontend
make migrate       # apply SeaORM migrations
make migrate-down  # revert latest migration
make check         # cargo check + frontend lint
make lint          # clippy + frontend lint
make fmt           # Rust + frontend formatting
make test          # Rust tests
```

## Основные сценарии использования

### Создание первого администратора

```bash
make seed-admin ARGS="--login admin --password 'mypassword' --role super_admin"
```

### Работа с шаблонами (через admin-панель)

1. Войдите в `/admin` с логином и паролем.
2. Перейдите в **Templates → New template**.
3. Загрузите фон сертификата (PNG/JPG/PDF).
4. Настройте поля (имя участника, дата, etc.) через редактор layout.
5. Сохраните и создайте **snapshot** (финальный вид).

### Импорт участников

1. Подготовьте CSV или XLSX файл со столбцами `email`, `full_name` (и опционально `category`).
2. В admin-панели откройте **Participants → Import**.
3. Загрузите файл — участники добавятся в базу.

### Включение выдачи сертификатов

```bash
# Через API:
curl -X PUT http://localhost:8080/api/admin/settings \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"issuance_enabled": true}'
```

Или через admin-панель: **Settings → Issuance → Enable**.

### Получение сертификата участником

Участник открывает публичную страницу, вводит email. Если найден в базе — получает ссылку на скачивание PDF.

```bash
curl -X POST http://localhost:8080/api/public/certificate \
  -H "Content-Type: application/json" \
  -d '{"email": "participant@example.com"}'
```

### Настройка S3 (AWS или MinIO)

Для локальной разработки MinIO поднимается автоматически через `make up`. Для production замените в `.env`:

```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-production-bucket
STORAGE_S3_REGION=eu-central-1
STORAGE_S3_PREFIX=certificates
# STORAGE_S3_ENDPOINT_URL= (закомментируйте для AWS S3)
STORAGE_S3_FORCE_PATH_STYLE=false
AWS_ACCESS_KEY_ID=<ключ_из_IAM>
AWS_SECRET_ACCESS_KEY=<секрет_из_IAM>
```

### Telegram-гейт (опционально)

Для ограничения выдачи сертификатов только подписчикам канала:

```env
TELEGRAM_BOT_TOKEN=123456789:AAAA...
TELEGRAM_CHANNEL_ID=-1001234567890
TELEGRAM_CHANNEL_URL=https://t.me/your_channel
TELEGRAM_SUBSCRIPTION_REQUIRED=true
```

Бот должен быть добавлен в канал с правами администратора.



```text
backend/
  api/            Actix Web API, routes, services, middleware
  entity/         SeaORM entities
  db-migration/   SeaORM migrations
frontend/
  app/            Next.js app router pages
  components/     shared UI components
  lib/            API clients and frontend utilities
uploads/          local templates/generated files in development
stress-tests/     load/stress testing tools and reports
```

## Проверка Перед Merge

```bash
make check
make test
cd frontend && bun run build
```

## Безопасность

- Не коммитьте реальные секреты.
- Используйте `.env.example` как основу для локального `.env`.
- Participant data и admin-only flows должны оставаться server-side.
- Frontend не должен получать прямой доступ к БД, JWT secrets или internal storage paths.
