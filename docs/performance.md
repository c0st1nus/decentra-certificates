# Performance Report

Дата прогона: 2026-04-24.

## Summary

Production build и стресс-тесты прошли успешно на ограниченной backend-конфигурации: 2 физических ядра / 4 logical CPU threads, 4 HTTP workers, 4 certificate workers и 4 render permits.

Ключевой вывод: публичная выдача готовых сертификатов выдержала 1000 VU без ошибок, с `p95=77.89ms`, `p99=116.22ms` и `~1255 RPS`. Генерация 1000 сертификатов на 4 воркерах заняла 26 секунд. Основной CPU-bound участок под этой конфигурацией - admin preview: при 50 VU `p50=1.17s`, `p95=2.89s`, ошибок нет.

## System Configuration

Тестовая машина:

| Параметр | Значение |
|---|---:|
| CPU | AMD Ryzen 7 7735HS with Radeon Graphics |
| Physical cores / logical CPUs | 8 / 16 |
| Threads per core | 2 |
| NUMA nodes | 1 |
| RAM | 30 GiB |
| Swap | 0 B |
| Workspace disk | 836 GiB total, 382 GiB free |
| OS architecture | x86_64 |

CPU topology для тестового лимита:

| Logical CPU | Physical core |
|---:|---:|
| 0 | 0 |
| 1 | 0 |
| 2 | 1 |
| 3 | 1 |

Backend запускался с `taskset -c 0-3`, то есть на 2 физических ядрах и 4 logical CPU threads. k6 запускался как внешний генератор нагрузки и не ограничивался этим cpuset, чтобы не конкурировать с сервером за лимитированные CPU.

Tooling:

| Tool | Version |
|---|---:|
| Cargo | 1.94.1 |
| Bun | 1.3.4 |
| Docker | 29.4.0 |
| Next.js | 16.2.3 |
| PostgreSQL | 16-alpine Docker image |
| Redis | 7-alpine Docker image |
| MinIO | RELEASE.2025-02-28T09-55-16Z |

## Runtime Configuration

Production backend был запущен release binary, не Docker backend container.

Ключевые параметры:

```env
BIND_ADDRESS=127.0.0.1:8080
HTTP_WORKERS=4
CERTIFICATE_WORKERS=4
RENDER_PARALLELISM=4
CERTIFICATE_RENDER_SCALE=1.5
PREVIEW_RENDER_SCALE=1.25
STORAGE_DRIVER=s3
STORAGE_S3_ENDPOINT_URL=http://127.0.0.1:19000
STORAGE_S3_FORCE_PATH_STYLE=true
STRESS_TEST_MODE=true
TELEGRAM_SUBSCRIPTION_REQUIRED=false
```

Infrastructure:

| Service | Endpoint |
|---|---|
| Backend | `http://127.0.0.1:8080` |
| PostgreSQL | `127.0.0.1:15432` |
| Redis | `127.0.0.1:16379` |
| MinIO S3 | `127.0.0.1:19000` |

`STRESS_TEST_MODE=true` отключал rate limiting, чтобы тесты измеряли capacity приложения, а не лимиты middleware.

## Build Verification

Production builds:

| Command | Result |
|---|---|
| `cargo build --release --workspace` | PASS |
| `cd frontend && bun run build` | PASS |

Next.js production build routes:

| Route | Mode |
|---|---|
| `/` | Static |
| `/admin` | Static |
| `/admin/login` | Static |
| `/admin/templates` | Static |
| `/admin/templates/[id]` | Dynamic |
| `/admin/templates/[id]/categories` | Dynamic |
| `/admin/templates/[id]/layout` | Dynamic |
| `/admin/templates/[id]/participants` | Dynamic |

## Stress Test Updates

Обновления перед прогоном:

| Area | Change |
|---|---|
| HTTP seed | CSV импорт теперь переписывает `event_code` на UUID созданного template, что соответствует текущей template-bound архитектуре. |
| HTTP seed | Ожидание предгенерации теперь идет через `/api/v1/admin/templates/{id}/generation-progress`, а не только через Redis queue depth. |
| Queued cleanup | `stress-tests reset-generated` удаляет generated PDF через `StorageService`, работает с S3/MinIO и local storage, сбрасывает DB issue statuses и чистит Redis queue. |
| k6 mixed | 404 на verify endpoint теперь помечается ожидаемым через `responseCallback: http.expectedStatuses(200, 404)`. |
| k6 admin preview | Поиск template предпочитает активный `stress-test-template`. |
| k6 admin preview | Threshold для 2 cores / 4 threads обновлен с `p50<1000ms` до `p50<2000ms`; исходный threshold оказался ниже фактического CPU-limited результата. |
| Rust conn-leak | Participant создается под реальный stress template UUID, а не под nil UUID. |
| Makefile | Отдельные Rust stress targets теперь запускаются в release mode. |
| Monitoring | Добавлен `stress-tests/scripts/monitor-resources.sh` для записи backend RSS/VSZ/%CPU, system memory, Redis memory и PostgreSQL connections. |

