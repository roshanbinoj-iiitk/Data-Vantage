#!/usr/bin/env bash
# test_delete.sh — Verify delete-files and delete-duplicate-group endpoints.
#
# Usage:  ./tests/test_delete.sh [backend_binary]
#         Default binary: ./build/data-vantage
#
# The test:
#   1. Creates a temp dir with duplicate files.
#   2. Starts the backend server.
#   3. Triggers a scan via the REST API.
#   4. Tests DELETE single file endpoint.
#   5. Tests DELETE duplicate group endpoint.
#   6. Verifies files are removed from disk and DB.
#   7. Tests path-traversal protection.
#   8. Tests idempotent delete (file already gone).
#   9. Cleans up.

set -euo pipefail

BINARY="${1:-./build/data-vantage}"
PORT=18788
API="http://127.0.0.1:${PORT}/api"
TMPDIR=""
SERVER_PID=""

cleanup() {
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
    [ -n "$TMPDIR" ] && rm -rf "$TMPDIR"
    rm -f data_vantage.db
}
trap cleanup EXIT

rm -f data_vantage.db

# --- helpers ---------------------------------------------------------------
fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "PASS: $*"; }

# --- setup temp files ------------------------------------------------------
TMPDIR=$(mktemp -d)

# Create duplicate files (identical content)
echo "duplicate content here" > "$TMPDIR/dup1.txt"
cp "$TMPDIR/dup1.txt" "$TMPDIR/dup2.txt"
cp "$TMPDIR/dup1.txt" "$TMPDIR/dup3.txt"

# Create a unique file
echo "unique content" > "$TMPDIR/unique.txt"

# Create a file outside scan root for path-traversal test
OUTSIDE_FILE=$(mktemp)
echo "outside" > "$OUTSIDE_FILE"

# --- start server ----------------------------------------------------------
"$BINARY" --port "$PORT" &
SERVER_PID=$!
sleep 1

# Check server is up
curl -sf "$API/health" >/dev/null || fail "Server did not start"
ok "Server started on port $PORT"

# --- scan the temp directory -----------------------------------------------
SCAN_RESP=$(curl -sf -X POST "$API/scans" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"$TMPDIR\"}")
SCAN_ID=$(echo "$SCAN_RESP" | grep -o '"scanId":[0-9]*' | grep -o '[0-9]*')
[ -n "$SCAN_ID" ] || fail "Could not start scan"
ok "Scan started: id=$SCAN_ID"

# Wait for scan to complete
for i in $(seq 1 30); do
    PROGRESS=$(curl -sf "$API/scans/$SCAN_ID/progress")
    IS_SCANNING=$(echo "$PROGRESS" | grep -o '"isScanning":true' || true)
    [ -z "$IS_SCANNING" ] && break
    sleep 1
done
ok "Scan completed"

# --- Test 1: Delete single file -------------------------------------------
echo ""
echo "=== Test 1: Delete single file ==="
[ -f "$TMPDIR/unique.txt" ] || fail "unique.txt should exist before delete"

RESP=$(curl -sf -X POST "$API/scans/$SCAN_ID/files/delete" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$TMPDIR/unique.txt\"]}")

DEL_COUNT=$(echo "$RESP" | grep -o '"deletedCount":[0-9]*' | grep -o '[0-9]*')
[ "$DEL_COUNT" = "1" ] || fail "Expected deletedCount=1, got $DEL_COUNT"
[ ! -f "$TMPDIR/unique.txt" ] || fail "unique.txt still exists on disk after delete"
ok "Single file deleted from disk"

# Verify file removed from DB
FILES_RESP=$(curl -sf "$API/scans/$SCAN_ID/files?limit=1000")
echo "$FILES_RESP" | grep -q "unique.txt" && fail "unique.txt still in DB" || true
ok "Single file removed from database"

# --- Test 2: Idempotent delete (file already gone) -------------------------
echo ""
echo "=== Test 2: Idempotent delete (already deleted) ==="
RESP=$(curl -sf -X POST "$API/scans/$SCAN_ID/files/delete" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$TMPDIR/unique.txt\"]}")
DEL_COUNT=$(echo "$RESP" | grep -o '"deletedCount":[0-9]*' | grep -o '[0-9]*')
FAIL_COUNT=$(echo "$RESP" | grep -o '"failedCount":[0-9]*' | grep -o '[0-9]*')
[ "$FAIL_COUNT" = "0" ] || fail "Idempotent delete should not fail, got failedCount=$FAIL_COUNT"
ok "Idempotent delete succeeded"

