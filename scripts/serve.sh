#!/usr/bin/env bash
# Start the production server on a clean port.
#
# Three separate times during development a quiet stale process held :4310 and
# kept serving a build that predated the latest edits. The symptom is nasty:
# `curl` returns 200 and the page renders, so everything looks fine while the
# bundle is minutes out of date. `pkill -f standalone/server.js` did not always
# match, so this kills by the PID that actually owns the port.
#
# Usage:  ./scripts/serve.sh [port] [data-dir]
set -euo pipefail

PORT="${1:-4310}"
DATA_DIR="${2:-/tmp/sigma-data}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

if [ ! -f .next/standalone/server.js ]; then
  echo "No standalone build found. Run: pnpm build" >&2
  exit 1
fi

# Kill whatever owns the port, by PID — not by command-line pattern.
OLD="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$OLD" ]; then
  echo "Reclaiming port $PORT from pid(s): $OLD"
  # shellcheck disable=SC2086
  kill -9 $OLD 2>/dev/null || true
  sleep 1
fi

# Content is read at request time from SIGMA_CONTENT_DIR. Pin it to the
# repo so authoring a topic is live after a restart — no rebuild required.
# Without this the loader falls back to `cwd/content`, and `output: standalone`
# also ships a build-time copy under .next/standalone/content, so a topic added
# after the build 404s until the next full build. That cost several confusing
# restarts; the explicit absolute path removes the ambiguity.
echo "Starting on http://127.0.0.1:$PORT  (data: $DATA_DIR, content: $ROOT/content)"
exec env SIGMA_DATA_DIR="$DATA_DIR" SIGMA_CONTENT_DIR="$ROOT/content" \
  PORT="$PORT" HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js
