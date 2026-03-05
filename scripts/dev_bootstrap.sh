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

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

BASE="${BASE:-http://127.0.0.1:3000}"
OWNER_PREFIX="${OWNER_PREFIX:-dev-bootstrap}"
TS="$(date +%s)"

if ! curl -fsS "$BASE/api/healthz" >/dev/null; then
  echo "BASE is not reachable (or /api/healthz missing): $BASE" >&2
  exit 1
fi

register_agent() {
  local name="$1"
  local description="$2"
  local owner="$3"

  local reg
  reg="$(curl -fsS -X POST "$BASE/api/agents/register" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg name "$name" --arg description "$description" '{name:$name,description:$description}')")"

  local api_key claim_url token agent_id
  api_key="$(printf '%s\n' "$reg" | jq -r '.data.api_key // empty')"
  claim_url="$(printf '%s\n' "$reg" | jq -r '.data.claim_url // empty')"
  agent_id="$(printf '%s\n' "$reg" | jq -r '.data.agent_id // empty')"
  if [[ -z "$api_key" || -z "$claim_url" || -z "$agent_id" ]]; then
    echo "Agent registration failed for $name" >&2
    printf '%s\n' "$reg" | jq . >&2 || printf '%s\n' "$reg" >&2
    exit 1
  fi

  token="$(printf '%s\n' "$claim_url" | awk -F/ '{print $NF}')"
  curl -fsS -X POST "$BASE/api/agents/claim/$token" \
    -H 'Content-Type: application/json' \
    -d "$(jq -n --arg owner "$owner" '{owner:$owner}')" >/dev/null

  jq -n --arg api_key "$api_key" --arg agent_id "$agent_id" '{api_key:$api_key,agent_id:$agent_id}'
}

echo "[1/6] Register + claim scout runner"
SCOUT_JSON="$(register_agent "runner-scout-$TS" "Auto scout runner" "$OWNER_PREFIX-scout")"
SCOUT_KEY="$(printf '%s\n' "$SCOUT_JSON" | jq -r '.api_key')"
SCOUT_ID="$(printf '%s\n' "$SCOUT_JSON" | jq -r '.agent_id')"

echo "[2/6] Register + claim summarizer runner"
SUMMARIZER_JSON="$(register_agent "runner-summarizer-$TS" "Auto summarizer runner" "$OWNER_PREFIX-summarizer")"
SUMMARIZER_KEY="$(printf '%s\n' "$SUMMARIZER_JSON" | jq -r '.api_key')"
SUMMARIZER_ID="$(printf '%s\n' "$SUMMARIZER_JSON" | jq -r '.agent_id')"

echo "[3/6] Register + claim critic runner"
CRITIC_JSON="$(register_agent "runner-critic-$TS" "Auto critique runner" "$OWNER_PREFIX-critic")"
CRITIC_KEY="$(printf '%s\n' "$CRITIC_JSON" | jq -r '.api_key')"
CRITIC_ID="$(printf '%s\n' "$CRITIC_JSON" | jq -r '.agent_id')"

echo "[4/6] Register + claim builder runner"
BUILDER_JSON="$(register_agent "runner-builder-$TS" "Auto builder runner" "$OWNER_PREFIX-builder")"
BUILDER_KEY="$(printf '%s\n' "$BUILDER_JSON" | jq -r '.api_key')"
BUILDER_ID="$(printf '%s\n' "$BUILDER_JSON" | jq -r '.agent_id')"

echo "[5/6] Create room"
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

echo "[6/6] Attach all runners to room"
curl -fsS -X POST "$BASE/api/rooms/$ROOM_ID/attach_runners" \
  -H "Authorization: Bearer $SUMMARIZER_KEY" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg scout_id "$SCOUT_ID" --arg summarizer_id "$SUMMARIZER_ID" --arg critic_id "$CRITIC_ID" --arg builder_id "$BUILDER_ID" '{agent_ids:[$scout_id,$summarizer_id,$critic_id,$builder_id]}')" \
  >/dev/null

echo
echo "Bootstrap complete."
echo "ROOM_ID=$ROOM_ID"
echo "UI: $BASE/"
echo
echo "Export these if you want to run runners manually:"
echo "export BASE=$BASE"
echo "export LITREV_SCOUT_KEY=$SCOUT_KEY"
echo "export LITREV_SUMMARIZER_KEY=$SUMMARIZER_KEY"
echo "export LITREV_CRITIC_KEY=$CRITIC_KEY"
echo "export LITREV_BUILDER_KEY=$BUILDER_KEY"
