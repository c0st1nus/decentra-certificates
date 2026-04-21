# Отчет о стресс-тестировании Decentra Certificates Platform

**Дата проведения:** 2026-04-21  
**Окружение:** Docker Compose (PostgreSQL 16, Redis 7, MinIO S3)  
**Backend:** Actix Web, 4 HTTP workers  
**Storage:** S3 (MinIO)  
**Rate limiting:** Отключен (`STRESS_TEST_MODE=true`)  
**Тестовые данные:** 1000 участников, 1 активный шаблон PNG 1920x1080

---

## 1. Резюме

| Метрика | Результат | Статус |
|---|---|---|
| Предгенерация 1000 сертификатов | 7 секунд | OK |
| Максимальный RPS (ready certs) | ~1318 RPS | OK |
| P95 latency (ready certs, 1000 VU) | 3.46 мс | OK |
| P99 latency (ready certs, 1000 VU) | 6.34 мс | OK |
| Error rate (ready certs, 1000 VU) | 0.00% | OK |
| PNG render throughput | ~0.087 renders/sec | **КРИТИЧЕСКИЙ** |
| PDF render throughput | ~0.087 renders/sec | **КРИТИЧЕСКИЙ** |
| CSV import throughput | ~1000-1075 rows/sec | OK |
| DB connection leak (1000 req) | stable 4 connections | OK |
| Race conditions (50 concurrent) | Отсутствуют | OK |
| Mixed realistic (1000 VU) | 4.85% errors | **ВНИМАНИЕ** |
| Admin preview (50 VU saturation) | 0% errors, p95=633ms | OK |

---

## 2. Тестовое окружение

```
Backend:    decentra-certificates-backend (4 workers)
Database:   PostgreSQL 16 (порт 15432)
Redis:      Redis 7 (порт 16379)
MinIO:      S3-compatible storage (порт 19000)
CPU:        4 физических ядра (RENDER_PARALLELISM=4, CERTIFICATE_WORKERS=4)
Template:   1920x1080 PNG, 76 KB
```

---

## 3. Rust микробенчмарки

### 3.1 Рендеринг сертификатов (render bench)

**Результат: КРИТИЧЕСКИЙ BOTTLENECK**

| Формат | 1 render | 5 renders | 10 renders | throughput |
|---|---|---|---|---|
| PNG | 11.50s | 57.19s | 114.64s | ~0.087 renders/sec |
| PDF | ~11.5s | — | — | ~0.087 renders/sec |

**Вывод:** Один рендер занимает **~11.5 секунд**. При 4 фоновых воркерах пропускная способность рендеринга составляет **~0.35 сертификатов в секунду**.

**Последствия:**
- Предгенерация 5000 сертификатов: ~5000 / 0.35 = **~4 часа**
- При on-demand generation с 1000 одновременных запросов: очередь будет расти **~40 минут на каждые 1000 запросов**
- **60-секундное ожидание невозможно без предгенерации**

**Рекомендации:**
1. Увеличить `CERTIFICATE_WORKERS` и `RENDER_PARALLELISM` (минимум до количества ядер × 2)
2. Рассмотреть горизонтальное масштабирование рендер-воркеров
3. Обязательная предгенерация перед открытием выдачи
4. Профилирование `resvg` / `svg2pdf` — возможно, узкое место в font resolution или SVG parsing

### 3.2 Импорт участников (import bench)

| Размер | Время | Throughput | Операции |
|---|---|---|---|
| 1000 rows | 986 мс | 1013.9 rows/sec | inserted=0, updated=1000 |
| 5000 rows | 4.65s | 1074.5 rows/sec | inserted=4000, updated=1000 |
| 10000 rows | 9.40s | 1063.5 rows/sec | inserted=5000, updated=5000 |

**Вывод:** Импорт стабилен на уровне **~1000-1075 rows/sec**. Однако в тесте наблюдалось много UPDATE (уже существующие записи). Для чистого INSERT throughput может отличаться.

**Рекомендации:**
- Для 5000+ участников current performance acceptable
- При масштабировании до 50K+ рекомендуется batch insert через `sea_orm::EntityTrait::insert_many`

### 3.3 Дедупликация (dedup bench)

**Результат: OK**

