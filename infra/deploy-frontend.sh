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

REMOTE_STAGE="${REMOTE_DIST}.incoming.$"
REMOTE_PREVIOUS="${REMOTE_DIST}.previous.$"

ssh "$REMOTE" "rm -rf '$REMOTE_STAGE' '$REMOTE_PREVIOUS' && mkdir -p '$REMOTE_STAGE'"
scp -r dist/. "$REMOTE:$REMOTE_STAGE/"

local_index_sha="$(shasum -a 256 dist/index.html | awk '{print $1}')"
remote_index_sha="$(
  ssh "$REMOTE" "sha256sum '$REMOTE_STAGE/index.html' | awk '{print \\$1}'"
)"
if [[ "$local_index_sha" != "$remote_index_sha" ]]; then
  ssh "$REMOTE" "rm -rf '$REMOTE_STAGE'"
  echo "ERROR: uploaded frontend index checksum mismatch" >&2
  exit 1
fi

ssh "$REMOTE" "
  set -eu
  rm -rf '$REMOTE_PREVIOUS'
  if [ -e '$REMOTE_DIST' ]; then
    mv '$REMOTE_DIST' '$REMOTE_PREVIOUS'
  fi
  if mv '$REMOTE_STAGE' '$REMOTE_DIST'; then
    rm -rf '$REMOTE_PREVIOUS'
  else
    if [ -e '$REMOTE_PREVIOUS' ]; then
      mv '$REMOTE_PREVIOUS' '$REMOTE_DIST'
    fi
    exit 1
  fi
"

echo "Frontend deployed to $REMOTE:$REMOTE_DIST"
echo "Previous hashed assets were removed by the release-directory swap."
echo "Static frontend replacement does not require a backend restart."
