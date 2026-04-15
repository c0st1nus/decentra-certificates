# Repository Guidelines

## Project Structure & Module Organization
This repository is a Rust workspace for the Decentrathon certificate backend.

- `crates/api/`: Actix Web application, routes, config, and app state.
- `crates/entity/`: SeaORM entities and shared database models.
- `crates/db-migration/`: SeaORM migrations and migration CLI entrypoint.
- `.env.example`: required local environment variables.
- `docker-compose.yml`: local PostgreSQL and Redis services.

Keep new business logic close to its layer. HTTP handlers belong in `crates/api/src/routes/`; database schema changes belong only in `crates/db-migration/`.

## Build, Test, and Development Commands
- `cargo check --workspace`: fast compile verification for all crates.
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`: lint the full workspace and fail on warnings.
- `cargo test --workspace`: run all Rust tests.
- `cargo run -p decentra-certificates-api`: start the API server.
- `cargo run -p decentra-certificates-db-migration -- up`: apply database migrations.
- `docker compose up -d`: start local PostgreSQL and Redis.

Run `cargo check` and `cargo clippy` before opening a PR.

## Coding Style & Naming Conventions
Use standard Rust formatting with 4-space indentation and keep files ASCII unless there is a clear reason otherwise.

- Format with `cargo fmt --all`.
- Use `snake_case` for files, modules, and functions.
- Use `PascalCase` for structs, enums, and SeaORM entity models.
- Prefer small route modules such as `public.rs`, `admin.rs`, `system.rs`.
- Keep handlers thin; move reusable logic into dedicated modules as the codebase grows.

## Testing Guidelines
Use Rust’s built-in test framework. Prefer unit tests near the code under test and integration tests in a top-level `tests/` directory when cross-crate behavior matters.

Test names should describe behavior, for example: `rejects_invalid_email` or `creates_certificate_issue_record`.

Minimum expectation for backend changes:
- `cargo test --workspace`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`

## Commit & Pull Request Guidelines
This repository has no commit history yet, so use short imperative commit messages such as:

- `add participant import endpoint`
- `wire jwt auth middleware`
- `create initial seaorm schema`

For pull requests, include:
- a brief description of the change
- impacted crates and routes
- config or migration notes
- sample request/response snippets for API changes

## Security & Configuration Tips
Never commit real secrets. Copy `.env.example` to a local `.env` and fill in local values. Keep JWT secrets, database URLs, and admin credentials out of source control. Protected logic must stay server-side; do not expose participant data to frontend clients.
