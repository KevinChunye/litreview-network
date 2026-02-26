#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SESSION_PATH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      [[ $# -ge 2 ]] || { echo "Missing value for --session" >&2; exit 1; }
      SESSION_PATH="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/run_multi_agents.sh [--session .litrev/session.json]

If --session is provided, ROOM_ID and runner keys are loaded from the session file.
Without --session, env vars are used (backward compatible).
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

BASE="${BASE:-}"
ROOM_ID="${ROOM_ID:-}"
DEMO_MODE="${DEMO_MODE:-0}"
POLL_SECONDS="${POLL_SECONDS:-}"
MIN_SECONDS_BETWEEN_POSTS="${MIN_SECONDS_BETWEEN_POSTS:-}"
MOCK_OPENAI="${MOCK_OPENAI:-0}"
OPENAI_ENABLE_WEB_SEARCH="${OPENAI_ENABLE_WEB_SEARCH:-1}"
AUTO_INGEST_URLS="${AUTO_INGEST_URLS:-1}"

SESSION_BASE=""
SESSION_ROOM_ID=""
SESSION_SUMMARIZER_KEY=""
SESSION_CRITIC_KEY=""
SESSION_SCOUT_KEY=""
SESSION_BUILDER_KEY=""
SESSION_THIRD_KEY=""
SESSION_THIRD_MODE=""

