#!/bin/bash
# Build the production SPA on Mac and deploy only static artifacts to Lenovo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
REMOTE="${FINGERFOOD_FRONTEND_REMOTE:-viktor@100.109.6.74}"
REMOTE_DIST="${FINGERFOOD_FRONTEND_REMOTE_DIST:-/home/viktor/fingerfood-runtime/frontend-dist}"

cd "$FRONTEND_DIR"
npm ci
npm test -- --run
env -u VITE_API_URL npm run build

if grep -RIl "FINGERFOOD_API_TOKEN" dist >/dev/null; then
  echo "ERROR: frontend bundle contains FINGERFOOD_API_TOKEN" >&2
  exit 1
fi
if grep -RIl "localhost:5173" dist >/dev/null; then
  echo "ERROR: frontend bundle contains localhost:5173" >&2
  exit 1
fi
if grep -RIl "100.109.6.74:8091" dist >/dev/null; then
  echo "ERROR: frontend bundle contains a deployment-specific API URL" >&2
  exit 1
fi

ssh "$REMOTE" "mkdir -p '$REMOTE_DIST'"
rsync -az --delete dist/ "$REMOTE:$REMOTE_DIST/"

echo "Frontend deployed to $REMOTE:$REMOTE_DIST"
echo "Static file replacement does not require a backend restart."
