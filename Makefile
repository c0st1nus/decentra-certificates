SHELL := /bin/sh

.PHONY: help install up down logs ps backend frontend migrate migrate-down \
	check test lint fmt dev setup

help:
	@printf "%s\n" \
		"Available targets:" \
		"  make install       - install frontend dependencies with bun" \
		"  make up            - start PostgreSQL and Redis with docker compose" \
		"  make down          - stop local infrastructure" \
		"  make logs          - show docker compose logs" \
		"  make ps            - show docker compose service status" \
		"  make backend       - run Rust Actix API" \
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