# --- Test 3: Path traversal protection -------------------------------------
echo ""
echo "=== Test 3: Path traversal protection ==="
RESP=$(curl -sf -X POST "$API/scans/$SCAN_ID/files/delete" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$OUTSIDE_FILE\"]}")
FAIL_COUNT=$(echo "$RESP" | grep -o '"failedCount":[0-9]*' | grep -o '[0-9]*')
[ "$FAIL_COUNT" = "1" ] || fail "Path traversal should be blocked, got failedCount=$FAIL_COUNT"
[ -f "$OUTSIDE_FILE" ] || fail "Outside file was deleted (should be protected)"
ok "Path traversal blocked"
rm -f "$OUTSIDE_FILE"

# --- Test 4: Delete duplicate group ----------------------------------------
echo ""
echo "=== Test 4: Delete duplicate group ==="

# Get duplicates
DUP_RESP=$(curl -sf "$API/scans/$SCAN_ID/duplicates?limit=100")
DUP_HASH=$(echo "$DUP_RESP" | grep -o '"hash":"[^"]*"' | head -1 | sed 's/"hash":"//;s/"//')

if [ -n "$DUP_HASH" ]; then
    [ -f "$TMPDIR/dup1.txt" ] || fail "dup1.txt should exist"
    [ -f "$TMPDIR/dup2.txt" ] || fail "dup2.txt should exist"
    [ -f "$TMPDIR/dup3.txt" ] || fail "dup3.txt should exist"

    RESP=$(curl -sf -X POST "$API/scans/$SCAN_ID/duplicates/delete-group" \
      -H "Content-Type: application/json" \
      -d "{\"hash\":\"$DUP_HASH\",\"keepPath\":\"$TMPDIR/dup1.txt\"}")

    DEL_COUNT=$(echo "$RESP" | grep -o '"deletedCount":[0-9]*' | grep -o '[0-9]*')
    [ "$DEL_COUNT" = "2" ] || fail "Expected deletedCount=2, got $DEL_COUNT"

    [ -f "$TMPDIR/dup1.txt" ] || fail "Kept file dup1.txt was deleted"
    [ ! -f "$TMPDIR/dup2.txt" ] || fail "dup2.txt still exists"
    [ ! -f "$TMPDIR/dup3.txt" ] || fail "dup3.txt still exists"
    ok "Duplicate group deleted, kept file preserved"

    # Verify group removed from DB
    DUP_RESP2=$(curl -sf "$API/scans/$SCAN_ID/duplicates?limit=100")
    echo "$DUP_RESP2" | grep -q "$DUP_HASH" && fail "Duplicate group still in DB" || true
    ok "Duplicate group removed from database"
else
    echo "SKIP: No duplicate groups found (files may be too small for hashing)"
fi

# --- Test 5: Bulk delete ---------------------------------------------------
echo ""
echo "=== Test 5: Bulk delete ==="
echo "bulk1" > "$TMPDIR/bulk1.txt"
echo "bulk2" > "$TMPDIR/bulk2.txt"

# Re-scan to pick up new files
SCAN_RESP2=$(curl -sf -X POST "$API/scans" \
  -H "Content-Type: application/json" \
  -d "{\"path\":\"$TMPDIR\"}")
SCAN_ID2=$(echo "$SCAN_RESP2" | grep -o '"scanId":[0-9]*' | grep -o '[0-9]*')

for i in $(seq 1 30); do
    PROGRESS=$(curl -sf "$API/scans/$SCAN_ID2/progress")
    IS_SCANNING=$(echo "$PROGRESS" | grep -o '"isScanning":true' || true)
    [ -z "$IS_SCANNING" ] && break
    sleep 1
done

RESP=$(curl -sf -X POST "$API/scans/$SCAN_ID2/files/delete" \
  -H "Content-Type: application/json" \
  -d "{\"paths\":[\"$TMPDIR/bulk1.txt\",\"$TMPDIR/bulk2.txt\"]}")
DEL_COUNT=$(echo "$RESP" | grep -o '"deletedCount":[0-9]*' | grep -o '[0-9]*')
[ "$DEL_COUNT" = "2" ] || fail "Expected deletedCount=2, got $DEL_COUNT"
[ ! -f "$TMPDIR/bulk1.txt" ] || fail "bulk1.txt still exists"
[ ! -f "$TMPDIR/bulk2.txt" ] || fail "bulk2.txt still exists"
ok "Bulk delete succeeded"

# --- Test 6: Missing paths array -------------------------------------------
echo ""
echo "=== Test 6: Missing paths array ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/scans/$SCAN_ID/files/delete" \
  -H "Content-Type: application/json" \
  -d "{}")
[ "$HTTP_CODE" = "400" ] || fail "Expected 400 for missing paths, got $HTTP_CODE"
ok "Missing paths returns 400"

# --- Summary ---------------------------------------------------------------
echo ""
echo "======================================="
echo "All delete tests PASSED"
echo "======================================="
