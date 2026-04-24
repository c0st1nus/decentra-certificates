# Stress Tests

Нагрузочное и стресс-тестирование для Decentra Certificates Platform.

## Структура

```
stress-tests/
  fixtures/           # Тестовые данные (PNG шаблон, CSV с участниками)
  k6/                 # HTTP нагрузочные тесты (k6)
  rs/                 # Нативные Rust микробенчмарки
  scripts/            # Вспомогательные скрипты (seed, cleanup)
```

## Подготовка

### 1. Запустить инфраструктуру и backend

```bash
make setup      # PostgreSQL, Redis, MinIO, миграции
make backend    # API на 127.0.0.1:8080
```

### 2. Включить stress-test mode

Добавь в `.env` (или экспортируй перед запуском backend):

```env
STRESS_TEST_MODE=true
```

Это отключает rate limiting (`actix-governor`), чтобы тесты измеряли реальную пропускную способность сервера, а не лимиты middleware.

### 3. Сгенерировать фикстуры

```bash
make stress-fixtures
```

Создаст:
- `fixtures/template.png` — тестовый шаблон сертификата
- `fixtures/participants-1000.csv`
- `fixtures/participants-5000.csv`
- `fixtures/participants-10000.csv`

### 4. Seed данных для HTTP тестов

```bash
make stress-seed
```

Этот скрипт:
1. Логинится как админ
2. Загружает шаблон
3. Сохраняет layout
4. Импортирует 1000 участников
5. Активирует шаблон
6. Включает выдачу сертификатов
7. Ожидает завершения предгенерации всех сертификатов

## Rust микробенчмарки

Запускаются напрямую через cargo, без поднятого HTTP сервера. Требуют подключенной PostgreSQL и Redis.

```bash
# Все бенчмарки
make stress-rs

# По отдельности
make stress-rs-render       # Бенчмарк рендеринга PNG + PDF
make stress-rs-import       # Бенчмарк импорта CSV (1k, 5k, 10k)
make stress-rs-dedup        # Race condition test (find_or_create_issue_record)
make stress-rs-conn-leak    # Тест утечки DB connections
make stress-rs-reset-generated # Сброс generated PDF/status для queued HTTP теста
```

### Что измеряют

- **render**: время рендера одного PNG/PDF, throughput (renders/sec), saturation при 10 concurrent рендерах
- **import**: время импорта CSV разного размера, throughput (rows/sec)
- **dedup**: 50 одновременных `find_or_create_issue_record` для одного участника — проверка отсутствия race conditions
- **conn-leak**: 1000 rapid requests, мониторинг active DB connections

## k6 HTTP нагрузочные тесты

Запускаются через Docker (`grafana/k6`). Требуют поднятый backend.

```bash
# Smoke test (1-2 VU, sanity check)
make stress-k6-smoke

# Готовые сертификаты (до 1000 VU)
# Предварительно: make stress-seed
make stress-k6-ready

# Очередь генерации (до 100 VU)
# Предварительно: make stress-clear-generated
make stress-k6-queued

# Admin preview saturation (до 50 VU)
make stress-k6-preview

# Import benchmark (1k, 5k, 10k rows)
make stress-k6-import

# Mixed realistic load (до 1000 VU, 80% check / 15% request / 5% download)
make stress-k6-mixed

# Все k6 тесты подряд
make stress-k6-all
```

### Переменные окружения

```bash
API_BASE=http://127.0.0.1:8080 ADMIN_LOGIN=admin ADMIN_PASSWORD=secret make stress-k6-ready
```

### Мониторинг во время тестов

Открой отдельные терминалы:

```bash
# CPU / Memory контейнеров
docker stats

# PostgreSQL active connections
docker exec decentra-certificates-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Redis queue depth
docker exec decentra-certificates-redis redis-cli ZCARD certificates:queue

# Redis memory
docker exec decentra-certificates-redis redis-cli INFO memory
```

Для корректного теста на 2 физических ядрах / 4 потоках запускайте production backend с affinity на четыре logical CPU одного NUMA node, например `taskset -c 0-3`, и выставляйте `HTTP_WORKERS=4`, `CERTIFICATE_WORKERS=4`, `RENDER_PARALLELISM=4`.

Для записи RAM/CPU во время прогона можно использовать:

```bash
PID_FILE=stress-tests/results/backend.pid OUTPUT=stress-tests/results/resource-monitor.csv stress-tests/scripts/monitor-resources.sh
```

## Интерпретация результатов

### Целевые показатели

| Метрика | Целевое значение |
|---|---|
| P95 latency (ready certificates) | < 1000 мс |
| P99 latency (ready certificates) | < 3000 мс |
| P50 latency (admin preview, 2 cores / 4 threads) | < 2000 мс |
| P95 latency (admin preview, 2 cores / 4 threads) | < 5000 мс |
| Error rate | < 1% |
| Render throughput (PNG) | > 5 renders/sec |
| Render throughput (PDF) | > 2 renders/sec |
| Import throughput (1k rows) | > 500 rows/sec |
| DB connection leak | < +5 connections после 1000 requests |
| Queue drain (5000 certs, 4 workers) | < 60 секунд |

### Типичные bottleneck'ы

1. **CPU 100% на рендеринге** — `render_semaphore` и `CERTIFICATE_WORKERS` ограничены числом CPU. Масштабирование: увеличить `CERTIFICATE_WORKERS` и `RENDER_PARALLELISM` или горизонтально (больше инстансов).
2. **DB connection pool exhausted** — SeaORM/SQLx дефолт ~10 коннектов. При 1000 concurrent HTTP requests pool может исчерпаться. Решение: увеличить `max_connections` в `DATABASE_URL` или конфиге.
3. **Redis очередь растет** — при on-demand generation с 4 воркерами throughput ~2-4 сертификата/сек. На 1000 запросов очередь будет обрабатываться 4-8 минут. Решение: предгенерировать или масштабировать воркеры.
4. **Row-by-row import** — 5000 участников = 5000 последовательных INSERT/UPDATE. Решение: batch insert.
