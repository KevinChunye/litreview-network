#!/usr/bin/env bash
# demo_start.sh — one-command local demo setup
# Usage: ./scripts/demo_start.sh
# Starts server + 6 runners, creates a room, posts a seed question, opens browser.
set -euo pipefail

NODE=/opt/homebrew/bin/node
BASE="${BASE:-http://127.0.0.1:3000}"
TOPIC="${TOPIC:-What are the key challenges and recent advances in retrieval-augmented generation (RAG) for scientific literature?}"

# ─── 1. Start server if not already running ───────────────────────────────────
if ! curl -sf "$BASE/api/healthz" >/dev/null 2>&1; then
  echo "[demo] Starting server on port 3000…"
  node server.js &
  SERVER_PID=$!
  echo "[demo] Server PID: $SERVER_PID"
  for i in $(seq 1 15); do
    sleep 1
    curl -sf "$BASE/api/healthz" >/dev/null 2>&1 && break
    echo "[demo] Waiting for server ($i/15)…"
  done
else
  echo "[demo] Server already running at $BASE"
fi

# ─── 2. Start 6 runners ───────────────────────────────────────────────────────
echo "[demo] Starting runners…"
BASE=$BASE DEMO_MODE=1 POLL_SECONDS=3 MIN_SECONDS_BETWEEN_POSTS=8 \
  OPENROUTER_API_KEY="" \
  $NODE scripts/start_runners.js > /tmp/litreview_runners.log 2>&1 &
RUNNERS_PID=$!
echo "[demo] Runners PID: $RUNNERS_PID (log: /tmp/litreview_runners.log)"
sleep 8   # wait for all 6 to register

# ─── 3. Register host agent + create room ─────────────────────────────────────
echo "[demo] Registering host agent…"
REG=$(curl -sf -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-host","description":"Demo coordinator"}')
HOST_KEY=$(echo "$REG" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data.api_key))")
CLAIM_TOK=$(echo "$REG" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data.claim_url.split('/').pop()))")
curl -sf -X POST "$BASE/api/agents/claim/$CLAIM_TOK" \
  -H "Authorization: Bearer $HOST_KEY" >/dev/null

echo "[demo] Creating room…"
ROOM=$(curl -sf -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $HOST_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"$TOPIC\"}")
ROOM_ID=$(echo "$ROOM" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data.room_id))")
echo "[demo] Room: $ROOM_ID"

# ─── 4. Attach online runners ─────────────────────────────────────────────────
echo "[demo] Attaching runners…"
ATTACH=$(curl -sf -X POST "$BASE/api/rooms/$ROOM_ID/attach_runners" \
  -H "Authorization: Bearer $HOST_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')
COUNT=$(echo "$ATTACH" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(String(JSON.parse(d).data?.attached_count||0)))")
echo "[demo] Attached $COUNT runners"

# ─── 5. Post seed question ────────────────────────────────────────────────────
echo "[demo] Posting seed question…"
# Need a second agent to post (avoid double-post from host)
REG2=$(curl -sf -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"demo-researcher","description":"Human researcher"}')
KEY2=$(echo "$REG2" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data.api_key))")
TOK2=$(echo "$REG2" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data.claim_url.split('/').pop()))")
curl -sf -X POST "$BASE/api/agents/claim/$TOK2" -H "Authorization: Bearer $KEY2" >/dev/null

SEED=$(printf '{"role":"questions","content":"Agents, please begin your collaborative analysis. %s"}' "$TOPIC")
MSG=$(curl -sf -X POST "$BASE/api/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $HOST_KEY" \
  -H "Content-Type: application/json" \
  -d "$SEED")
MSG_ID=$(echo "$MSG" | $NODE -e "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).data?.message?.id||'?'))")
echo "[demo] Seed message: $MSG_ID"

# Post trigger from researcher
TRIGGER='{"role":"questions","content":"Please start your analysis now."}'
curl -sf -X POST "$BASE/api/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $KEY2" \
  -H "Content-Type: application/json" \
  -d "$TRIGGER" >/dev/null

# ─── 6. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  LitReview Network Demo Running                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  UI:      $BASE"
echo "║  Room:    $BASE/#rooms/$ROOM_ID"
echo "║  Runners: $COUNT online (log: /tmp/litreview_runners.log)"
echo "║  API key: $HOST_KEY"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "[demo] Agents will start posting in ~10s. Refresh the UI to see activity."

# Open browser if on macOS
if command -v open >/dev/null 2>&1; then
  sleep 2
  open "$BASE/#rooms/$ROOM_ID"
fi
