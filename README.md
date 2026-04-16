# Decentrathon Certificates Platform

Платформа для автоматической выдачи сертификатов участникам хакатона.

Пользовательский сценарий:

- участник вводит `e-mail`
- backend проверяет, есть ли этот `e-mail` в базе
- система берет `full_name` из загруженного списка участников
- backend генерирует сертификат на сервере
- пользователь скачивает готовый `PDF`

Админский сценарий:

- администратор входит по логину и паролю
- загружает шаблоны сертификатов
- настраивает layout имени на шаблоне
- импортирует базу участников из `CSV/XLSX`
- включает или выключает публичную выдачу

## Статус проекта

Сейчас в репозитории уже есть:

- Rust backend на `Actix Web`
- модели БД на `SeaORM`
- миграции для базовой схемы
- Next.js frontend для публичной страницы и каркаса админки
- локальная инфраструктура через `docker compose` c `PostgreSQL`, `Redis` и `MinIO`
- rate limit для public/admin API scopes
- отдельный `auth` domain на backend с login/refresh/logout/me
- JWT middleware и role checks для защищенных admin routes
- DB-backed `issuance_enabled` в `app_settings`
- storage strategy и healthcheck для templates/generated files
- Redis-backed admin login throttling, issuance lock и cluster readiness health checks
- audit log для админских действий

Пока еще не завершено:

- загрузка шаблонов
- layout editor и preview
- verification page

Актуальный план работ описан в [TODO.md](/home/const/Projects/decentra-certificates/TODO.md).

## Архитектура

Репозиторий состоит из двух основных частей:

- `backend/api` — HTTP API, авторизация, публичные и админские маршруты
- `backend/entity` — модели и связи `SeaORM`
- `backend/db-migration` — миграции БД
- `frontend` — публичный сайт и админ-панель на `Next.js`
- `uploads` — локальное хранилище шаблонов и сгенерированных файлов в dev-режиме
- `S3`-совместимое object storage для production-хранения шаблонов и PDF
- `docker-compose.yml` — PostgreSQL, Redis и MinIO для локальной разработки

Текущая схема БД уже включает:

- `admins`
- `refresh_sessions`
- `certificate_templates`
- `template_layouts`
- `participants`
- `certificate_issues`
- `app_settings`

## Технологии

- Backend: `Rust`, `Actix Web`, `SeaORM`, `SeaORM Migration`, `JWT`, `Argon2`
- Frontend: `Next.js 16`, `React 18`, `TypeScript`, `Tailwind CSS v4`, `Biome`
- Infra: `PostgreSQL 16`, `Redis 7`, `Docker Compose`

## Основные возможности по ТЗ

### Публичная часть

- форма ввода `e-mail`
- серверная проверка участника
- генерация сертификата
- скачивание `PDF`
- сообщения для состояний:
  - сертификат готов
  - `e-mail` не найден
  - выдача отключена
  - внутренняя ошибка

### Админ-панель

- логин и пароль
- JWT access token authentication
- protected admin routes
- загрузка шаблонов `PNG/JPG/PDF`
- настройка позиции имени на шаблоне
- импорт участников из `CSV/XLSX`
- включение/выключение выдачи сертификатов

### Дополнительно

- уникальный ID сертификата
- verification code / QR-код
- страница верификации
- статистика скачиваний
- логи выдачи и действий админа

## Быстрый старт

### 1. Подготовка окружения

Нужно установить:

- `Rust` toolchain
- `bun`
- `Docker` и `docker compose`

### 2. Настройка переменных окружения

Создайте `.env` на основе `.env.example`.

Минимально важные переменные:

```env
APP_NAME=decentra-certificates
BIND_ADDRESS=127.0.0.1:8080
HTTP_WORKERS=4

DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/decentra_certificates
REDIS_URL=redis://127.0.0.1:6379/0

JWT_ACCESS_SECRET=change_me_access_secret
JWT_REFRESH_SECRET=change_me_refresh_secret
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30

ISSUANCE_ENABLED=false
STORAGE_DRIVER=local_fs
UPLOADS_DIR=./uploads
STORAGE_S3_BUCKET=
STORAGE_S3_REGION=
STORAGE_S3_PREFIX=decentra-certificates
STORAGE_S3_ENDPOINT_URL=
STORAGE_S3_FORCE_PATH_STYLE=false
```

Для production можно переключить storage driver на `s3`:

```env
STORAGE_DRIVER=s3
STORAGE_S3_BUCKET=my-certificates-bucket
STORAGE_S3_REGION=eu-central-1
STORAGE_S3_PREFIX=decentra-certificates
```

Для S3-совместимых провайдеров вроде MinIO или Cloudflare R2 можно дополнительно задать:

```env
STORAGE_S3_ENDPOINT_URL=https://<custom-endpoint>
STORAGE_S3_FORCE_PATH_STYLE=true
```

