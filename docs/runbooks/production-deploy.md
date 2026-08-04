# Fingerfood Configurator production deployment runbook

## Scope

Deploying a change that touches the Configurator **backend**
(`backend/app/...`) — not just the static frontend bundle. Confirmed
necessary by PR #16 (OFFER_BUDGET_DEFINITION_V1 pass-through): it changes
`backend/app/routes/offer.py` and
`backend/app/services/offer_snapshot_service.py`, both loaded once at
process start by the long-running `fingerfood-app` systemd unit — a code
deploy alone does **not** take effect until that process is restarted.

If a change only touches `frontend/`, use `infra/deploy-frontend.sh`
directly; the backend steps below are not needed and the script itself
prints "Static file replacement does not require a backend restart."

## Precondition: Core must already support the contract

Before restarting `fingerfood-app` with a backend change that adds or
changes the payload Configurator sends to Core (e.g. a new envelope field
like `budget_definition`), **Core's office-api must already be running
code that accepts it.** Core's envelope validator rejects unknown
top-level keys (`_reject_unknown_keys`), so restarting Configurator's
backend first — while Core is still on old code — would make every
prepare-offer request that uses the new field fail outright for any
operator who happens to use it in that window.

Confirm before proceeding:

```bash
# On Core (Lenovo): the corresponding Core PR/commit is already merged,
# deployed, and catering-office-api has been restarted since.
systemctl show catering-office-api --property=ActiveEnterTimestamp
git -C /home/viktor/projects/silberloeffel-catering log -1 --oneline
```

If Core has not yet been redeployed with the matching change, **stop** —
do not proceed with the Configurator backend restart below.

### AUTH-2E2 employee auth (when enabling `CONFIGURATOR_EMPLOYEE_AUTH_MODE=employee`)

Rollout order:

1. Deploy Core with AUTH-2E1 introspection and configure
   `EMPLOYEE_INTROSPECTION_SERVICE_TOKENS_JSON` on `catering-office-api`.
2. Add matching `EMPLOYEE_INTROSPECTION_SERVICE_TOKEN` to
   `/etc/fingerfood-app.env`.
3. Set `CONFIGURATOR_EMPLOYEE_AUTH_MODE=employee` and restart
   `fingerfood-app`.

Do **not** enable employee mode before Core introspection is live. Rollback:
set `CONFIGURATOR_EMPLOYEE_AUTH_MODE=disabled` and restart — this restores
the legacy Tailnet-only boundary but removes employee authorization.

See `infra/systemd/BFF_ACCESS_BOUNDARY.md` for cookie topology and AUTH-2E3
handoff requirements on split-host deployments.

## 1. Record the starting production SHA

```bash
cd /home/viktor/projects/fingerfood-app
git status --short
git rev-parse --short HEAD
```

