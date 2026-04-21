SHELL := /bin/sh

.PHONY: help install up down logs ps backend frontend migrate migrate-down \
	seed-admin check test lint fmt dev setup \
	stress-fixtures stress-seed stress-rs \
	stress-k6-smoke stress-k6-ready stress-k6-queued stress-k6-preview \
	stress-k6-import stress-k6-mixed stress-k6-all

help:
	@printf "%s\n" \
		"Available targets:" \
		"  make install       - install frontend dependencies with bun" \
		"  make up            - start PostgreSQL, Redis and MinIO with docker compose" \
		"  make down          - stop local infrastructure" \
		"  make logs          - show docker compose logs" \
		"  make ps            - show docker compose service status" \
		"  make backend       - run Rust Actix API" \
		"  make seed-admin    - create or update the first admin account" \
		"  make frontend      - run Next.js frontend with Turbopack" \
		"  make migrate       - apply SeaORM migrations" \
		"  make migrate-down  - revert the latest SeaORM migration" \
		"  make check         - run cargo check and frontend lint" \
		"  make test          - run Rust tests" \
		"  make lint          - run clippy and frontend lint" \
		"  make fmt           - format Rust and frontend code" \
		"  make setup         - install deps, start infra, apply migrations" \
		"  make dev           - alias for setup"

install:
	cd frontend && bun install

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

backend:
	cargo run -p decentra-certificates-api

seed-admin:
	cargo run -p decentra-certificates-api --bin seed-admin -- $(ARGS)

frontend:
	cd frontend && bun run dev

migrate:
	cargo run -p decentra-certificates-db-migration -- up

migrate-down:
	cargo run -p decentra-certificates-db-migration -- down

check:
	cargo check --workspace
	cd frontend && bun run lint

test:
	cargo test --workspace

lint:
	cargo clippy --workspace --all-targets --all-features -- -D warnings
	cd frontend && bun run lint

fmt:
	cargo fmt --all
	cd frontend && bun run format

setup: install up migrate

dev: setup

# Stress testing targets
stress-fixtures:
	stress-tests/scripts/generate-fixtures.sh

stress-seed:
	stress-tests/scripts/seed-http-data.sh

stress-clear-generated:
	stress-tests/scripts/clear-generated.sh

stress-rs:
	cargo run -p stress-tests -- all

stress-rs-render:
	cargo run -p stress-tests -- render

stress-rs-import:
	cargo run -p stress-tests -- import

stress-rs-dedup:
	cargo run -p stress-tests -- dedup

stress-rs-conn-leak:
	cargo run -p stress-tests -- conn-leak

K6 := docker run --rm -i --network host \
	-v $(PWD)/stress-tests/k6:/k6 \
	-v $(PWD)/stress-tests/fixtures:/fixtures \
	-e API_BASE=$(API_BASE) \
	-e ADMIN_LOGIN=$(ADMIN_LOGIN) \
	-e ADMIN_PASSWORD=$(ADMIN_PASSWORD) \
	grafana/k6 run

stress-k6-smoke:
	$(K6) /k6/public-smoke.js

stress-k6-ready:
	$(K6) /k6/public-ready-certificates.js

stress-k6-queued:
	$(K6) /k6/public-queued-certificates.js

stress-k6-preview:
	$(K6) /k6/admin-preview.js

stress-k6-import:
	$(K6) /k6/admin-import.js

stress-k6-mixed:
	$(K6) /k6/mixed-realistic.js

stress-k6-all: stress-k6-smoke stress-k6-ready stress-k6-queued stress-k6-preview stress-k6-import stress-k6-mixed
