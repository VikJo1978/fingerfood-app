# Fingerfood BFF access boundary

## Trust model

The configurator protects commercial browser mutations through a layered
boundary. **Employee authentication is optional until explicitly enabled.**

| Layer | Mechanism |
|---|---|
| **Network** | `uvicorn` binds **only** Tailscale IP `100.109.6.74:8091` |
| **Direct API** | `POST /api/offer/prepare` requires `Authorization: Bearer FINGERFOOD_API_TOKEN` |
| **Browser BFF (disabled mode)** | `POST /api/ui/offer/prepare` — Tailnet-only; **not employee-secure** |
| **Browser BFF (employee mode)** | `POST /api/ui/offer/prepare` — Core introspection + CSRF + `offers.prepare` |

## Employee auth modes (`CONFIGURATOR_EMPLOYEE_AUTH_MODE`)

### `disabled` (default, legacy)

- Preserves the previous network-only MVP boundary.
- No Core employee introspection.
- **Not production-safe** once employee auth rollout is required.
- Used for dormant/backward-compatible operation and rollback.

### `employee` (AUTH-2E2)

Requires at startup:

- `EMPLOYEE_INTROSPECTION_SERVICE_TOKEN` — must match Core
  `EMPLOYEE_INTROSPECTION_SERVICE_TOKENS_JSON` client secret
- `CORE_EMPLOYEE_INTROSPECTION_URL` **or** `CORE_OFFICE_API_URL` (derived endpoint)

Browser flow:

1. Browser holds Core `sl_employee_session` cookie (same host/scheme only).
2. Configurator reads cookie value server-side only.
3. Configurator calls Core `POST /office/v1/auth/employee/introspect`.
4. Core returns the authoritative principal and permissions.
5. Configurator enforces `offers.prepare` and CSRF before commercial writes.

**No direct Core SQLite access. No local employee session store. No introspection cache in AUTH-2E2.**

Cookie sharing depends on compatible host/scheme settings between Office Panel
and Configurator. Split-host production topologies require **AUTH-2E3 signed
handoff** — not implemented here.

## `/api/ui/offer/prepare`

Browser-facing BFF that calls `execute_prepare_offer()` server-side.

### Disabled mode ordering

route → inquiry existence check → Core prepare

### Employee mode ordering

route → employee cookie parse → Core introspection → application access →
`offers.prepare` → CSRF → body validation → inquiry existence check → Core prepare

On success it returns only the canonical `offer_id`. The browser navigates to
the same-origin `/api/ui/offer/open/{offer_id}` route.

On failure it returns stable application error codes without Core bodies,
credentials, or session/token material.

**What it is NOT:**

- Not safe on `0.0.0.0`, LAN, or public internet
- Not authorization-by-inquiry-existence once employee mode is enabled

## `/api/ui/session`

Bootstrap endpoint for the browser:

- returns authentication state and minimal display principal
- issues `cfg_csrf` HttpOnly cookie + `csrf_token` body for authenticated employees
- does not return effective permissions (server gate remains authoritative)

## Machine route separation

| Route | Auth |
|---|---|
| `POST /api/offer/prepare` | `FINGERFOOD_API_TOKEN` bearer only |
| `POST /api/ui/offer/prepare` | employee cookie + introspection + CSRF (employee mode) |

Employee cookies must **not** substitute for machine bearer tokens, and machine
tokens must **not** bypass employee auth on the browser BFF route.

## CSRF model (employee mode)

- Cookie: `cfg_csrf` (HttpOnly, SameSite=Lax, Secure when configured)
- Header: `X-CSRF-Token`
- Constant-time compare after successful employee authentication
- Mutating browser BFF routes require both valid principal and CSRF pair

## Deferred browser mutations (AUTH-2E2 scope)

| Route | Class | Risk | Status |
|---|---|---|---|
| `POST /api/drafts` | local draft | CSRF/data integrity | deferred |
| `PUT /api/drafts/{id}` | local draft | CSRF/data integrity | deferred |
| `DELETE /api/drafts/{id}` | local draft | CSRF | deferred |
| `POST /api/offer/calculate` | pricing utility | low | open |

Only `/api/ui/offer/prepare` is employee-protected in AUTH-2E2.

## Secrets and logging

Never log:

- `Authorization`
- `Cookie` / `sl_employee_session`
- `EMPLOYEE_INTROSPECTION_SERVICE_TOKEN`
- CSRF tokens
- full principal payloads

Allowed after successful introspection: route, outcome, `account_id`, latency.

## Production activation (deferred)

Rollout order:

1. Deploy Core AUTH-2E1 with introspection client secret configured
2. Enable Configurator `CONFIGURATOR_EMPLOYEE_AUTH_MODE=employee`
3. Confirm compatible employee cookie topology or plan AUTH-2E3 handoff

Rollback: set `CONFIGURATOR_EMPLOYEE_AUTH_MODE=disabled` — restores legacy
Tailnet-only boundary but **weakens** employee authorization.

## Forbidden deployments

- `--host 0.0.0.0` on fingerfood backend
- Exposing port `8091` on LAN (`192.168.x.x`) or WAN
- Putting `FINGERFOOD_API_TOKEN` or introspection secrets in frontend/build env
- Treating inquiry existence check as authorization in employee mode
- Permissive fallback to Tailnet-only when introspection fails (employee mode)

## Runtime verification (Lenovo)

```bash
# Must show 100.109.6.74:8091 only — NOT 0.0.0.0:8091
ss -ltnp | grep :8091

# Tailscale — expect 200
curl -s http://100.109.6.74:8091/api/health

# Direct commercial API — still protected
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://100.109.6.74:8091/api/offer/prepare
# → 401
```

## Tailscale ACL

ACL policy is **not** readable from the host. Operator must confirm in
[Tailscale admin](https://login.tailscale.com/admin/acls) that only trusted
devices/users may reach `100.109.6.74:8091`.

## Future work

- **AUTH-2E3** — signed handoff ticket for split-host topology and scoped inquiry binding
- Extend employee auth/CSRF to local draft routes if required