Stop if tracked local modifications exist (see [Tracked-clean
verification](#2-tracked-clean-verification) below for what "clean" means
here) — untracked operator-owned files (draft data under
`backend/app/data/`) must be understood and preserved, never discarded.

## 2. Tracked-clean verification

```bash
git status --short --untracked-files=no
```

Must print nothing. If it prints anything, this is tracked drift on a
production checkout — investigate before touching anything else; do not
`git checkout .` or `git reset --hard` to silence it without first
understanding what it is.

## 3. Backup

The backend change itself carries no database — Fingerfood's operational
state is the JSON files under `backend/app/data/` (drafts, catalog
snapshot), covered by the existing [backup-restore
runbook](backup-restore.md). Take a fresh on-demand backup before a
backend deploy exactly as that runbook describes, so a rollback (below)
has a clean recovery point if the deploy also happens to coincide with
data corruption from an unrelated cause:

```bash
/home/viktor/fingerfood-runtime/bin/fingerfood-backup.sh
```

## 4. Clean backend validation

Run on the production host, against the exact commit about to be
deployed (fetch to a temp location or validate the CI run for that exact
commit — never validate against `HEAD` of a different branch):

```bash
cd /home/viktor/projects/fingerfood-app/backend
.venv/bin/ruff check .
.venv/bin/mypy .
.venv/bin/pytest -q
```

If development dependencies are not installed on the production host,
rely on the successful CI run for the exact commit SHA being deployed —
confirmed green, not just present.

## 5. Fast-forward-only checkout update

```bash
cd /home/viktor/projects/fingerfood-app
git fetch origin
git merge --ff-only origin/main
git rev-parse --short HEAD
```

Never `git reset --hard` on production. If fast-forward is impossible,
stop and investigate the divergence rather than forcing it.

## 6. Record PID and ActiveEnterTimestamp (before restart)

```bash
systemctl show fingerfood-app --property=MainPID,ActiveEnterTimestamp
```

Keep this output. It is the baseline the [after check](#8-verify-pid-and-activeentertimestamp-after-restart)
confirms actually changed.

## 7. Restart `fingerfood-app.service`

```bash
sudo systemctl restart fingerfood-app
systemctl is-active fingerfood-app
```

## 8. Verify PID and ActiveEnterTimestamp (after restart)

```bash
systemctl show fingerfood-app --property=MainPID,ActiveEnterTimestamp
```

Both `MainPID` and `ActiveEnterTimestamp` must differ from the [before-restart values](#6-record-pid-and-activeentertimestamp-before-restart) — proof the unit actually restarted a new process, not that
`systemctl restart` silently no-opped. If either value is unchanged,
treat the deploy as **not yet applied**; check
`journalctl -u fingerfood-app --since '5 minutes ago' --no-pager` for a
restart failure before proceeding.

## 9. `/api/health` verification

The service binds only to the Tailscale address (see
`infra/systemd/fingerfood-app.service` — never `--host 0.0.0.0`), so
check from a host on the tailnet:

```bash
curl -sf http://100.109.6.74:8091/api/health
```

Expect `{"status":"ok"}`. A connection refused/timeout means the process
did not come up — check `journalctl -u fingerfood-app` before continuing.

## 10. Configurator-to-Core contract smoke test

Deliberately designed to prove the full chain — Configurator backend,
`CoreOfficeClient`, Core's office-api, Core's envelope
validator — works end to end **without creating a real Offer**: send a
structurally valid `OfferSnapshotBuildRequest` referencing an
`inquiry_id` that does not exist in Core. Core rejects it before writing
anything, so the response's shape is the proof, not its outcome.

```bash
curl -s -o /tmp/contract-smoke.json -w '%{http_code}\n' \
  -X POST http://100.109.6.74:8091/api/offer/prepare \
  -H "Authorization: Bearer $FINGERFOOD_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "inquiry_id": "00000000-0000-4000-8000-000000000000",
    "snapshot_id": "00000000-0000-4000-8000-000000000001",
    "valid_until": "2099-01-01",
    "recipient": {"company_name": "Smoke Test", "contact_name": "Smoke Test", "email": "smoke@example.invalid", "postal_address": "Smoke Test"},
    "event": {"event_date": "2099-01-01", "time_window_text": "18:00", "location_text": "Smoke Test", "guest_count": 1, "planning_mode": "caterer_suggestion"},
    "customer_text": {"title": "Smoke Test", "introduction": "Smoke Test", "notes": "Smoke Test"},
    "payment_terms": {"method": "RECHNUNG", "customer_visible_text": "Smoke Test"},
    "offer": {"lines": []}
  }'
cat /tmp/contract-smoke.json; rm -f /tmp/contract-smoke.json
```

Expect a `4xx` status with a structured JSON error body whose `code`
reflects a *Core-side* rejection (e.g. `core_offer_prepare_failed`, or a
snapshot-validation message) — not a `502`/`504`/connection error, and
not a Configurator-side `422` from Pydantic request-shape validation
(which would mean the request itself was malformed, proving nothing
about Core reachability). A clean Core-originated rejection proves:
network reachability, `CORE_OFFICE_API_TOKEN` authentication, and Core's
validator all executed — with zero risk of leaving a real Offer behind,
since the referenced Inquiry never existed.

## 11. Frontend atomic deployment

Only after the backend steps above are confirmed healthy:

```bash
cd /home/viktor/projects/fingerfood-app
./infra/deploy-frontend.sh
```

This builds locally, runs the bundle-boundary/secret scan, and `scp`s the
built `dist/` atomically into place — no backend restart involved or
required.

## Rollback order

**Frontend → Configurator backend → Core code** — the reverse of the
deploy order above, and for the same reason as the precondition: Core
must remain able to serve whichever Configurator backend version is
currently live at every step.

1. **Frontend**: re-run `infra/deploy-frontend.sh` against the last
   known-good commit's `frontend/` (static files only, safe at any time).
2. **Configurator backend**: fast-forward (or explicitly check out) the
   checkout to the last known-good commit, `sudo systemctl restart
   fingerfood-app`, then repeat steps [8](#8-verify-pid-and-activeentertimestamp-after-restart)
   through [10](#10-configurator-to-core-contract-smoke-test) above to
   confirm the rollback actually took effect.
3. **Core code**: only roll back Core last, and only if the Configurator
   rollback alone didn't resolve the issue — rolling back Core first
   while a newer Configurator backend is still live risks the exact
   unknown-envelope-key rejection the [precondition](#precondition-core-must-already-support-the-contract)
   above describes, in reverse.

Database changes are not part of this rollback — this deploy adds no
schema of its own on the Configurator side (Fingerfood's operational data
is JSON files, not SQLite); see [backup-restore.md](backup-restore.md) if
a data-level restore is independently needed for an unrelated reason.
