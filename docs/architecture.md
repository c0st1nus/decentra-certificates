# Architecture

Платформа состоит из Rust backend workspace и отдельного Next.js frontend.

## Backend

```text
backend/api/
  src/app.rs              Actix scope wiring, CORS and rate limits
  src/main.rs             startup, migrations, state init, workers
  src/routes/             HTTP handlers
  src/routes/multipart.rs shared multipart parsing helpers
  src/middleware/         JWT/admin auth middleware
  src/services/           business logic and infrastructure helpers
  src/state.rs            shared AppState
backend/entity/           SeaORM entities
backend/db-migration/     SeaORM migrations and migration CLI
```

Important backend services:

- `auth` — admin login, refresh sessions, logout and profile response.
- `templates` — template upload, source retrieval, layout, preview and snapshot.
- `participants` — participant list/import/delete.
- `certificate_issues` — issue list, status reset, requeue and progress.
- `certificate_jobs` — Redis-backed generation queue and job status cache.
- `certificates` — public issue/check/download/verify flows.
- `storage` — local FS and S3-compatible object storage.
- `normalization` — shared low-level normalization helpers.
- `urls` — shared public URL builders.

## Frontend

```text
frontend/app/             Next.js App Router pages
frontend/components/      shared UI and feature components
frontend/components/ui/   small primitive UI components
frontend/hooks/           auth and Telegram hooks
frontend/lib/             API clients, canvas/layout utilities
frontend/config/          fonts and frontend config
```

The current UI uses Tailwind CSS v4 tokens in `frontend/app/globals.css`.

Shared classes added for consistency:

- `admin-panel`
- `admin-eyebrow`
- `admin-input`
- `admin-input-icon`
- `admin-file-input`
- `admin-muted-pill`
- `glow-primary`

Shared admin components:

- `AdminPanel`
- `AdminPageHeader`
- `AdminBackLink`
- `FileInputField`
- `InfoTile`
- `TemplateStatLinkCard`

## Main Flow

1. Admin uploads a certificate template.
2. Admin configures layout/canvas and optionally categories.
3. Admin imports participants from `CSV/XLSX`.
4. Admin activates a template and enables public issuance.
5. Participant enters email on `/`.
6. Backend verifies participant server-side.
7. Backend returns ready certificate or enqueues generation.
8. Frontend watches job status/events until PDF is ready.
9. Participant downloads PDF from backend storage.

## Storage

Development can use local uploads or local MinIO. Production should use S3-compatible object storage.

Relevant env variables:

```env
STORAGE_DRIVER=s3
UPLOADS_DIR=./uploads
STORAGE_S3_BUCKET=decentra-certificates
STORAGE_S3_REGION=us-east-1
STORAGE_S3_PREFIX=decentra-certificates
STORAGE_S3_ENDPOINT_URL=http://127.0.0.1:9000
STORAGE_S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
```

## Queue And Rendering

Certificate generation is asynchronous. Redis stores queue/job state and workers process certificate issues.

Relevant env variables:

```env
CERTIFICATE_WORKERS=4
RENDER_PARALLELISM=4
CERTIFICATE_RENDER_SCALE=1.5
PREVIEW_RENDER_SCALE=1.25
```

## Telegram Gate

Public certificate claiming can require Telegram subscription verification.

Relevant env variables:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=
TELEGRAM_CHANNEL_URL=https://t.me/channelname
TELEGRAM_CLIENT_ID=
TELEGRAM_CLIENT_SECRET=
TELEGRAM_SUBSCRIPTION_REQUIRED=false
```