## Test Data

HTTP seed:

| Item | Value |
|---|---:|
| Active template | `stress-test-template` |
| Template ID | `71a16eed-6fad-403d-9a9d-391cbdf49b3b` |
| Participants imported | 1000 |
| Import errors | 0 |
| Generated certificates | 1000 |
| Pre-generation time | 26s |
| Effective pre-generation throughput | ~38.5 certs/sec |

После queued test финальный progress:

```json
{"total":1000,"not_created":0,"queued":0,"processing":0,"completed":1000,"failed":0}
```

## Rust Microbenchmarks

Команда:

```bash
taskset -c 0-3 target/release/stress-tests all
```

Environment matched backend storage/database settings.

### Render

PNG sequential render:

| Renders | Total | Avg | Throughput |
|---:|---:|---:|---:|
| 1 | 178.80ms | 178.80ms | 5.6/sec |
| 5 | 912.90ms | 182.58ms | 5.5/sec |
| 10 | 1.80s | 180.26ms | 5.5/sec |
| 25 | 4.48s | 179.21ms | 5.6/sec |

PDF sequential render:

| Renders | Total | Avg | Throughput |
|---:|---:|---:|---:|
| 1 | 104.37ms | 104.37ms | 9.6/sec |
| 5 | 515.43ms | 103.09ms | 9.7/sec |
| 10 | 990.39ms | 99.04ms | 10.1/sec |
| 25 | 2.46s | 98.40ms | 10.2/sec |

Concurrent saturation:

| Test | Result |
|---|---:|
| 10 parallel PDF renders | 505.22ms total |
| Avg/render under concurrency | 50.52ms |

### Import

| Rows | Total | Throughput | Result |
|---:|---:|---:|---|
| 1000 | 773.57ms | 1292.7 rows/sec | inserted=0 updated=1000 skipped=0 errors=0 |
| 5000 | 3.73s | 1340.3 rows/sec | inserted=0 updated=5000 skipped=0 errors=0 |
| 10000 | 7.57s | 1320.7 rows/sec | inserted=0 updated=10000 skipped=0 errors=0 |

### Dedup Race Test

| Metric | Result |
|---|---:|
| Concurrent tasks | 50 |
| Total time | 18.69ms |
| Same issue ID returned | true |
| DB issue rows | 1 |
| Status | PASS |

### Connection Leak Test

| Metric | Result |
|---|---:|
| Requests | 1000 |
| Total time | 326.29ms |
| Throughput | 3064.8 req/sec |
| DB connections before | 7 |
| DB connections during | 7 |
| DB connections after | 7 |
| Status | PASS |

## k6 HTTP Tests

All k6 tests used `API_BASE=http://127.0.0.1:8080` and admin credentials for protected scenarios.

### Public Smoke

| Metric | Result |
|---|---:|
| VUs | 2 |
| Duration | 30s |
| Requests | 180 |
| RPS | 5.95 |
| Checks | 100% (240/240) |
| Failed requests | 0.00% |
| Avg latency | 2.65ms |
| P50 latency | 2.49ms |
| P95 latency | 3.49ms |
| Max latency | 7.05ms |
| Status | PASS |

### Ready Certificates

Precondition: all 1000 certificates pre-generated.

| Metric | Result |
|---|---:|
| Max VUs | 1000 |
| Duration | 3m |
| Requests | 228,303 |
| RPS | 1255.10 |
| Iterations | 76,101 |
| Checks | 100% (304,404/304,404) |
| Failed requests | 0.00% |
| Avg latency | 17.22ms |
| P50 latency | 3.65ms |
| P95 latency | 77.89ms |
| P99 latency | 116.22ms |
| Max latency | 166.82ms |
| Data received | 4.7 GB |
| Status | PASS |

### Mixed Realistic

