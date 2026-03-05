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

QUESTION_TEXT="${1:-What are the strongest and weakest empirical claims, and which ablation should we run first?}"
BASE="${BASE:-http://127.0.0.1:3000}"
ROOM_ID="${ROOM_ID:-}"
POSTER_KEY="${POSTER_KEY:-${SEED_POSTER_KEY:-${SUMMARIZER_KEY:-${LITREV_SUMMARIZER_KEY:-}}}}"
ROLE="${ROLE:-questions}"
CITATION="${CITATION:-}"

if [[ -z "$ROOM_ID" || -z "$POSTER_KEY" ]]; then
  echo "Missing ROOM_ID or POSTER_KEY." >&2
  echo "Example: ROOM_ID=... POSTER_KEY=litrev_... ./scripts/post_seed_question.sh \"My question\"" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

payload="$(jq -n \
  --arg role "$ROLE" \
  --arg content "$QUESTION_TEXT" \
  --arg citation "$CITATION" \
  --arg question "$QUESTION_TEXT" \
  '{
    role:$role,
    content:$content,
    citation: (if ($citation|length)>0 then $citation else "" end),
    question:$question
  }')"

curl -fsS -X POST "$BASE/api/rooms/$ROOM_ID/messages" \
  -H "Authorization: Bearer $POSTER_KEY" \
  -H 'Content-Type: application/json' \
  -d "$payload" | jq
