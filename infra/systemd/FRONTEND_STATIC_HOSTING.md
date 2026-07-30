# Production frontend hosting on Lenovo

The production SPA is built on Mac and served by the existing FastAPI process
from the same Tailscale-only listener. Lenovo does not need Node, Vite, nginx,
or an additional port.

```text
Browser -> http://100.109.6.74:8091/ -> FastAPI static SPA -> relative /api/*
```

The return to Core Offer Detail is server-configured. Before deploying this
workflow, add the trusted Core Office Panel origin to the root-owned runtime
environment without a path, query, fragment, or credentials:

```text
CORE_OFFICE_PANEL_URL=<trusted Core Office Panel HTTP(S) origin>
```

Keep `/etc/fingerfood-app.env` mode `600`. A backend restart is required after
adding or changing this variable. The value is never embedded in the frontend
bundle; the BFF returns the approved `/offer/{offer_id}` URL after Core has
returned a validated canonical UUID.

## One-time Lenovo setup

Create the runtime directory without touching application secrets:

```bash
install -d -m 0755 /home/viktor/fingerfood-runtime/frontend-dist

if ! sudo grep -q '^FINGERFOOD_FRONTEND_DIST=' /etc/fingerfood-app.env; then
  echo 'FINGERFOOD_FRONTEND_DIST=/home/viktor/fingerfood-runtime/frontend-dist' \
    | sudo tee -a /etc/fingerfood-app.env >/dev/null
fi

sudo chmod 600 /etc/fingerfood-app.env
sudo chown root:root /etc/fingerfood-app.env
sudo systemctl restart fingerfood-app
```

The restart is required once after adding the environment setting or after a
backend code update. The systemd unit must continue to bind only:

```text
--host 100.109.6.74 --port 8091
```

## Build and deploy from Mac

The script builds with `VITE_API_URL` unset, so all browser requests use the
same-origin `/api` routes:

```bash
cd ~/fingerfood-app
./infra/deploy-frontend.sh
```

Equivalent explicit commands:

```bash
cd ~/fingerfood-app/frontend
npm ci
npm test -- --run
env -u VITE_API_URL npm run build

if grep -RIn \
  'FINGERFOOD_API_TOKEN\|CORE_OFFICE_API_TOKEN\|CORE_OFFICE_PANEL_URL\|localhost\|100.109.6.74' \
  dist; then
  echo 'ERROR: production bundle is not deployment-neutral'
  exit 1
fi

ssh viktor@100.109.6.74 \
  'mkdir -p /home/viktor/fingerfood-runtime/frontend-dist'
scp -r dist/. \
  viktor@100.109.6.74:/home/viktor/fingerfood-runtime/frontend-dist/
```

Replacing files under `frontend-dist` does not require a backend restart.

## Runtime checks

```bash
curl -i http://100.109.6.74:8091/
curl -i http://100.109.6.74:8091/assets/ASSET_FROM_INDEX
curl -i http://100.109.6.74:8091/api/health
curl -i http://100.109.6.74:8091/api/unknown
sudo ss -ltnp | grep ':8091'
```

Expected boundaries:

- `/` and frontend routes return the SPA;
- `/api/health` returns JSON with status 200;
- `/api/unknown` returns an API 404, never `index.html`;
- direct `/api/offer/prepare` remains Bearer-protected;
- `/api/ui/offer/prepare` remains the browser-facing BFF;
- only `100.109.6.74:8091` listens.
