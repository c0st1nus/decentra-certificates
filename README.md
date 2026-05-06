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
