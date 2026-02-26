#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

SESSION_PATH=".litrev/session.json"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      [[ $# -ge 2 ]] || { echo "Missing value for --session" >&2; exit 1; }
      SESSION_PATH="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/dev_bootstrap.sh [--session .litrev/session.json]

Creates a fresh room + 4 claimed agents, then writes a local session file:
  { base, room_id, scout_key, summarizer_key, critic_key, builder_key, third_key, third_mode }
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE="${BASE:-http://127.0.0.1:3000}"
THIRD_MODE="${THIRD_MODE:-builder}"
OWNER_PREFIX="${OWNER_PREFIX:-dev-bootstrap}"
TS="$(date +%s)"

if ! curl -fsS "$BASE/api/healthz" >/dev/null; then
  echo "BASE is not reachable (or /api/healthz missing): $BASE" >&2
  exit 1
fi

mkdir -p "$(dirname "$SESSION_PATH")"

register_agent() {
  local name="$1"
  local description="$2"
  local owner="$3"

  local reg
  reg="$(curl -fsS -X POST "$BASE/api/agents/register" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg name "$name" --arg description "$description" '{name:$name,description:$description}')")"

  local api_key claim_url token
  api_key="$(printf '%s\n' "$reg" | jq -r '.data.api_key // empty')"
  claim_url="$(printf '%s\n' "$reg" | jq -r '.data.claim_url // empty')"
  if [[ -z "$api_key" || -z "$claim_url" ]]; then
    echo "Agent registration failed for $name" >&2
    printf '%s\n' "$reg" | jq . >&2 || printf '%s\n' "$reg" >&2
    exit 1
  fi

  token="$(printf '%s\n' "$claim_url" | awk -F/ '{print $NF}')"
  if [[ -z "$token" ]]; then
    echo "Could not parse claim token for $name" >&2
    exit 1
  fi

  curl -fsS -X POST "$BASE/api/agents/claim/$token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg owner "$owner" '{owner:$owner}')" >/dev/null

  printf '%s' "$api_key"
}

echo "[1/6] Register + claim scout runner"
SCOUT_KEY="$(register_agent "runner-scout-$TS" "Auto scout runner" "$OWNER_PREFIX-scout")"

echo "[2/6] Register + claim summarizer runner"
SUMMARIZER_KEY="$(register_agent "runner-summarizer-$TS" "Auto summarizer runner" "$OWNER_PREFIX-summarizer")"

echo "[3/6] Register + claim critic runner"
CRITIC_KEY="$(register_agent "runner-critic-$TS" "Auto critique runner" "$OWNER_PREFIX-critic")"

echo "[4/6] Register + claim builder runner"
BUILDER_KEY="$(register_agent "runner-builder-$TS" "Auto builder runner" "$OWNER_PREFIX-builder")"
THIRD_KEY="$BUILDER_KEY"

echo "[5/6] Create debate room"
ROOM_JSON="$(curl -fsS -X POST "$BASE/api/rooms" \
  -H "Authorization: Bearer $SUMMARIZER_KEY" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg topic "Live Debate Room ($TS)" '{topic:$topic}')")"
ROOM_ID="$(printf '%s\n' "$ROOM_JSON" | jq -r '.data.room_id // empty')"
if [[ -z "$ROOM_ID" ]]; then
  echo "Room creation failed" >&2
  printf '%s\n' "$ROOM_JSON" | jq . >&2 || printf '%s\n' "$ROOM_JSON" >&2
  exit 1
fi

echo "[6/6] Write session file: $SESSION_PATH"
jq -n \
  --arg base "$BASE" \
  --arg room_id "$ROOM_ID" \
  --arg scout_key "$SCOUT_KEY" \
  --arg summarizer_key "$SUMMARIZER_KEY" \
  --arg critic_key "$CRITIC_KEY" \
  --arg builder_key "$BUILDER_KEY" \
  --arg third_key "$THIRD_KEY" \
  --arg third_mode "$THIRD_MODE" \
  '{base:$base,room_id:$room_id,scout_key:$scout_key,summarizer_key:$summarizer_key,critic_key:$critic_key,builder_key:$builder_key,third_key:$third_key,third_mode:$third_mode}' \
  > "$SESSION_PATH"

echo
echo "Bootstrap complete."
echo "ROOM_ID=$ROOM_ID"
echo "UI: $BASE/"
echo "Thread API: $BASE/api/rooms/$ROOM_ID/messages"
echo "Session: $SESSION_PATH"
echo
echo "Next commands:"
echo "  ./scripts/run_multi_agents.sh --session $SESSION_PATH"
echo "  ./scripts/post_seed_question.sh --session $SESSION_PATH \"My question here\""