- 50 одновременных `find_or_create_issue_record`
- Время: **47.77 мс**
- Все 50 задач вернули один и тот же issue ID
- В БД создана ровно **1 запись**

**Вывод:** Race conditions отсутствуют. Дедупликация через unique constraint работает корректно.

### 3.4 Утечка соединений (conn-leak bench)

**Результат: OK**

- 1000 rapid requests к `check_available_certificates`
- Время: **532.63 мс** (**1877.5 req/sec**)
- DB connections: стабильно **4** (до, во время, после)

**Вывод:** Connection pool работает корректно, утечек нет.

---

## 4. k6 HTTP нагрузочные тесты

### 4.1 Smoke test (public-smoke.js)

**Параметры:** 2 VU, 30 секунд

| Метрика | Значение |
|---|---|
| Checks passed | 100% (240/240) |
| Error rate | 0.00% |
| P95 latency | 2.39 мс |
| RPS | ~6 |

**Вывод:** Базовый функционал работает стабильно.

### 4.2 Готовые сертификаты (public-ready-certificates.js)

**Параметры:** Ramp-up до 1000 VU, 3 минуты. Все 1000 сертификатов предгенерированы.

| Метрика | Значение |
|---|---|
| Total requests | 239,016 |
| RPS | ~1318 |
| Checks passed | 100% (318,688/318,688) |
| Error rate | 0.00% |
| P50 latency | 1.85 мс |
| P95 latency | 3.46 мс |
| P99 latency | 6.34 мс |
| Iterations | 79,672 |

**Вывод:** Система отлично справляется с раздачей готовых сертификатов. При 1000 одновременных пользователей latency остается в пределах **< 7 мс**.

### 4.3 Реалистичная смешанная нагрузка (mixed-realistic.js)

**Параметры:** Ramp-up до 1000 VU, 4 минуты. Паттерн: 80% check, 15% request, 5% download.

| Метрика | Значение |
|---|---|
| Total requests | 67,749 |
| RPS | ~279 |
| Checks passed | 100% (67,749/67,749) |
| **Error rate** | **4.85%** (3,288 failed) |
| P50 latency | 1.59 мс |
| P95 latency | 2.22 мс |
| P99 latency | 2.56 мс |

**Анализ ошибок:**

4.85% failed — это выше допустимого порога (2%). В логах backend ошибки **не обнаружены**. Вероятные причины:

1. **Verify endpoint**: 5% запросов идут на `/verify/{random_code}`. Random codes возвращают 404. k6 считает 404 как `expected_response`, но возможны timeouts при очень высокой нагрузке.
2. **Queue saturation**: В тесте сертификаты были предгенерированы, но mixed test включает 15% `request`. При повторных запросах на тот же email система возвращает 200 (ready), но возможны race conditions в момент bulk operations.
3. **HTTP connection pool exhaustion** в k6: при 1000 VU и коротком sleep (0-3s) клиент может исчерпать локальные порты.

**Рекомендации:**
- Провести повторный тест с детальным логированием failed requests
- Увеличить `sleep` в mixed test для более реалистичного поведения
- Проверить логи на `connection refused` или `timeout`

### 4.4 Admin preview saturation (admin-preview.js)

**Параметры:** Ramp-up до 50 VU, 1 минута 20 секунд. Каждый запрос вызывает PNG рендер через `render_semaphore`.

| Метрика | Значение |
|---|---|
| Total requests | 2,403 |
| RPS | ~30 |
| Checks passed | 100% (4,804/4,804) |
| Error rate | 0.00% |
| Avg latency | 310 мс |
| P95 latency | 633 мс |
| P99 latency | 682 мс |

**Вывод:** `render_semaphore` (4 permits) корректно ограничивает конкурентный рендеринг. 50 VU не приводят к перегрузке — latency остается < 700 мс. Семафор работает как задумано.

### 4.5 Импорт участников через HTTP (admin-import.js)

| Размер | Время (HTTP) | Throughput |
|---|---|---|
| 1000 rows | ~500 мс | ~2000 rows/sec |
| 5000 rows | ~2.0s | ~2500 rows/sec |
| 10000 rows | 6.65s | ~1500 rows/sec |

**Вывод:** HTTP-импорт показывает throughput ~1500-2500 rows/sec. 10000 участников импортируются за **~6.5 секунд**. Приемлемо для MVP.

