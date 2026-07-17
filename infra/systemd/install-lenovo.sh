#!/bin/bash
# Install fingerfood-app systemd unit on Lenovo. Requires sudo once.
set -euo pipefail

REPO_ROOT="${FINGERFOOD_REPO_ROOT:-/home/viktor/projects/fingerfood-app}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_TARGET=/etc/fingerfood-app.env
UNIT_TARGET=/etc/systemd/system/fingerfood-app.service
OFFICE_API_ENV=/etc/catering/office-api.env

if [[ ! -f "$REPO_ROOT/backend/.venv/bin/uvicorn" ]]; then
  echo "missing venv: $REPO_ROOT/backend/.venv" >&2
  exit 1
fi

if ! sudo test -f "$OFFICE_API_ENV"; then
  echo "missing $OFFICE_API_ENV — create Core Office API env first" >&2
  exit 1
fi

token_line="$(sudo grep -E '^OFFICE_API_TOKEN=' "$OFFICE_API_ENV" || true)"
if [[ -z "$token_line" ]]; then
  echo "OFFICE_API_TOKEN not found in $OFFICE_API_ENV" >&2
  exit 1
fi

tmp="$(mktemp)"
chmod 600 "$tmp"
{
  echo "CORE_OFFICE_API_URL=http://100.109.6.74:8084"
  echo "${token_line/OFFICE_API_TOKEN/CORE_OFFICE_API_TOKEN}"
  echo "CATALOG_ADAPTER_STRICT=1"
} > "$tmp"

sudo cp "$tmp" "$ENV_TARGET"
sudo chmod 600 "$ENV_TARGET"
sudo chown root:root "$ENV_TARGET"
rm -f "$tmp"

sudo cp "$SCRIPT_DIR/fingerfood-app.service" "$UNIT_TARGET"
sudo systemctl daemon-reload

if pgrep -f "uvicorn app.main:app" >/dev/null 2>&1; then
  echo "Stopping manual uvicorn (port 8091)…"
  pkill -f "uvicorn app.main:app" || true
  sleep 2
fi

sudo systemctl enable fingerfood-app
sudo systemctl restart fingerfood-app
systemctl is-active fingerfood-app

if ss -ltnp | grep -E '0\.0\.0\.0:8091|\*:8091' >/dev/null; then
  echo "ERROR: fingerfood still bound to all interfaces — check ExecStart host" >&2
  exit 1
fi
if ! ss -ltnp | grep '100.109.6.74:8091' >/dev/null; then
  echo "ERROR: fingerfood not listening on Tailscale 100.109.6.74:8091" >&2
  exit 1
fi

echo "Installed (Tailscale bind OK). Check: journalctl -u fingerfood-app -n 50 --no-pager"
