#!/usr/bin/env bash
# End-to-end test of the HTTP API against a real server.
#
# Usage: ./tests/test_api.sh [path/to/data-vantage]
#
# Everything (database, token, trash) lives in a temporary directory, so the
# test never touches your real data. Needs curl and python3.

set -euo pipefail

BINARY="$(realpath "${1:-./build/data-vantage}")"
PORT="${PORT:-18788}"
API="http://127.0.0.1:${PORT}/api"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
    [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null && wait "$SERVER_PID" 2>/dev/null || true
    rm -rf "$WORK"
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; [ -f "$WORK/server.log" ] && tail -20 "$WORK/server.log" >&2; exit 1; }
ok() { echo "PASS: $*"; }

# json EXPR: evaluates a Python expression on the JSON from stdin as `d`.
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

export XDG_DATA_HOME="$WORK/share" XDG_RUNTIME_DIR="$WORK/run"
mkdir -p "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

# ---- Test tree ----------------------------------------------------------------
DATA="$WORK/data"
mkdir -p "$DATA/a" "$DATA/b" "$DATA/node_modules/pkg" "$DATA/many"
head -c 200000 /dev/urandom > "$DATA/a/dup1.bin"
cp "$DATA/a/dup1.bin" "$DATA/b/dup2.bin"
cp "$DATA/a/dup1.bin" "$DATA/b/dup3 with \"quotes\" ].bin"
echo "unique" > "$DATA/a/unique.txt"
echo "x" > "$DATA/node_modules/pkg/index.js"
echo "same size A" > "$DATA/a/s1"
echo "same size B" > "$DATA/a/s2"
for i in $(seq 1 250); do echo "$i" > "$DATA/many/f$i.txt"; done

# ---- Server --------------------------------------------------------------------
"$BINARY" --port "$PORT" --web-root "$WORK/none" > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 50); do
    curl -sf "$API/health" > /dev/null 2>&1 && break
    sleep 0.1
done
curl -sf "$API/health" > /dev/null || fail "server did not start"
TOKEN="$(cat "$XDG_RUNTIME_DIR/data-vantage/token")"
[ -n "$TOKEN" ] || fail "no token file"

H=(-H "X-Data-Vantage-Token: $TOKEN" -H "Content-Type: application/json")
get() { curl -s "${H[@]}" "$API$1"; }
post() { curl -s "${H[@]}" -X POST "$API$1" -d "${2:-{\}}"; }
status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

# ---- Request safety --------------------------------------------------------------
[ "$(status "$API/scans")" = 401 ] || fail "request without token was accepted"
[ "$(status -H "X-Data-Vantage-Token: wrong" "$API/scans")" = 401 ] || fail "wrong token was accepted"
[ "$(status -H "X-Data-Vantage-Token: $TOKEN" -H "Content-Type: text/plain" -X POST "$API/scans" -d '{"path":"/"}')" = 415 ] \
    || fail "text/plain POST was accepted"
[ "$(status "${H[@]}" -H "Host: evil.example:$PORT" "$API/scans")" = 403 ] || fail "foreign Host header was accepted"
[ "$(curl -s -D - -o /dev/null "${H[@]}" "$API/scans" | grep -ci '^access-control-allow-origin')" = 0 ] \
    || fail "CORS header still present"
ok "token, Content-Type, Host and CORS checks"

[ "$(status "${H[@]}" -X POST "$API/scans" -d 'not json')" = 400 ] || fail "bad JSON not rejected"
[ "$(status "${H[@]}" -X POST "$API/scans" -d '{"path":"relative"}')" = 400 ] || fail "relative path accepted"
ok "invalid input gets 400"

# ---- Scan -----------------------------------------------------------------------
SCAN=$(post /scans "{\"path\":\"$DATA\"}" | json 'd["scanId"]')
for _ in $(seq 1 100); do
    [ "$(get "/scans/$SCAN/progress" | json 'd["isScanning"]')" = False ] && break
    sleep 0.1
done
SCAN_JSON="$(get "/scans/$SCAN")"
[ "$(echo "$SCAN_JSON" | json 'd["status"]')" = completed ] || fail "scan did not complete: $SCAN_JSON"
[ "$(echo "$SCAN_JSON" | json 'd["duplicateGroups"]')" = 1 ] || fail "expected 1 duplicate group (same-size files differ): $SCAN_JSON"
[ "$(echo "$SCAN_JSON" | json 'd["duplicateFiles"]')" = 3 ] || fail "expected 3 duplicate files"
ok "scan completed with exactly one duplicate group"

[ "$(status "${H[@]}" "$API/scans/$SCAN/files?limit=abc")" = 400 ] || fail "bad limit not rejected with 400"
[ "$(status "${H[@]}" "$API/scans/$SCAN/files?parentId=-5")" = 400 ] || fail "negative parentId not rejected"
ok "bad paging parameters get 400"

ROOT_ITEMS="$(get "/scans/$SCAN/files?parentId=0")"
echo "$ROOT_ITEMS" | json '[f["name"] for f in d["items"]]' | grep -q node_modules && fail "node_modules not excluded"
ok "default exclusions applied during the walk"

MANY_ID=$(echo "$ROOT_ITEMS" | json '[f["id"] for f in d["items"] if f["name"]=="many"][0]')
[ "$(get "/scans/$SCAN/files?parentId=$MANY_ID&limit=100" | json 'd["total"]')" = 250 ] || fail "folder total wrong"
[ "$(get "/scans/$SCAN/files?parentId=$MANY_ID&limit=100&offset=200" | json 'len(d["items"])')" = 50 ] || fail "paging wrong"
ok "large folders are paged with a correct total"

