#!/usr/bin/env bash
# test_repeated_scans.sh - Verify repeated scan/progress/stats cycles.

set -euo pipefail

BINARY="${1:-./build/data-vantage}"
PORT=18789
API="http://127.0.0.1:${PORT}/api"
TMP_BASE="${TMPDIR:-/tmp}"
SCAN_ROOT=""
SERVER_PID=""

cleanup() {
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
    [ -n "$SCAN_ROOT" ] && rm -rf "$SCAN_ROOT"
    rm -f data_vantage.db data_vantage.db-wal data_vantage.db-shm
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "PASS: $*"; }

rm -f data_vantage.db data_vantage.db-wal data_vantage.db-shm

SCAN_ROOT=$(mktemp -d "$TMP_BASE/data-vantage-repeat.XXXXXX")
mkdir "$SCAN_ROOT/docs" "$SCAN_ROOT/media"
printf "alpha duplicate\n" > "$SCAN_ROOT/docs/a.txt"
cp "$SCAN_ROOT/docs/a.txt" "$SCAN_ROOT/docs/a-copy.txt"
printf "beta\n" > "$SCAN_ROOT/docs/b.md"
dd if=/dev/urandom of="$SCAN_ROOT/media/blob.bin" bs=1024 count=16 2>/dev/null

"$BINARY" --port "$PORT" &
SERVER_PID=$!

for _ in $(seq 1 30); do
    if curl -s "$API/health" >/dev/null 2>&1; then break; fi
    sleep 0.2
done
curl -s "$API/health" >/dev/null || fail "Server did not start"
ok "Server started on port $PORT"

for run in 1 2 3; do
    SCAN_RESP=$(curl -sf -X POST "$API/scans" \
        -H "Content-Type: application/json" \
        -d "{\"path\":\"$SCAN_ROOT\"}")
    SCAN_ID=$(echo "$SCAN_RESP" | grep -o '"scanId":[0-9]*' | grep -o '[0-9]*')
    [ -n "$SCAN_ID" ] || fail "Run $run did not return a scan id: $SCAN_RESP"

    for _ in $(seq 1 60); do
        PROGRESS=$(curl -sf "$API/scans/$SCAN_ID/progress")
        echo "$PROGRESS" | grep -q '"status":"failed"' && fail "Run $run failed: $PROGRESS"
        IS_SCANNING=$(echo "$PROGRESS" | grep -o '"isScanning":true' || true)
        [ -z "$IS_SCANNING" ] && break
        sleep 0.25
    done
    [ -z "$IS_SCANNING" ] || fail "Run $run did not complete"

    RESULT=$(curl -sf "$API/scans/$SCAN_ID")
    echo "$RESULT" | grep -q '"status":"completed"' || fail "Run $run was not completed: $RESULT"

    STATS=$(curl -sf "$API/scans/$SCAN_ID/stats")
    echo "$STATS" | grep -q '"totalSize":[1-9]' || fail "Run $run stats were empty: $STATS"

    ok "Run $run completed with stats"
done

COUNT=$(curl -sf "$API/scans" | grep -o '"scanId":[0-9]*' | wc -l | tr -d ' ')
[ "$COUNT" -ge 3 ] || fail "Expected at least 3 saved scans, got $COUNT"

echo ""
echo "Repeated scan test PASSED"