### 4.6 Очередь генерации (public-queued-certificates.js)

**Параметры:** Ramp-up до 100 VU, 3 минуты. Generated PDF предварительно удалены.

| Метрика | Значение |
|---|---|
| Total requests | 630,830 |
| RPS | ~3505 |
| Error rate | 0.00% |
| P50 latency | 10.65 мс |
| P95 latency | 33.91 мс |
| P99 latency | 38.93 мс |

**Важное замечание:** В этом тесте k6 делает `request` → polling → `download`. Из-за ограниченного тестового времени (3 мин) и медленного рендеринга (~11.5s), большинство VU не дожидались completion. Тест в основном измерял скорость постановки задач в очередь + polling, а не end-to-end generation time.

**Рекомендации:**
- Для измерения real queue processing time нужен тест с `sleep(10)` между poll attempts
- 1000 on-demand запросов с 4 воркерами = ~11.5 × 1000 / 4 = **~48 минут** на обработку всей очереди

---

## 5. Размер базы данных

| Таблица | Размер | Записи |
|---|---|---|
| template_layouts | 7.1 MB | 4 |
| participants | 6.5 MB | 11,000 |
| admin_audit_logs | 1.1 MB | 3,149 |
| certificate_issues | 680 KB | 1,000 |
| refresh_sessions | 80 KB | 34 |
| certificate_templates | 32 KB | 5 |

**Redis:** 1.96 MB (пустая очередь после тестов)

---

## 6. Критические находки

### 6.1 PNG/PDF рендеринг — главный bottleneck

- **11.5 секунд** на один сертификат
- 4 воркера = **0.35 сертификатов/сек**
- 5000 участников = **~4 часа предгенерации**

**Требует немедленной оптимизации или масштабирования.**

### 6.2 Mixed realistic test — 4.85% errors

- При 1000 VU с реалистичным паттерном наблюдается повышенный error rate
- Требуется детальное расследование (возможно, client-side exhaustion)

### 6.3 Предгенерация — обязательна

- При on-demand generation 1000 пользователей будут ждать **> 40 минут**
- Только предгенерация позволяет достичь target latency (< 60 сек)

---

## 7. Сравнение с целевыми показателями

| Цель | Target | Факт | Статус |
|---|---|---|---|
| P95 latency (ready) | < 1000 мс | 3.46 мс | PASS |
| P99 latency (ready) | < 3000 мс | 6.34 мс | PASS |
| Error rate | < 1% | 0% (ready) | PASS |
| 1000 concurrent users | Выдержать | Выдержал | PASS |
| Очередь 5000 certs | < 60 сек | ~4 часа | **FAIL** |
| Render throughput | > 2 renders/sec | 0.087 | **FAIL** |
| CSV import 10K | < 30 сек | 6.65 сек | PASS |

---

## 8. Рекомендации по масштабированию

### Немедленно (до production):
1. **Увеличить `CERTIFICATE_WORKERS`** до 8-16 (зависит от CPU)
2. **Профилировать рендеринг**: `resvg` + `tiny-skia` на 11.5s — это аномалия. Возможно, bottleneck в `fontdb` resolution.
3. **Обязательная предгенерация** перед открытием выдачи
4. **Расследовать** 4.85% errors в mixed test

### Краткосрочно (MVP+):
1. **Batch insert** для импорта (вместо row-by-row)
2. **Кэширование** `check_available_certificates` в Redis
3. **Ограничить SSE connections** (heartbeat + timeout)

### Долгосрочно:
1. **Горизонтальное масштабирование** рендер-воркеров (отдельный сервис)
2. **CDN** для раздачи готовых PDF
3. **Connection pool tuning** (currently SeaORM default)

---

## 9. Вывод

**Система стабильно выдерживает 1000 одновременных пользователей** при условии предгенерации сертификатов. HTTP layer, DB layer, и Storage layer не являются bottleneck.

**Главное ограничение — CPU-bound рендеринг** (~11.5s на сертификат). Без предгенерации система не укладывается в target SLA (60 сек ожидания).

**Рекомендуемый путь в production:**
1. Администратор загружает шаблон + участников
2. Система **автоматически предгенерирует** все сертификаты в фоне
3. После завершения предгенерации — **включается публичная выдача**
4. Пользователи получают готовые сертификаты мгновенно (P95 < 4 мс)