### 3. Поднять локальное окружение

```bash
make setup
```

Эта команда:

- установит frontend dependencies
- поднимет PostgreSQL, Redis и MinIO
- применит миграции

### 4. Запустить backend

```bash
make backend
```

Backend по умолчанию стартует на `127.0.0.1:8080`.

### 5. Создать первого админа

```bash
make seed-admin ARGS="--login admin --password 'strong-password-here' --role super_admin"
```

Если логин уже существует и нужно обновить пароль или роль, добавьте `--force`.

### 6. Запустить frontend

```bash
make frontend
```

Frontend запускается отдельно из `frontend/`.

## Команды разработки

### Основные команды

```bash
make install
make up
make down
make backend
make seed-admin
make frontend
make migrate
make migrate-down
make check
make lint
make fmt
make test
```

### Что делает каждая команда

- `make install` — установить frontend-зависимости через `bun`
- `make up` — поднять PostgreSQL и Redis
- `make down` — остановить локальную инфраструктуру
- `make backend` — запустить Rust API
- `make seed-admin` — создать или обновить первого админа
- `make frontend` — запустить Next.js frontend
- `make migrate` — применить миграции
- `make migrate-down` — откатить последнюю миграцию
- `make check` — `cargo check --workspace` и frontend lint
- `make lint` — `clippy -D warnings` и `biome check`
- `make fmt` — форматирование Rust и frontend-кода
- `make test` — тесты Rust workspace

## Структура проекта

```text
backend/
  api/            Actix Web API
  entity/         SeaORM entities
  db-migration/   SeaORM migrations
frontend/
  app/            Next.js app router pages
  components/     shared UI components
uploads/          templates and generated files in development
docs/             additional project docs
```

## API overview

Текущий backend уже разделен на три группы роутов:

- `/api/v1/system`
- `/api/v1/public`
- `/api/v1/admin`

Сейчас реализовано:

- `GET /api/v1/system/health`
- `POST /api/v1/public/certificates/request`
- `GET /api/v1/public/certificates/{certificate_id}/download`
- `GET /api/v1/public/certificates/verify/{verification_code}`
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/refresh`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `GET /api/v1/admin/issuance/status`
- `PATCH /api/v1/admin/issuance/status`

Сейчас в виде заглушек:
- `/verify/[code]` frontend page

Планируемые API и подробный scope описаны в [TODO.md](/home/const/Projects/decentra-certificates/TODO.md).

## Безопасность

Ключевые требования проекта:

- все проверки участника происходят на сервере
- имя для сертификата берется только из БД
- frontend не должен иметь доступа к базе участников
- admin routes должны быть закрыты по JWT
- доступ к admin-функциям должен проверяться по роли
- публичная выдача должна быть защищена rate limit и anti-abuse механизмами
- шаблоны и импортированные данные должны храниться в защищенном storage

## Нагрузка и стабильность

Платформа проектируется под массовую выдачу сертификатов для `5000+` участников.

Для этого уже заложены:

- конфигурация `HTTP_WORKERS`
- health endpoint
- Redis в локальной инфраструктуре
- rate limiting для публичных и админских маршрутов

Дальше нужно довести до production-ready состояния:

- дедупликацию одновременных запросов на один и тот же `e-mail`
- кеширование уже сгенерированных сертификатов
- shared storage/object storage
- cluster deployment за reverse proxy

## Frontend routes

Текущий frontend содержит:

- `/` — публичная страница получения сертификата
- `/admin` — каркас админ-панели

Планируемое развитие:

- `/admin/login`
- `/admin/templates`
- `/admin/templates/[id]/layout`
- `/admin/participants`
- `/admin/issuance`
- `/admin/certificates`
- `/verify/[code]`

## Проверка после изменений

Перед merge минимально ожидается:

```bash
make lint
make test
cd frontend && bun run build
```

## Roadmap

### MVP

- публичная страница ввода `e-mail`
- проверка участника по базе
- генерация сертификата
- скачивание `PDF`
- загрузка шаблона
- настройка позиции имени
- загрузка `CSV/XLSX`
- включение и выключение выдачи
- базовая cluster-настройка

Уже выполнено в foundation-фазе:

- админ-логин
- JWT token authentication
- protected admin routes
- хранение `issuance_enabled` в БД settings

### После MVP

- verification page
- QR-код
- статистика
- audit logs
- несколько шаблонов под разные треки и категории

## Полезные файлы

- [TODO.md](/home/const/Projects/decentra-certificates/TODO.md)
- [AGENTS.md](/home/const/Projects/decentra-certificates/AGENTS.md)
- [Makefile](/home/const/Projects/decentra-certificates/Makefile)
- [docker-compose.yml](/home/const/Projects/decentra-certificates/docker-compose.yml)
- [.env.example](/home/const/Projects/decentra-certificates/.env.example)
