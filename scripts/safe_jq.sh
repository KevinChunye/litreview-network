#!/usr/bin/env bash
set -euo pipefail

# Strip unsafe control bytes before jq parsing.
perl -CSDA -pe 's/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]//g' | jq "$@"
