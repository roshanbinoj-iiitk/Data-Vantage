#!/usr/bin/env bash
# test_disk_size.sh — Verify that Data-Vantage reports size-on-disk
# (st_blocks * 512) rather than apparent file size.
#
# Usage:  ./tests/test_disk_size.sh [backend_binary]
#         Default binary: ./build/data-vantage
#
# The test:
#   1. Creates a temporary directory with known files.
#   2. Starts the backend server.
#   3. Triggers a scan via the REST API.
#   4. Compares the reported totalSize against `du -B1 --summarize`.
#   5. Cleans up.

set -euo pipefail

BINARY="${1:-./build/data-vantage}"
PORT=18787
API="http://127.0.0.1:${PORT}/api"
TMPDIR=""
SERVER_PID=""

cleanup() {
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
    [ -n "$TMPDIR" ] && rm -rf "$TMPDIR"
    rm -f data_vantage.db  # server creates this in cwd
}
trap cleanup EXIT

# Remove any leftover DB so file primary-key IDs don't collide
rm -f data_vantage.db

# --- helpers ---------------------------------------------------------------
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "PASS: $*"; }

# --- setup temp files ------------------------------------------------------
TMPDIR=$(mktemp -d)
dd if=/dev/urandom of="$TMPDIR/file_a" bs=1 count=1000 2>/dev/null
dd if=/dev/urandom of="$TMPDIR/file_b" bs=1 count=5000 2>/dev/null
mkdir "$TMPDIR/subdir"
dd if=/dev/urandom of="$TMPDIR/subdir/file_c" bs=1 count=3000 2>/dev/null

# Expected disk consumption via du (in bytes, 512-byte block granularity)
if du -B1 -s "$TMPDIR" &>/dev/null; then
    EXPECTED_DU=$(du -B1 -s "$TMPDIR" | awk '{print $1}')
else
    # Fallback for BSD du (macOS)
    EXPECTED_DU=$(du -s "$TMPDIR" | awk '{print $1}')
fi
# Subtract the directory entries' own disk usage — Data-Vantage only sums
# regular files, not directory metadata.  Compute file-only total via stat.
EXPECTED_FILE_BYTES=0
while IFS= read -r -d '' f; do
    if stat --version &>/dev/null; then
        blocks=$(stat -c '%b' "$f")
    else
        # BSD stat (macOS)
        blocks=$(stat -f '%b' "$f")
    fi
    EXPECTED_FILE_BYTES=$(( EXPECTED_FILE_BYTES + blocks * 512 ))
done < <(find "$TMPDIR" -type f -print0)

echo "Temp dir:  $TMPDIR"
echo "Expected file disk bytes: $EXPECTED_FILE_BYTES"
echo "du total:                 $EXPECTED_DU"

# --- start server ----------------------------------------------------------
"$BINARY" --port "$PORT" &
SERVER_PID=$!
# Wait for it to be ready
for i in $(seq 1 30); do
    if curl -s "$API/health" >/dev/null 2>&1; then break; fi
    sleep 0.2
done
curl -s "$API/health" >/dev/null || fail "Server did not start"

# --- trigger scan ----------------------------------------------------------
SCAN_RESP=$(curl -s -X POST "$API/scans" \
    -H 'Content-Type: application/json' \
    -d "{\"path\": \"$TMPDIR\"}")
SCAN_ID=$(echo "$SCAN_RESP" | grep -o '"scanId":[0-9]*' | cut -d: -f2)
[ -n "$SCAN_ID" ] || fail "Could not start scan: $SCAN_RESP"

echo "Scan ID: $SCAN_ID"

# --- wait for completion ---------------------------------------------------
for i in $(seq 1 60); do
    PROGRESS=$(curl -s "$API/scans/$SCAN_ID/progress")
    IS_SCANNING=$(echo "$PROGRESS" | grep -o '"isScanning":[a-z]*' | cut -d: -f2)
    [ "$IS_SCANNING" = "false" ] && break
    sleep 0.5
done
[ "$IS_SCANNING" = "false" ] || fail "Scan did not complete in time"

# --- check totalSize -------------------------------------------------------
RESULT=$(curl -s "$API/scans/$SCAN_ID")
TOTAL_SIZE=$(echo "$RESULT" | grep -o '"totalSize":[0-9]*' | cut -d: -f2)

echo "API totalSize:  $TOTAL_SIZE"

# Allow a small tolerance (directory metadata may differ slightly)
DIFF=$(( TOTAL_SIZE - EXPECTED_FILE_BYTES ))
ABS_DIFF=${DIFF#-}
if [ "$ABS_DIFF" -le 4096 ]; then
    ok "totalSize ($TOTAL_SIZE) matches expected file disk bytes ($EXPECTED_FILE_BYTES) within 4096-byte tolerance"
else
    fail "totalSize ($TOTAL_SIZE) differs from expected ($EXPECTED_FILE_BYTES) by $ABS_DIFF bytes"
fi

# --- check individual file sizeOnDisk field --------------------------------
FILES_JSON=$(curl -s "$API/scans/$SCAN_ID/files?parentId=0&limit=100")
# Verify JSON uses sizeOnDisk key
if echo "$FILES_JSON" | grep -q '"sizeOnDisk"'; then
    ok "API returns 'sizeOnDisk' field in file entries"
else
    fail "API does not return 'sizeOnDisk' field; got: $(echo "$FILES_JSON" | head -c 200)"
fi

# Check one specific file
if stat --version &>/dev/null; then
    STAT_BLOCKS_A=$(stat -c '%b' "$TMPDIR/file_a")
else
    STAT_BLOCKS_A=$(stat -f '%b' "$TMPDIR/file_a")
fi
EXPECTED_A=$(( STAT_BLOCKS_A * 512 ))
# Extract sizeOnDisk for file_a from JSON (simple grep)
SIZE_A=$(echo "$FILES_JSON" | grep -o '"name":"file_a"[^}]*"sizeOnDisk":[0-9]*' | grep -o '"sizeOnDisk":[0-9]*' | cut -d: -f2)
if [ -z "$SIZE_A" ]; then
    # file_a might be in a sub-query (parentId=0 only shows direct children of root)
    # Try fetching all files
    ALL_FILES=$(curl -s "$API/scans/$SCAN_ID/files?limit=1000")
    SIZE_A=$(echo "$ALL_FILES" | grep -o '"name":"file_a"[^}]*"sizeOnDisk":[0-9]*' | grep -o '"sizeOnDisk":[0-9]*' | cut -d: -f2)
fi

if [ -n "$SIZE_A" ] && [ "$SIZE_A" -eq "$EXPECTED_A" ]; then
    ok "file_a sizeOnDisk ($SIZE_A) matches stat st_blocks*512 ($EXPECTED_A)"
elif [ -n "$SIZE_A" ]; then
    fail "file_a sizeOnDisk ($SIZE_A) does not match stat st_blocks*512 ($EXPECTED_A)"
else
    echo "WARN: Could not extract sizeOnDisk for file_a from API response"
fi

echo ""
echo "All tests passed."
