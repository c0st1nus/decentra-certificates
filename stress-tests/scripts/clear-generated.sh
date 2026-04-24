#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Clearing generated certificates for queued test ==="

cargo run --release -p stress-tests -- reset-generated

echo "=== Ready for queued certificate test ==="