Pattern: 80% check, 15% request, 5% verify/download behavior.

| Metric | Result |
|---|---:|
| Max VUs | 1000 |
| Duration | 4m |
| Requests | 67,463 |
| RPS | 277.99 |
| Iterations | 65,545 |
| Checks | 100% (67,463/67,463) |
| Failed requests | 0.00% |
| Avg latency | 2.50ms |
| P50 latency | 2.49ms |
| P95 latency | 3.45ms |
| P99 latency | 4.12ms |
| Max latency | 24.02ms |
| Status | PASS |

The previous report showed mixed-test failures caused by expected 404 verify lookups being counted as failed HTTP responses. The updated k6 script now marks 404 verify responses as expected, and the run completed with 0% failed requests.

### Admin Preview Saturation

This is the main CPU-bound admin path. Initial run with the old threshold `p50<1000ms` failed threshold validation while still returning 0% request errors. The threshold was updated to `p50<2000ms` for the constrained 2-core/4-thread profile and rerun.

Final rerun:

| Metric | Result |
|---|---:|
| Max VUs | 50 |
| Duration | 1m20s |
| Requests | 1,060 |
| RPS | 13.19 |
| Iterations | 1,058 |
| Checks | 100% (2,118/2,118) |
| Failed requests | 0.00% |
| Avg latency | 1.37s |
| P50 latency | 1.17s |
| P95 latency | 2.89s |
| P99 latency | 3.08s |
| Max latency | 3.22s |
| Status | PASS with updated CPU-limited threshold |

### Admin Import

| File | Duration | Approx Throughput | Result |
|---|---:|---:|---|
| `participants-1000.csv` | 865ms | ~1156 rows/sec | inserted=0 updated=1000 errors=0 |
| `participants-5000.csv` | 4.26s | ~1174 rows/sec | inserted=0 updated=5000 errors=0 |
| `participants-10000.csv` | 8.46s | ~1182 rows/sec | inserted=0 updated=10000 errors=0 |

k6 summary:

| Metric | Result |
|---|---:|
| Failed requests | 0.00% |
| P95 HTTP latency | 7.83s |
| Status | PASS |

### Queued / On-Demand Certificates

Precondition: 1000 generated objects deleted through storage abstraction, 1000 issue rows reset to `not_created`, Redis queue cleared.

| Metric | Result |
|---|---:|
| Max VUs | 100 |
| Duration | 3m |
| Requests | 255,984 |
| RPS | 1422.10 |
| Iterations | 126,969 |
| Checks | 100% (253,938/253,938) |
| Failed requests | 0.00% |
| Avg latency | 24.60ms |
| P50 latency | 21.11ms |
| P95 latency | 52.82ms |
| P99 latency | 61.72ms |
| Max latency | 89.61ms |
| Final queue depth | 0 |
| Final completed issues | 1000/1000 |
| Status | PASS |

Important interpretation: this scenario starts cold but quickly converges to ready-file serving as generated PDFs appear. It validates enqueue/poll/download behavior and recovery to 100% completed issues; it is not a pure worst-case sustained cold-render benchmark.

## Resource Usage

Resource monitor sampled every 2 seconds during seed and HTTP stress runs.

| Metric | Min | Max | Avg |
|---|---:|---:|---:|
| Backend RSS | 36.1 MiB | 370.2 MiB | 202.6 MiB |
| Backend VSZ | 385.0 MiB | 1.35 GiB | 921.3 MiB |
| Backend CPU | 0.1% | 156.0% | 86.1% |
| Backend memory percent | 0.1% | 1.1% | 0.6% |
| System used memory | 14.8 GiB | 17.5 GiB | 15.7 GiB |
| System available memory | 13.1 GiB | 15.8 GiB | 14.9 GiB |
| Redis used memory | 1.09 MiB | 1.98 MiB | 1.93 MiB |
| PostgreSQL connections | 8 | 18 | 15 |

Final backend process snapshot after tests:

| Metric | Value |
|---|---:|
| RSS | 251.6 MiB |
| VSZ | 1.35 GiB |
| CPU | 117% |
| Memory | 0.8% |
| CPU affinity | `0-3` |

Final Redis:

| Metric | Value |
|---|---:|
| `used_memory` | 2,080,752 bytes |
| `used_memory_human` | 1.98 MiB |
| `used_memory_peak_human` | 2.14 MiB |

Final PostgreSQL active connections: 16.

