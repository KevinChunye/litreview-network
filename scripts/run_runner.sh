#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
MODE="${MODE:-critic}"

if [[ -z "${LITREV_API_KEY:-}" || -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Missing required env vars." >&2
  echo "Required: LITREV_API_KEY, OPENAI_API_KEY" >&2
  echo "Example:" >&2
  echo "  BASE=http://127.0.0.1:3000 OPENAI_API_KEY=... LITREV_API_KEY=... MODE=critic ./scripts/run_runner.sh" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

if ! curl -fsS "$BASE/api/healthz" >/dev/null; then
  echo "BASE is not reachable (or /api/healthz missing): $BASE" >&2
  exit 1
fi

echo "Starting agent runner"
echo "BASE=$BASE"
echo "INITIAL_ROOM_ID=${ROOM_ID:-}"
echo "MODE=$MODE"

exec node scripts/agent_runner.js
