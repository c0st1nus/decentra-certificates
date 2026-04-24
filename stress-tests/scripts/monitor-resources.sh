#!/bin/bash
set -euo pipefail

PID_FILE="${PID_FILE:-stress-tests/results/backend.pid}"
OUTPUT="${OUTPUT:-stress-tests/results/resource-monitor.csv}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-2}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-decentra-certificates-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-decentra-certificates-redis}"

if [ ! -f "$PID_FILE" ]; then
  echo "ERROR: PID file not found: $PID_FILE" >&2
  exit 1
fi

BACKEND_PID=$(tr -d '\n' < "$PID_FILE")
mkdir -p "$(dirname "$OUTPUT")"

echo "timestamp,backend_rss_kib,backend_vsz_kib,backend_cpu_pct,backend_mem_pct,system_used_mib,system_available_mib,redis_used_memory_bytes,postgres_connections" > "$OUTPUT"

while kill -0 "$BACKEND_PID" 2>/dev/null; do
  TS=$(date -Iseconds)
  PS_VALUES=$(ps -p "$BACKEND_PID" -o rss=,vsz=,pcpu=,pmem= | awk '{$1=$1; print $1","$2","$3","$4}')
  MEM_VALUES=$(free -m | awk '/^Mem:/ {print $3","$7}')
  REDIS_MEMORY=$(docker exec "$REDIS_CONTAINER" redis-cli INFO memory 2>/dev/null | awk -F: '/^used_memory:/ {gsub("\r", "", $2); print $2}' || true)
  POSTGRES_CONNECTIONS=$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d decentra_certificates -tAc "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null || true)

  echo "$TS,$PS_VALUES,$MEM_VALUES,${REDIS_MEMORY:-0},${POSTGRES_CONNECTIONS:-0}" >> "$OUTPUT"
  sleep "$INTERVAL_SECONDS"
done