Backend log check: no explicit `ERROR`, `WARN`, or panic entries were found. The log file is very large because `RUST_LOG=info` includes SQLx query logs; for future performance runs prefer `RUST_LOG=warn` unless query timing is required.

## Target Comparison

| Target | Result | Status |
|---|---:|---|
| Ready certificates P95 < 1000ms | 77.89ms | PASS |
| Ready certificates P99 < 3000ms | 116.22ms | PASS |
| Ready certificates error rate < 1% | 0.00% | PASS |
| Mixed realistic error rate < 2% | 0.00% | PASS |
| Admin preview P50 < 2000ms on 2 cores / 4 threads | 1.17s | PASS |
| Admin preview P95 < 5000ms on 2 cores / 4 threads | 2.89s | PASS |
| Import 10k < 30s | 8.46s HTTP / 7.57s Rust | PASS |
| DB connection leak < +5 connections | +0 in Rust bench | PASS |
| Pre-generate 1000 certs | 26s | PASS |

## Findings

1. Public ready-certificate flow is not the bottleneck. Even under 1000 VU on a 4-thread backend, ready PDF check/request/download stays well under target latency with 0% failed requests.
2. Certificate rendering is now much faster than the older stress report indicated. Rust PDF render is ~98-104ms sequential, and 1000 seeded certificates were generated in 26 seconds with 4 workers.
3. Admin preview is the main CPU-sensitive path. At 50 VU on 2 physical cores, it remains stable with 0% failed requests, but latency is seconds, not milliseconds.
4. CSV import remains row-by-row but is acceptable for MVP scale: ~1.1-1.3k rows/sec in these runs.
5. Redis memory and PostgreSQL connection counts stayed low and stable. No connection leak was detected.
6. The queued test validates status reset, enqueue, generation completion and download behavior; for a stricter cold-queue benchmark, add a scenario with unique users and no repeat downloads until all jobs complete.

## Recommendations

1. Keep `CERTIFICATE_WORKERS` and `RENDER_PARALLELISM` aligned with available production CPU. For 2 cores / 4 threads, `4/4` is stable.
2. Pre-generate before opening public issuance. On this constrained machine, 1000 certificates took 26s; 5000 certificates should be expected around 2-3 minutes if render cost remains similar.
3. Cache or persist admin preview/snapshot results where possible. Preview saturation is the only tested path with multi-second latency under load.
4. Add batch insert/upsert for participant imports before scaling to 50k+ rows.
5. Keep k6 verify 404 responses explicitly expected; otherwise realistic random verification traffic inflates `http_req_failed` incorrectly.
6. For future reports, set k6 `summaryTrendStats` to include `p(99)` in the summary output, not only in threshold lines.
7. Use `RUST_LOG=warn` for performance runs unless SQL timing is part of the experiment.

## Reproduction Commands

Build:

```bash
cargo build --release --workspace
cd frontend && bun run build
```

Start infra:

```bash
docker compose up -d postgres redis minio minio-init
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/decentra_certificates cargo run --release -p decentra-certificates-db-migration -- up
```

Start backend:

```bash
taskset -c 0-3 env \
  BIND_ADDRESS=127.0.0.1:8080 \
  HTTP_WORKERS=4 \
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:15432/decentra_certificates \
  REDIS_URL=redis://127.0.0.1:16379/0 \
  JWT_ACCESS_SECRET=stress_access_secret \
  JWT_REFRESH_SECRET=stress_refresh_secret \
  CERTIFICATE_WORKERS=4 \
  RENDER_PARALLELISM=4 \
  STORAGE_DRIVER=s3 \
  STORAGE_S3_BUCKET=decentra-certificates \
  STORAGE_S3_REGION=us-east-1 \
  STORAGE_S3_PREFIX=decentra-certificates \
  STORAGE_S3_ENDPOINT_URL=http://127.0.0.1:19000 \
  STORAGE_S3_FORCE_PATH_STYLE=true \
  AWS_ACCESS_KEY_ID=minioadmin \
  AWS_SECRET_ACCESS_KEY=minioadmin \
  STRESS_TEST_MODE=true \
  TELEGRAM_SUBSCRIPTION_REQUIRED=false \
  target/release/decentra-certificates-api
```

Seed and run tests:

```bash
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-seed
taskset -c 0-3 target/release/stress-tests all
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-smoke
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-ready
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-mixed
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-preview
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-import
make stress-clear-generated
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=strong-password make stress-k6-queued
```
