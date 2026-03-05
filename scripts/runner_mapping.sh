#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

curl -fsS "$BASE/api/runners" \
  | jq '{total:.data.total,mapping:(.data.runners|map({runner_id,agent_name,mode,assigned_room_id,assigned_room_topic,last_seen_at}))}'
