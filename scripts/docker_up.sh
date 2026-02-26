#!/usr/bin/env bash
set -euo pipefail

docker compose up --build -d

echo "Services are starting."
echo "UI: http://localhost:3000"
echo
echo "Tail runner logs:"
echo "  docker compose logs -f runner-scout runner-summarizer runner-critic runner-builder"
