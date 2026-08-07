# AUTH-2E3 scoped one-time handoff

## 1. Goal

Replace the current unsigned browser fragment

`#core-inquiry=<base64-json>`

with a short-lived one-time handoff for exactly two operations:

- `prepare_first_offer`
- `prepare_next_version`

## 2. Browser contract

The browser fragment carries only:

`#core-handoff=<opaque-random-code>`

The fragment must not carry:

- permissions
- account id
- role
- actor identity
- authoritative `inquiry_id`
- authoritative `offer_id`

## 3. Core storage

Core stores handoff records in a dedicated table with this shape:

- `id`
- `token_hash`
- `operation`
- `inquiry_id`
- `offer_id` nullable
- `expected_latest_version_number` nullable
- `issued_for_account_id`
- `issued_at`
- `expires_at`
- `consumed_at` nullable
- `consumed_by_account_id` nullable

The raw browser code is never stored in the database. Only its hash is persisted.

## 4. Security semantics

- TTL: 10 minutes
- code is one-time use
- consume must be atomic
- a different employee cannot use a code minted for someone else
- expired or already-consumed codes are rejected
- permission is checked again at exchange time
- account deactivation, password reset, or session revocation blocks exchange
- the browser cannot change `inquiry_id` or `offer_id` after exchange
- rollback to unsigned handoff in employee mode is forbidden

## 5. First-offer flow

Office Panel mints a code scoped to `inquiry_id` and `offers.prepare`.

The browser opens Configurator with `#core-handoff=<code>`.

Configurator exchanges the code through Core.

Core validates:

- employee identity
- current permission
- code ownership
- TTL
- one-time status

Core consumes the code.

Configurator stores the trusted authoritative target in server-side context.

Final prepare reads `inquiry_id` only from that server-side context.

## 6. Next-version flow

Office Panel mints a code scoped to:

- `offer_id`
- `inquiry_id`
- `expected_latest_version_number`

Minting this code requires `offers.version.create`.

Configurator exchanges the code through Core.

Core re-checks employee, permission, code ownership, TTL, one-time status, and current latest version.

If the latest version no longer matches `expected_latest_version_number`, exchange is rejected.

After a successful consume, Configurator stores the trusted authoritative revision target in server-side context.

Prepare-next-version uses only that server-side target.

## 7. Endpoints

Suggested endpoint shape:

Configurator:

- `POST /api/ui/handoff/exchange`

Core private:

- `POST /office/v1/auth/configurator-handoff/exchange`

Authentication model:

- browser to Configurator: employee cookie plus CSRF
- Configurator to Core private exchange endpoint: dedicated Configurator service token
- Configurator uses Core employee introspection as the identity source
- browser-direct exchange against Core is forbidden

## 8. Configurator context

After a successful exchange, the authoritative target is stored server-side in Configurator.

The browser receives only a short-lived Configurator context id or Configurator session id.

The final prepare body must not select the authoritative `inquiry_id` or `offer_id`.

## 9. Minimum future tests

First-offer:

- valid first-offer exchange
- expired code rejected
- replay rejected
- different employee rejected
- permission revoked after mint rejected
- browser `inquiry_id` substitution impossible
- denied path causes zero prepare calls

Next-version, separately:

- latest version advanced -> rejected
- wrong offer target impossible

## 10. PR split

- `AUTH-2E3A`: design note
- `AUTH-2E3B`: Core first-offer mint, store, exchange
- `AUTH-2E3C`: Configurator exchange and server-side context
- `AUTH-2E3D`: next-version flow

## 11. Integration boundary

Configurator receives Core context through the trusted handoff flow only.

The former manual Büro JSON export path (`proposal_payload_v1`)
has been removed and must not be reintroduced as an integration path.
