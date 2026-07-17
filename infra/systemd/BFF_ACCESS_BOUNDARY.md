# Fingerfood BFF access boundary (internal MVP)

## Trust model

The configurator has **no user/session authentication**. Commercial writes must
not be exposed on untrusted networks.

| Layer | Mechanism |
|---|---|
| **Network** | `uvicorn` binds **only** Tailscale IP `100.109.6.74:8091` |
| **Direct API** | `POST /api/offer/prepare` requires `Authorization: Bearer FINGERFOOD_API_TOKEN` |
| **Browser BFF** | `POST /api/ui/offer/prepare` — no browser secret; **not authorization** |

## `/api/ui/offer/prepare`

Browser-facing BFF that calls `execute_prepare_offer()` server-side.

**What it is NOT:**

- Not user authentication
- Not session authorization
- Not safe on `0.0.0.0`, LAN, or public internet

**What it checks:**

- `inquiry_id` exists in Core (workflow validation only — anyone who can reach
  the BFF and knows a valid inquiry UUID could prepare an offer)

**Actual access control for MVP:**

- Restricted **Tailnet** clients only (Tailscale ACL + bind address)
- Production frontend is served from the same listener and calls relative
  `/api/*` paths. `VITE_API_URL` is optional for development only.

## Forbidden deployments

- `--host 0.0.0.0` on fingerfood backend
- Exposing port `8091` on LAN (`192.168.x.x`) or WAN
- Putting `FINGERFOOD_API_TOKEN` in frontend, HTML, localStorage, or build env
- nginx `Authorization` header injection as a substitute for real auth
- Treating inquiry existence check as authorization

## Future external access

Requires one of:

- Real user/session auth in front of the BFF, or
- Signed short-lived Office handoff token validated server-side

Until then, keep fingerfood on Tailscale only.

## Runtime verification (Lenovo)

```bash
# Must show 100.109.6.74:8091 only — NOT 0.0.0.0:8091
ss -ltnp | grep :8091

# Tailscale — expect 200
curl -s http://100.109.6.74:8091/api/health

# LAN — expect connection refused (after bind fix)
curl -s --connect-timeout 2 http://192.168.2.12:8091/api/health

# Direct commercial API — still protected
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://100.109.6.74:8091/api/offer/prepare
# → 401
```

## Tailscale ACL

ACL policy is **not** readable from the host. Operator must confirm in
[Tailscale admin](https://login.tailscale.com/admin/acls) that only trusted
devices/users may reach `100.109.6.74:8091`.
