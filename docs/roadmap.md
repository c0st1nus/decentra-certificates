# Roadmap

## Current State

Implemented foundation:

- Rust backend with Actix Web, SeaORM and migrations.
- Next.js 16 frontend.
- Admin auth with JWT access/refresh tokens.
- Protected admin routes.
- Template upload and source preview.
- Template layout/canvas editor.
- Template preview and snapshot rendering.
- Template categories.
- Participant import from `CSV/XLSX`.
- Public certificate request/check flow.
- Async certificate generation workers backed by Redis.
- Public job status and events endpoints.
- Certificate download and verification lookup endpoints.
- Storage abstraction for local FS and S3-compatible object storage.
- Rate limiting and audit log.
- Telegram subscription gate when configured.

## MVP Remaining

- Public verification page for `/verify/[code]` or equivalent route.
- QR code support in generated certificates.
- Admin UI for issuance status if deeper controls are needed.
- Admin statistics view for generated/downloaded/failed certificates.
- Production-ready deployment documentation.

## Recommended Next Steps

1. Build public verification page using existing verification lookup endpoint.
2. Add QR code layer support in canvas/layout flow.
3. Add dashboard cards for generation/download stats.
4. Split `backend/api/src/routes/admin.rs` into focused route modules.
5. Batch template stats in `templates::list_templates` to avoid per-template count queries as data grows.
6. Add end-to-end smoke tests for public claim and admin import/template flows.
7. Write production deployment checklist for database, Redis, object storage, reverse proxy and secrets.

## Recently Cleaned Up

- Frontend shared admin UI primitives and classes were extracted to reduce class duplication.
- Obsolete unused `TemplateCategoryManager` component was removed.
- Backend multipart parsing moved into `routes/multipart.rs`.
- Shared email normalization moved into `services/normalization.rs`.
- Shared public URL builders moved into `services/urls.rs`.
- Repeated template layout request mapping was replaced with a single conversion.
- Repeated certificate issue reset-to-queued logic was consolidated.

## Longer Term

- Better admin role policies beyond the current role-ready auth model.
- More robust certificate analytics.
- More template/canvas layer types.
- Deployment automation and observability dashboards.
- Load-test baselines for expected event size and certificate volume.
