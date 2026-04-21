#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="${API_BASE:-http://127.0.0.1:8080}"

echo "=== Clearing generated certificates for queued test ==="

# 1. Remove generated PDF files from local storage
if [ -d "uploads/generated" ]; then
  rm -f uploads/generated/*.pdf
  echo "Removed local generated PDFs"
fi

# 2. Clear Redis job statuses
docker exec decentra-certificates-redis-1 redis-cli --raw KEYS 'certificate:job:*' | while read key; do
  docker exec decentra-certificates-redis-1 redis-cli DEL "$key" > /dev/null
done 2>/dev/null || echo "Redis keys cleared (or none existed)"

# 3. Clear queue
docker exec decentra-certificates-redis-1 redis-cli DEL certificates:queue > /dev/null 2>/dev/null || true
echo "Cleared Redis queue"

echo "=== Ready for queued certificate test ==="