[ "$(get "/scans/$SCAN/search?q=%25" | json 'len(d)')" = 0 ] || fail "% acted as a wildcard"
[ "$(get "/scans/$SCAN/search?q=quotes" | json 'd[0]["name"]')" = 'dup3 with "quotes" ].bin' ] || fail "search/JSON mangled a name"
ok "search escapes wildcards and names round-trip through JSON"

# ---- Keep one copy ------------------------------------------------------------------
DUPS="$(get "/scans/$SCAN/duplicates")"
GROUP=$(echo "$DUPS" | json 'd["groups"][0]["groupId"]')
KEEP=$(echo "$DUPS" | json '[f["id"] for f in d["groups"][0]["files"] if f["name"]=="dup1.bin"][0]')
UNIQUE_ID=$(get "/scans/$SCAN/search?q=unique" | json 'd[0]["id"]')

[ "$(status "${H[@]}" -X POST "$API/scans/$SCAN/duplicates/$GROUP/keep" -d "{\"keepId\":$UNIQUE_ID}")" = 400 ] \
    || fail "keepId outside the group was accepted"
[ -f "$DATA/b/dup2.bin" ] || fail "a file was deleted after a rejected keep"
ok "keep refuses an id that is not in the group (nothing deleted)"

# Change one copy after the scan: it must not be deleted.
echo "changed" >> "$DATA/b/dup2.bin"
RES="$(post "/scans/$SCAN/duplicates/$GROUP/keep" "{\"keepId\":$KEEP}")"
[ "$(echo "$RES" | json 'd["deletedCount"]')" = 1 ] || fail "expected 1 file trashed: $RES"
[ "$(echo "$RES" | json 'd["failedCount"]')" = 1 ] || fail "changed file was not refused: $RES"
[ -f "$DATA/a/dup1.bin" ] || fail "kept file is gone"
[ -f "$DATA/b/dup2.bin" ] || fail "changed file was deleted"
[ ! -e "$DATA/b/dup3 with \"quotes\" ].bin" ] || fail "duplicate was not removed"
[ -f "$XDG_DATA_HOME/Trash/files/dup3 with \"quotes\" ].bin" ] || fail "file is not in the trash"
grep -q '^Path=' "$XDG_DATA_HOME/Trash/info/dup3 with \"quotes\" ].bin.trashinfo" || fail "no .trashinfo"
ok "keep trashes identical copies, refuses changed ones, writes .trashinfo"

SCAN_JSON="$(get "/scans/$SCAN")"
[ "$(echo "$SCAN_JSON" | json 'd["totalFiles"]')" = 255 ] || fail "totals not updated: $SCAN_JSON"
B_SIZE=$(get "/scans/$SCAN/files?parentId=0" | json '[f["sizeOnDisk"] for f in d["items"] if f["name"]=="b"][0]')
DU_B=$(( $(stat -c %b "$DATA/b/dup2.bin") * 512 ))
[ "$B_SIZE" = "$DU_B" ] || fail "folder size not updated after delete ($B_SIZE vs $DU_B)"
ok "folder sizes and scan totals follow deletions"

# ---- Single delete ----------------------------------------------------------------
RES="$(post "/scans/$SCAN/files/delete" "{\"ids\":[$UNIQUE_ID, 999999]}")"
[ "$(echo "$RES" | json 'd["deletedCount"]')" = 1 ] || fail "single delete failed: $RES"
[ "$(echo "$RES" | json 'd["failedCount"]')" = 1 ] || fail "unknown id not reported: $RES"
[ -f "$XDG_DATA_HOME/Trash/files/unique.txt" ] || fail "unique.txt not in trash"
ok "files/delete trashes by id and reports unknown ids"

# ---- Stop and delete a running scan --------------------------------------------------
BIG="$WORK/big"
mkdir -p "$BIG"
for d in $(seq 1 40); do mkdir -p "$BIG/$d"; for f in $(seq 1 200); do : > "$BIG/$d/$f"; done; done
SCAN2=$(post /scans "{\"path\":\"$BIG\"}" | json 'd["scanId"]')
post "/scans/$SCAN2/stop" > /dev/null || true
for _ in $(seq 1 100); do
    [ "$(get "/scans/$SCAN2/progress" | json 'd["isScanning"]')" = False ] && break
    sleep 0.05
done
ST="$(get "/scans/$SCAN2" | json 'd["status"]')"
case "$ST" in cancelled|completed) ;; *) fail "stopped scan has status $ST" ;; esac
[ "$ST" = completed ] || [ "$(status "${H[@]}" "$API/scans/$SCAN2/files")" = 409 ] || fail "cancelled scan is browsable"
ok "stopping a scan does not save it as completed (status: $ST)"

SCAN3=$(post /scans "{\"path\":\"$BIG\"}" | json 'd["scanId"]')
[ "$(status "${H[@]}" -X DELETE "$API/scans/$SCAN3")" = 200 ] || fail "delete running scan failed"
sleep 1
[ "$(status "${H[@]}" "$API/scans/$SCAN3")" = 404 ] || fail "running scan came back after delete"
ok "deleting a running scan leaves nothing behind"

[ -f "$XDG_DATA_HOME/data-vantage/data_vantage.db" ] || fail "database not in XDG data dir"
ok "database stored under \$XDG_DATA_HOME/data-vantage"

kill -TERM "$SERVER_PID"
wait "$SERVER_PID" || true
SERVER_PID=""
grep -qi "fatal\|terminate called" "$WORK/server.log" && fail "unclean shutdown"
ok "clean shutdown"
echo "All API tests passed."
