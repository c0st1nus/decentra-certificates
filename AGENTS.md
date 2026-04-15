# Repository Guidelines

## Project Structure & Module Organization
This repository has two main parts: a Rust backend workspace and a separate Next.js frontend.

- `backend/api/`: Actix Web app, routes, config, and shared app state.
- `backend/entity/`: SeaORM entities and database models.
- `backend/db-migration/`: SeaORM migrations and migration CLI.
- `frontend/`: Next.js app router frontend, Tailwind v4 styles, and Biome config.
- `uploads/`: local storage for templates and generated files in development.
- `docker-compose.yml`: local PostgreSQL and Redis services.
- `Makefile`: common project commands.
- `README.md`: current project status, setup, and API overview.
- `docs/TODO.md`: source of truth for the implementation roadmap and phase status.

Keep HTTP logic in `backend/api/src/routes/`, schema changes in `backend/db-migration/`, and UI code inside `frontend/app/` and `frontend/components/`.

For the current workstream, start with `docs/TODO.md` to see what is already done and which phase comes next.

## Build, Test, and Development Commands
- `make setup`: install frontend deps, start PostgreSQL and Redis, apply migrations.
- `make backend`: run the Rust API server.
- `make frontend`: run the Next.js frontend with Turbopack.
- `make check`: run `cargo check --workspace` and frontend linting.
- `make lint`: run `clippy -D warnings` and `bun run lint`.
- `make fmt`: format Rust and frontend code.
- `make test`: run Rust tests.
- `make down`: stop local infrastructure.

For frontend-only work, use `cd frontend && bun run dev|build|lint|format`.

## Coding Style & Naming Conventions
Use 4-space indentation in Rust and follow standard formatter output. Frontend code should follow Biome formatting.

- Rust: `snake_case` for modules/functions, `PascalCase` for types.
- React/Next: `PascalCase` for components, route files in lowercase under `frontend/app/`.
- Keep handlers thin and push reusable logic into dedicated modules as the codebase grows.
- Prefer ASCII unless the file already uses another character set intentionally.

## Testing Guidelines
Use Rust’s built-in test framework for backend tests. Put unit tests close to the code and add integration tests in a top-level `tests/` directory when behavior crosses crate boundaries.

Minimum expectation before a PR:
- `make lint`
- `make test`
- `cd frontend && bun run build`

Test names should describe behavior, for example `rejects_invalid_email`.

## Commit & Pull Request Guidelines
Use short imperative commit messages such as:

- `add participant import endpoint`
- `split public and admin frontend shells`
- `wire make targets for local workflow`

PRs should include a concise summary, impacted backend/frontend areas, migration or config notes, and screenshots for visible UI changes.

## Security & Configuration Tips
Do not commit real secrets. Use `.env.example` as the base for local `.env`. Keep participant data and admin-only flows server-side. Do not expose database access, JWT secrets, or internal storage paths to the frontend.
