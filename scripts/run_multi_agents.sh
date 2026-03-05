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

BASE="${BASE:-http://127.0.0.1:3000}"
DEMO_MODE="${DEMO_MODE:-0}"
POLL_SECONDS="${POLL_SECONDS:-}"
MIN_SECONDS_BETWEEN_POSTS="${MIN_SECONDS_BETWEEN_POSTS:-}"
MOCK_OPENAI="${MOCK_OPENAI:-0}"
OPENAI_ENABLE_WEB_SEARCH="${OPENAI_ENABLE_WEB_SEARCH:-1}"
AUTO_INGEST_URLS="${AUTO_INGEST_URLS:-1}"

SCOUT_KEY="${SCOUT_KEY:-${LITREV_SCOUT_KEY:-}}"
SUMMARIZER_KEY="${SUMMARIZER_KEY:-${LITREV_SUMMARIZER_KEY:-}}"
CRITIC_KEY="${CRITIC_KEY:-${LITREV_CRITIC_KEY:-}}"
BUILDER_KEY="${BUILDER_KEY:-${LITREV_BUILDER_KEY:-${LITREV_THIRD_KEY:-}}}"

if [[ -z "$POLL_SECONDS" ]]; then
  if [[ "$DEMO_MODE" == "1" ]]; then POLL_SECONDS=1; else POLL_SECONDS=10; fi
fi
if [[ -z "$MIN_SECONDS_BETWEEN_POSTS" ]]; then
  if [[ "$DEMO_MODE" == "1" ]]; then MIN_SECONDS_BETWEEN_POSTS=3; else MIN_SECONDS_BETWEEN_POSTS=20; fi
fi

SCOUT_OPENAI_KEY="${SCOUT_OPENAI_KEY:-${OPENAI_API_KEY_SCOUT:-${OPENAI_API_KEY:-}}}"
SUMMARIZER_OPENAI_KEY="${SUMMARIZER_OPENAI_KEY:-${OPENAI_API_KEY_SUMMARIZER:-${OPENAI_API_KEY:-}}}"
CRITIC_OPENAI_KEY="${CRITIC_OPENAI_KEY:-${OPENAI_API_KEY_CRITIC:-${OPENAI_API_KEY:-}}}"
BUILDER_OPENAI_KEY="${BUILDER_OPENAI_KEY:-${OPENAI_API_KEY_BUILDER:-${OPENAI_API_KEY:-}}}"

if [[ -z "$SCOUT_KEY" || -z "$SUMMARIZER_KEY" || -z "$CRITIC_KEY" || -z "$BUILDER_KEY" ]]; then
  cat >&2 <<'EOF'
Missing runner keys.
Set:
  LITREV_SCOUT_KEY
  LITREV_SUMMARIZER_KEY
  LITREV_CRITIC_KEY
  LITREV_BUILDER_KEY
Tip: run ./scripts/dev_bootstrap.sh to auto-create and print keys.
EOF
  exit 1
fi

if [[ "$MOCK_OPENAI" != "1" && ( -z "$SCOUT_OPENAI_KEY" || -z "$SUMMARIZER_OPENAI_KEY" || -z "$CRITIC_OPENAI_KEY" || -z "$BUILDER_OPENAI_KEY" ) ]]; then
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
  local runner_id="runner-${name}-$(date +%s)-$RANDOM"

  BASE="$BASE" \
  MODE="$mode" \
  RUNNER_ID="$runner_id" \
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
  echo "Started $name (mode=$mode, runner_id=$runner_id, pid=$pid, log=$log_file)"
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
echo "Runners are live."
echo "Next: in UI, open your room and click 'Attach runners to this room'."
echo "Watch logs:"
echo "  tail -f logs/runner-scout.log logs/runner-summarizer.log logs/runner-critic.log logs/runner-builder.log"
echo "DEMO_MODE=$DEMO_MODE POLL_SECONDS=$POLL_SECONDS MIN_SECONDS_BETWEEN_POSTS=$MIN_SECONDS_BETWEEN_POSTS"
echo "Press Ctrl+C to stop."

wait
