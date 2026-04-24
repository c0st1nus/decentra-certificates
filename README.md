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

Нужно установить `Rust`, `bun`, `Docker` и `docker compose`.

Создайте `.env` на основе `.env.example`, затем запустите:

```bash
make setup
make backend
make seed-admin ARGS="--login admin --password 'strong-password-here' --role super_admin"
make frontend
```

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

## Структура

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
