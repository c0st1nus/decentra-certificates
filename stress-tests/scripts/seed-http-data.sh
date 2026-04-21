#!/bin/bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8080}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-strong-password}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/../fixtures"

echo "=== Seeding stress test data ==="
echo "API: $API_BASE"

# 1. Login
echo "--- Admin login ---"
LOGIN_RESP=$(curl -s -X POST "$API_BASE/api/v1/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"login\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASSWORD\"}")
ACCESS_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
if [ -z "$ACCESS_TOKEN" ]; then
  echo "ERROR: Login failed. Response: $LOGIN_RESP"
  exit 1
fi
echo "Login OK"

# 2. Upload template
echo "--- Upload template ---"
TEMPLATE_RESP=$(curl -s -X POST "$API_BASE/api/v1/admin/templates" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "name=stress-test-template" \
  -F "file=@$FIXTURES_DIR/template.png")
TEMPLATE_ID=$(echo "$TEMPLATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['template']['id'])" 2>/dev/null || echo "")
if [ -z "$TEMPLATE_ID" ]; then
  echo "ERROR: Template upload failed. Response: $TEMPLATE_RESP"
  exit 1
fi
echo "Template ID: $TEMPLATE_ID"

# 3. Save layout
echo "--- Save layout ---"
curl -s -X PUT "$API_BASE/api/v1/admin/templates/$TEMPLATE_ID/layout" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "page_width": 1920,
    "page_height": 1080,
    "name_x": 420,
    "name_y": 520,
    "name_max_width": 1080,
    "name_box_height": 81,
    "font_family": "Outfit",
    "font_size": 54,
    "font_color_hex": "#111827",
    "text_align": "center",
    "vertical_align": "center",
    "auto_shrink": true
  }' > /dev/null
echo "Layout saved"

# 4. Import participants
echo "--- Import participants (1000) ---"
IMPORT_RESP=$(curl -s -X POST "$API_BASE/api/v1/admin/participants/import" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@$FIXTURES_DIR/participants-1000.csv" \
  -F "event_code=$TEMPLATE_ID")
echo "Import: $(echo "$IMPORT_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'inserted={d[\"inserted\"]}, updated={d[\"updated\"]}, skipped={d[\"skipped\"]}, errors={len(d[\"errors\"])}')" 2>/dev/null || echo "unknown")"

# 5. Activate template
echo "--- Activate template ---"
curl -s -X POST "$API_BASE/api/v1/admin/templates/$TEMPLATE_ID/activate" \
  -H "Authorization: Bearer $ACCESS_TOKEN" > /dev/null
echo "Template activated"

# 6. Enable issuance
echo "--- Enable issuance ---"
curl -s -X PATCH "$API_BASE/api/v1/admin/issuance/status" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' > /dev/null
echo "Issuance enabled"

# 7. Pre-generate all certificates (enqueue bulk jobs and wait)
echo "--- Pre-generating certificates ---"
# The backend automatically enqueued jobs when we enabled issuance.
# We wait for queue to drain.
echo "Waiting for certificate queue to drain..."
for i in $(seq 1 60); do
  QUEUE_LEN=$(docker exec decentra-certificates-redis-1 redis-cli ZCARD certificates:queue 2>/dev/null || echo "0")
  if [ "$QUEUE_LEN" = "0" ] || [ "$QUEUE_LEN" = "(integer) 0" ]; then
    echo "Queue empty after $i seconds"
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ... still $QUEUE_LEN jobs in queue after ${i}s"
  fi
  sleep 1
done

echo "=== Seed complete ==="
echo "Template ID: $TEMPLATE_ID"
