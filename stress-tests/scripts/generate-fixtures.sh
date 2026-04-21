#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="${SCRIPT_DIR}/../fixtures"
mkdir -p "$FIXTURES_DIR"

echo "=== Generating template.png ==="
magick -size 1920x1080 xc:"#f8fafc" \
    -fill "#1e293b" -pointsize 48 -gravity center \
    -annotate +0+0 "Certificate of Participation\n\n{{participant.full_name}}" \
    -fill "#64748b" -pointsize 24 -gravity south \
    -annotate +0+80 "{{issue.certificate_id}}" \
    "$FIXTURES_DIR/template.png"

echo "=== Generating participant CSV files ==="

generate_csv() {
    local count=$1
    local file="$FIXTURES_DIR/participants-${count}.csv"
    echo "email,full_name,event_code,category" > "$file"
    for i in $(seq 1 "$count"); do
        printf "participant%d@example.com,Participant Number %d,main,General\n" "$i" "$i" >> "$file"
    done
    echo "Created $file with $count rows"
}

generate_csv 1000
generate_csv 5000
generate_csv 10000

echo "=== Done ==="
ls -lh "$FIXTURES_DIR"
