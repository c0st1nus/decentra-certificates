# API

Base path: `/api/v1`.

## System

- `GET /api/v1/system/health` — health and readiness checks.

## Public

- `POST /api/v1/public/certificates/request` — request certificate generation for an email/template.
- `POST /api/v1/public/certificates/check` — list certificates available for an email.
- `GET /api/v1/public/telegram/settings` — read Telegram subscription UI settings.
- `POST /api/v1/public/telegram/verify-subscription` — verify Telegram subscription state.
- `GET /api/v1/public/certificates/jobs/{job_id}` — read generation job status.
- `GET /api/v1/public/certificates/jobs/{job_id}/events` — stream job status events.
- `GET /api/v1/public/certificates/{certificate_id}/download` — download generated PDF.
- `GET /api/v1/public/certificates/verify/{verification_code}` — lookup certificate verification data.

## Admin Auth

Auth routes are under `/api/v1/admin/auth`.

- `POST /login` — admin login.
- `POST /refresh` — refresh access token.

Protected admin auth/profile routes are under `/api/v1/admin`.

- `POST /logout` — revoke refresh token.
- `GET /me` — current admin profile.

## Admin Issuance

- `GET /api/v1/admin/issuance/status` — read public issuance status and readiness.
- `PATCH /api/v1/admin/issuance/status` — enable/disable public issuance.

## Admin Templates

- `GET /api/v1/admin/templates` — list templates with layout/categories/stats.
- `POST /api/v1/admin/templates` — upload template source file.
- `GET /api/v1/admin/templates/{id}` — get template detail.
- `PATCH /api/v1/admin/templates/{id}` — update template name/source file.
- `DELETE /api/v1/admin/templates/{id}` — delete template.
- `GET /api/v1/admin/templates/{id}/source` — read source asset.
- `POST /api/v1/admin/templates/{id}/activate` — activate template.
- `POST /api/v1/admin/templates/{id}/deactivate` — deactivate template.
- `PUT /api/v1/admin/templates/{id}/layout` — save template layout/canvas.
- `POST /api/v1/admin/templates/{id}/preview` — render preview without saving snapshot.
- `POST /api/v1/admin/templates/{id}/snapshot` — render and save preview snapshot.
- `GET /api/v1/admin/templates/{id}/generation-progress` — certificate generation progress for template.
- `POST /api/v1/admin/templates/{id}/requeue-failed` — requeue failed certificate issues for template.

## Admin Categories

- `GET /api/v1/admin/categories` — list all categories across templates.
- `GET /api/v1/admin/templates/{id}/categories` — list categories for template.
- `POST /api/v1/admin/templates/{id}/categories` — create category.
- `PATCH /api/v1/admin/templates/{id}/categories/{category_id}` — update category.
- `DELETE /api/v1/admin/templates/{id}/categories/{category_id}` — delete category.

## Admin Participants

- `POST /api/v1/admin/participants/import` — import participants from `CSV/XLSX`.
- `GET /api/v1/admin/participants` — list participants with filters/pagination.
- `DELETE /api/v1/admin/participants?event_code={template_id}` — delete roster for template.

## Admin Certificate Issues

- `GET /api/v1/admin/certificate-issues` — list issue rows with optional filters.
- `POST /api/v1/admin/certificate-issues/{issue_id}/requeue` — requeue one failed issue.

## Admin Fonts

- `GET /api/v1/admin/fonts` — list available font families for layout editor.

## Notes

- Public and admin scopes use rate limiting outside stress-test mode.
- Protected admin routes require JWT access token.
- File upload endpoints use multipart form data.
