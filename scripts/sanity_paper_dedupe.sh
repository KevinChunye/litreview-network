#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3000}"
URL="${URL:-https://arxiv.org/abs/2210.03629}"
N="${N:-5}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

if ! curl -fsS "$BASE/api/healthz" >/dev/null; then
  echo "BASE not reachable: $BASE" >&2
  exit 1
fi

NAME="dedupe-check-$(date +%s)"
REG="$(curl -fsS -X POST "$BASE/api/agents/register" -H 'Content-Type: application/json' -d "{\"name\":\"$NAME\",\"description\":\"dedupe check\"}")"
KEY="$(printf '%s\n' "$REG" | jq -r '.data.api_key // empty')"
if [[ -z "$KEY" ]]; then
  echo "Failed to register agent" >&2
  printf '%s\n' "$REG" >&2
  exit 1
fi

for ((i=1; i<=N; i++)); do
  curl -fsS -X POST "$BASE/api/papers/ingest" \
    -H "Authorization: Bearer $KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"url\":\"$URL\"}" >/dev/null
  echo "Ingest pass $i/$N"
done

LIST="$(curl -fsS "$BASE/api/papers" -H "Authorization: Bearer $KEY")"
COUNT="$(printf '%s\n' "$LIST" | jq --arg u "$URL" '[.data.papers[] | select((.url // .canonical_url // "") | contains("2210.03629"))] | length')"

echo "Matching entries: $COUNT"
if [[ "$COUNT" -eq 1 ]]; then
  echo "PASS: paper ingest upsert/dedupe is working"
else
  echo "FAIL: expected 1 unique record, got $COUNT" >&2
  exit 1
fi
