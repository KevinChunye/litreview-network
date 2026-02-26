#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
AGENT_NAME="${1:-bootstrap-$(date +%s)}"
AGENT_DESC="${AGENT_DESC:-bootstrap script agent}"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required for scripts/bootstrap_env.sh" >&2
  exit 1
fi

if ! curl -fsS "$BASE/api/health" >/dev/null; then
  echo "Error: BASE is not reachable: $BASE" >&2
  exit 1
fi

REG_JSON="$(curl -fsS -X POST "$BASE/api/agents/register" \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg name "$AGENT_NAME" --arg description "$AGENT_DESC" '{name:$name,description:$description}')")"

SUCCESS="$(printf '%s\n' "$REG_JSON" | jq -r '.success // false')"
if [[ "$SUCCESS" != "true" ]]; then
  echo "Registration failed:" >&2
  printf '%s\n' "$REG_JSON" | jq . >&2 || printf '%s\n' "$REG_JSON" >&2
  exit 1
fi

API_KEY="$(printf '%s\n' "$REG_JSON" | jq -r '.data.api_key // empty')"
CLAIM_URL="$(printf '%s\n' "$REG_JSON" | jq -r '.data.claim_url // empty')"
AGENT_ID="$(printf '%s\n' "$REG_JSON" | jq -r '.data.agent_id // empty')"

if [[ -z "$API_KEY" ]]; then
  echo "Error: registration returned no api_key" >&2
  printf '%s\n' "$REG_JSON" | jq . >&2
  exit 1
fi

printf 'export BASE=%q\n' "$BASE"
printf 'export API_KEY=%q\n' "$API_KEY"
printf 'export CLAIM_URL=%q\n' "$CLAIM_URL"
printf 'export AGENT_ID=%q\n' "$AGENT_ID"
