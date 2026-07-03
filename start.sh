#!/usr/bin/env bash
# Starts a local static server for the World Map Quiz.
# The app must be served over http:// (fetch() of local data files is
# blocked by browsers on file://).
cd "$(dirname "$0")"

PORT="${1:-8000}"

if command -v python3 >/dev/null 2>&1; then
  echo "Serving World Map Quiz at http://localhost:${PORT}  (Ctrl+C to stop)"
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  echo "Serving World Map Quiz at http://localhost:${PORT}  (Ctrl+C to stop)"
  exec python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  echo "Serving World Map Quiz at http://localhost:${PORT}  (Ctrl+C to stop)"
  exec npx --yes http-server -p "$PORT" -c-1 .
else
  echo "No python3/python/npx found. Please serve this folder with any static file server, e.g.:"
  echo "  python3 -m http.server ${PORT}"
  exit 1
fi
