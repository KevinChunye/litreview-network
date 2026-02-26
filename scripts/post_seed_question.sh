#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SESSION_PATH=""
QUESTION_TEXT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      [[ $# -ge 2 ]] || { echo "Missing value for --session" >&2; exit 1; }
      SESSION_PATH="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  ./scripts/post_seed_question.sh [--session .litrev/session.json] "My question..."

Priority:
  1) --session values (base/room_id/summarizer_key)
  2) env fallback (BASE, ROOM_ID, POSTER_KEY/SEED_POSTER_KEY)
EOF
      exit 0
      ;;
    *)
      if [[ -z "$QUESTION_TEXT" ]]; then
        QUESTION_TEXT="$1"
      else
        QUESTION_TEXT="$QUESTION_TEXT $1"
      fi
      shift
      ;;
  esac
done

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

SESSION_BASE=""
SESSION_ROOM_ID=""
SESSION_POSTER_KEY=""
if [[ -n "$SESSION_PATH" ]]; then
  if [[ ! -f "$SESSION_PATH" ]]; then
    echo "Session file not found: $SESSION_PATH" >&2
    exit 1
  fi
  SESSION_BASE="$(jq -r '.base // empty' "$SESSION_PATH")"
  SESSION_ROOM_ID="$(jq -r '.room_id // empty' "$SESSION_PATH")"
  SESSION_POSTER_KEY="$(jq -r '.summarizer_key // empty' "$SESSION_PATH")"
fi

BASE="${BASE:-$SESSION_BASE}"
BASE="${BASE:-http://127.0.0.1:3000}"
ROOM_ID="${ROOM_ID:-$SESSION_ROOM_ID}"
POSTER_KEY="${POSTER_KEY:-${SEED_POSTER_KEY:-${SUMMARIZER_KEY:-${LITREV_SUMMARIZER_KEY:-${SESSION_POSTER_KEY:-}}}}}"
QUESTION_TEXT="${QUESTION_TEXT:-What are the strongest and weakest empirical claims in this paper, and which ablation would resolve the biggest uncertainty?}"
ROLE="${ROLE:-questions}"
CITATION="${CITATION:-}"

if [[ -z "$ROOM_ID" || -z "$POSTER_KEY" ]]; then
  echo "Missing room/key. Provide --session .litrev/session.json or set ROOM_ID and POSTER_KEY/SEED_POSTER_KEY." >&2
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
