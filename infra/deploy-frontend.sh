#!/bin/bash
# Build the production SPA on Mac and deploy only static artifacts to Lenovo.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
REMOTE="${FINGERFOOD_FRONTEND_REMOTE:-viktor@100.109.6.74}"
REMOTE_DIST="${FINGERFOOD_FRONTEND_REMOTE_DIST:-/home/viktor/fingerfood-runtime/frontend-dist}"

cd "$FRONTEND_DIR"
npm ci
npm run lint
npm run typecheck
npm test -- --run
env -u VITE_API_URL npm run build

forbidden_bundle_pattern='FINGERFOOD_API_TOKEN|CORE_OFFICE_API_URL|CORE_OFFICE_API_TOKEN|CORE_OFFICE_PANEL_URL|Authorization.{0,80}Bearer|100\.109\.6\.74|localhost'
if grep -RInE "$forbidden_bundle_pattern" dist; then
  echo "ERROR: frontend bundle contains server-only configuration" >&2
  exit 1
fi

ssh "$REMOTE" "mkdir -p '$REMOTE_DIST'"
scp -r dist/. "$REMOTE:$REMOTE_DIST/"

echo "Frontend deployed to $REMOTE:$REMOTE_DIST"
echo "Static file replacement does not require a backend restart."
