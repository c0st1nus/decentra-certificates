# Development

## Requirements

- Rust toolchain
- `bun`
- Docker and `docker compose`

## Setup

```bash
make setup
make backend
make seed-admin ARGS="--login admin --password 'strong-password-here' --role super_admin"
make frontend
```

`make setup` installs frontend dependencies, starts local infrastructure and applies migrations.

## Common Commands

```bash
make install       # frontend dependencies
make up            # PostgreSQL, Redis, MinIO
make down          # stop local infra
make backend       # Actix API
make frontend      # Next.js dev server
make migrate       # apply migrations
make migrate-down  # rollback latest migration
make check         # cargo check + frontend lint
make lint          # clippy + frontend lint
make fmt           # format Rust and frontend
make test          # Rust tests
```

Frontend-only commands:

```bash
cd frontend && bun run dev
cd frontend && bun run lint
cd frontend && bun run format
cd frontend && bun run build
```

## Minimum Verification

Run before merge:

```bash
make check
make test
cd frontend && bun run build
```

## Backend Conventions

- Keep HTTP handlers thin in `backend/api/src/routes/`.
- Put business logic in `backend/api/src/services/`.
- Put SeaORM models in `backend/entity/`.
- Put schema changes in `backend/db-migration/`.
- Shared low-level helpers belong in focused service modules, for example `normalization`, `urls`, or route-specific helpers like `routes/multipart.rs`.
- Avoid duplicating status transitions for certificate issues; use shared helpers where possible.

## Frontend Conventions

- Pages live in `frontend/app/`.
- Shared components live in `frontend/components/`.
- API clients and pure helpers live in `frontend/lib/`.
- Use Tailwind tokens and shared classes from `frontend/app/globals.css` before adding long repeated class strings.
- Prefer the current admin UI primitives:
  - `AdminPanel`
  - `AdminPageHeader`
  - `AdminBackLink`
  - `FileInputField`
  - `InfoTile`
  - `TemplateStatLinkCard`
- Keep interactive elements as real `button`/`a` elements with visible focus states.

## Environment

Use `.env.example` as the source template for local `.env`.

Important local defaults:

```env
BIND_ADDRESS=127.0.0.1:8080
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/decentra_certificates
REDIS_URL=redis://127.0.0.1:6379/0
STORAGE_DRIVER=s3
STORAGE_S3_ENDPOINT_URL=http://127.0.0.1:9000
STORAGE_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
```

## Notes

- `docs/` is the home for project documentation.
- Keep root `README.md` short and link to docs for details.
- Do not commit real secrets or production participant data.