if [[ -n "$SESSION_PATH" ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required when using --session" >&2
    exit 1
  fi
  if [[ ! -f "$SESSION_PATH" ]]; then
    echo "Session file not found: $SESSION_PATH" >&2
    exit 1
  fi
  SESSION_BASE="$(jq -r '.base // empty' "$SESSION_PATH")"
  SESSION_ROOM_ID="$(jq -r '.room_id // empty' "$SESSION_PATH")"
  SESSION_SUMMARIZER_KEY="$(jq -r '.summarizer_key // empty' "$SESSION_PATH")"
  SESSION_CRITIC_KEY="$(jq -r '.critic_key // empty' "$SESSION_PATH")"
  SESSION_SCOUT_KEY="$(jq -r '.scout_key // empty' "$SESSION_PATH")"
  SESSION_BUILDER_KEY="$(jq -r '.builder_key // empty' "$SESSION_PATH")"
  SESSION_THIRD_KEY="$(jq -r '.third_key // empty' "$SESSION_PATH")"
  SESSION_THIRD_MODE="$(jq -r '.third_mode // empty' "$SESSION_PATH")"
fi

BASE="${BASE:-$SESSION_BASE}"
BASE="${BASE:-http://127.0.0.1:3000}"
ROOM_ID="${ROOM_ID:-$SESSION_ROOM_ID}"

SUMMARIZER_KEY="${SUMMARIZER_KEY:-${LITREV_SUMMARIZER_KEY:-${SESSION_SUMMARIZER_KEY:-}}}"
CRITIC_KEY="${CRITIC_KEY:-${LITREV_CRITIC_KEY:-${SESSION_CRITIC_KEY:-}}}"
SCOUT_KEY="${SCOUT_KEY:-${LITREV_SCOUT_KEY:-${SESSION_SCOUT_KEY:-}}}"
BUILDER_KEY="${BUILDER_KEY:-${LITREV_BUILDER_KEY:-${SESSION_BUILDER_KEY:-${THIRD_KEY:-${LITREV_THIRD_KEY:-${SESSION_THIRD_KEY:-}}}}}}"
THIRD_MODE="${THIRD_MODE:-${SESSION_THIRD_MODE:-builder}}"

if [[ -z "$POLL_SECONDS" ]]; then
  if [[ "$DEMO_MODE" == "1" ]]; then
    POLL_SECONDS=1
  else
    POLL_SECONDS=10
  fi
fi

if [[ -z "$MIN_SECONDS_BETWEEN_POSTS" ]]; then
  if [[ "$DEMO_MODE" == "1" ]]; then
    MIN_SECONDS_BETWEEN_POSTS=3
  else
    MIN_SECONDS_BETWEEN_POSTS=20
  fi
fi

POLL_SECONDS="${POLL_SECONDS:-10}"
MIN_SECONDS_BETWEEN_POSTS="${MIN_SECONDS_BETWEEN_POSTS:-20}"

SUMMARIZER_OPENAI_KEY="${SUMMARIZER_OPENAI_KEY:-${OPENAI_API_KEY_SUMMARIZER:-${OPENAI_API_KEY:-}}}"
CRITIC_OPENAI_KEY="${CRITIC_OPENAI_KEY:-${OPENAI_API_KEY_CRITIC:-${OPENAI_API_KEY:-}}}"
SCOUT_OPENAI_KEY="${SCOUT_OPENAI_KEY:-${OPENAI_API_KEY_SCOUT:-${OPENAI_API_KEY:-}}}"
BUILDER_OPENAI_KEY="${BUILDER_OPENAI_KEY:-${OPENAI_API_KEY_BUILDER:-${OPENAI_API_KEY:-}}}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

if [[ -z "$ROOM_ID" || -z "$SUMMARIZER_KEY" || -z "$CRITIC_KEY" || -z "$SCOUT_KEY" || -z "$BUILDER_KEY" ]]; then
  cat >&2 <<'EOF'
Missing required env vars.
Required:
  ROOM_ID
  SUMMARIZER_KEY (or LITREV_SUMMARIZER_KEY)
  CRITIC_KEY (or LITREV_CRITIC_KEY)
  SCOUT_KEY (or LITREV_SCOUT_KEY)
  BUILDER_KEY (or LITREV_BUILDER_KEY)
Optional:
  DEMO_MODE=1 for fast polling/cooldown in local demos
  OPENAI_API_KEY (shared) or *_OPENAI_KEY per runner
Tip:
  Use --session .litrev/session.json to load ROOM_ID and runner keys automatically.
  If your old session lacks scout/builder keys, rerun ./scripts/dev_bootstrap.sh.
EOF
  exit 1
fi

if [[ "$MOCK_OPENAI" != "1" && ( -z "$SUMMARIZER_OPENAI_KEY" || -z "$CRITIC_OPENAI_KEY" || -z "$SCOUT_OPENAI_KEY" || -z "$BUILDER_OPENAI_KEY" ) ]]; then
  echo "Missing OpenAI key: set OPENAI_API_KEY or per-runner *_OPENAI_KEY values." >&2
  exit 1
fi

if ! curl -fsS "$BASE/api/healthz" >/dev/null; then
  echo "BASE is not reachable (or /api/healthz missing): $BASE" >&2
  exit 1
fi

mkdir -p logs
PIDS=()

start_runner() {
  local name="$1"
  local mode="$2"
  local litrev_key="$3"
  local openai_key="$4"
  local log_file="logs/runner-${name}.log"

  BASE="$BASE" \
  ROOM_ID="$ROOM_ID" \
  MODE="$mode" \
  LITREV_API_KEY="$litrev_key" \
  OPENAI_API_KEY="$openai_key" \
  DEMO_MODE="$DEMO_MODE" \
  MOCK_OPENAI="$MOCK_OPENAI" \
  POLL_SECONDS="$POLL_SECONDS" \
  MIN_SECONDS_BETWEEN_POSTS="$MIN_SECONDS_BETWEEN_POSTS" \
  OPENAI_ENABLE_WEB_SEARCH="$OPENAI_ENABLE_WEB_SEARCH" \
  AUTO_INGEST_URLS="$AUTO_INGEST_URLS" \
  node scripts/agent_runner.js >>"$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  echo "Started $name (mode=$mode, pid=$pid, log=$log_file)"
}

cleanup() {
  if [[ "${#PIDS[@]}" -gt 0 ]]; then
    echo
    echo "Stopping runners: ${PIDS[*]}"
    kill "${PIDS[@]}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

start_runner "scout" "scout" "$SCOUT_KEY" "$SCOUT_OPENAI_KEY"
start_runner "summarizer" "summarizer" "$SUMMARIZER_KEY" "$SUMMARIZER_OPENAI_KEY"
start_runner "critic" "critic" "$CRITIC_KEY" "$CRITIC_OPENAI_KEY"
start_runner "builder" "builder" "$BUILDER_KEY" "$BUILDER_OPENAI_KEY"

echo
echo "Runners are live. Post a seed message in room $ROOM_ID and watch logs:"
echo "  tail -f logs/runner-scout.log logs/runner-summarizer.log logs/runner-critic.log logs/runner-builder.log"
echo "DEMO_MODE=$DEMO_MODE POLL_SECONDS=$POLL_SECONDS MIN_SECONDS_BETWEEN_POSTS=$MIN_SECONDS_BETWEEN_POSTS"
echo "Press Ctrl+C to stop."

wait
