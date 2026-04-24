#!/bin/bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8080}"
ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-strong-password}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/../fixtures"
TMP_DIR="${SCRIPT_DIR}/../.tmp"
PARTICIPANTS_FILE="$TMP_DIR/participants-1000-template.csv"

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

mkdir -p "$TMP_DIR"
python3 - "$FIXTURES_DIR/participants-1000.csv" "$PARTICIPANTS_FILE" "$TEMPLATE_ID" <<'PY'
import csv
import sys

source, target, template_id = sys.argv[1:]
with open(source, newline="") as src, open(target, "w", newline="") as dst:
    reader = csv.DictReader(src)
    fieldnames = list(reader.fieldnames or [])
    if "event_code" not in fieldnames:
        fieldnames.append("event_code")
    writer = csv.DictWriter(dst, fieldnames=fieldnames)
    writer.writeheader()
    for row in reader:
        row["event_code"] = template_id
        writer.writerow(row)
PY

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
  -F "file=@$PARTICIPANTS_FILE" \
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
# The backend automatically enqueues jobs when issuance is enabled or active template changes.
echo "Waiting for generation progress to reach completed=total..."
GENERATION_DONE=0
for i in $(seq 1 900); do
  PROGRESS_RESP=$(curl -s -X GET "$API_BASE/api/v1/admin/templates/$TEMPLATE_ID/generation-progress" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  STATUS=$(echo "$PROGRESS_RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("total={total} completed={completed} queued={queued} processing={processing} failed={failed}".format(**d))' 2>/dev/null || echo "unknown")
  TOTAL=$(echo "$PROGRESS_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("total", 0))' 2>/dev/null || echo "0")
  COMPLETED=$(echo "$PROGRESS_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("completed", 0))' 2>/dev/null || echo "0")
  FAILED=$(echo "$PROGRESS_RESP" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("failed", 0))' 2>/dev/null || echo "0")

  if [ "$TOTAL" != "0" ] && [ "$TOTAL" = "$COMPLETED" ]; then
    echo "Generation complete after $i seconds ($STATUS)"
    GENERATION_DONE=1
    break
  fi
  if [ "$FAILED" != "0" ]; then
    echo "ERROR: generation has failed issues ($STATUS)"
    exit 1
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ... $STATUS after ${i}s"
  fi
  sleep 1
done

if [ "$GENERATION_DONE" != "1" ]; then
  echo "ERROR: generation did not complete within 900 seconds"
  exit 1
fi

echo "=== Seed complete ==="
echo "Template ID: $TEMPLATE_ID"
