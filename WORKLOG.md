# WORKLOG — Fingerfood / Catering Configurator

Living notes on project truth, boundaries, and sequencing. Update when scope or integrations shift.

---

## Core truth / single source of operational truth

**Core is the single source of operational truth** for orders and execution-oriented state.

- **`OrderVersion`** is the operational control unit: relevant order changes produce a **new `OrderVersion`** rather than mutating history in place.
- **Acceptance rule**: **No print confirmation → no acceptance.** Until a version is print-confirmed, it does not replace operational authority.
- **Authority carry-over**: The **previous effective (print-confirmed) version remains authoritative** until a successor version completes print confirmation.
- **`READY_TO_SEND`** is a **blocked release gate** — explicit policy state, not an implicit UI toggle.
- **CRM is not operational truth.** It informs relationships and intake but does not define executable order state.
- **Configurator is not operational truth.** It is an editing surface; outcomes must land in Core under **`OrderVersion`** rules.
- **Frontend `OfferDraft`** is **prototype / local editing state only** — useful for UX iteration and demos, **not** the ledger of what is operationally binding.

### Channels & surfaces

- **Input channels** (**wix_form**, **email**, **phone**, **manual**) converge into **one controlled intake flow** into Core-aligned processing (exact orchestration TBD; principle is single pipeline, not parallel conflicting truths).
- **Wochenübersicht** is a **derived overview only** — read/analytics orientation; **not** an editing channel for authoritative order data.
- **Kitchen kiosk (MVP)** is **read-only** — consumption of Core-published operational facts, not a second editor.

### Catalog / pricing (boundary)

- **`items.json`**, backend **`Item`**, and frontend **`CatalogItem`** / normalization describe **prototype catalog progress** and UX helpers. **Operational menu/catalog authority lives in Core** when Core owns publication; until then, treat repo catalog as **development fixture**, not competing SSOT against Core lifecycle rules.

---

## Current product direction

- **Brand**: Silberlöffel-oriented catering configurator (German UX copy); logo and header tuned for calm B2B presentation.
- **Near-term prototype**: Single-page configurator — browse catalog (multi-module), filter, add lines, export JSON/CSV, capture basic order/event context — **not** booking/payment and **not** Core **`OrderVersion`** submission unless explicitly wired.
- **Catalog evolution (prototype)**: Unified modules; relaxed food-only fields where appropriate; **composite / package** rows (`item_kind: composite`) as flat-priced catalog lines (no child SKU pricing yet).

---

## Configurator implementation (prototype progress)

- Catalog fetch, filters (search, section, price type, diet, allergens exclusion, max unit price, module).
- **`ItemCard`**: pricing preview, quantity modes, add to **`OfferDraft`**; composite items show a **Paket** badge.
- **`OfferSummary`** / **`OfferLineItem`**: line editing, removals, totals from snapshots; composite badge when applicable.
- **`OfferLine`** snapshots carry pricing fields plus optional **`item_kind`** for exports/display resilience.
- **`HeaderBar`** with Silberlöffel logo and title/subtitle layout (iterated for balance).
- Types: **`ItemKind`** `simple | composite`; **`ConfiguratorPlanningContextV1`** and **`InquiryV1`** — **frontend-only** placeholders (no UI, persistence, or routing).

---

## Inquiry / CRM boundary

- **`InquiryV1`** (types only): Full intake / protocol shape — id, timestamps, source, status, clarification state, opaque **`protocol`**. **Not** operational truth; **not** Core **`OrderVersion`**.
- **`ConfiguratorPlanningContextV1`** (types only): Narrow slice for **planning inputs** that might eventually seed configurator defaults — persons, budget flags, desired modules, dietary text, event type, service style. Still **not** Core truth until promoted via controlled flows.
- **CRM**: Narrative and pipeline tracking; **must not** silently overwrite Core **`OrderVersion`** semantics.

### Neue Anfrage V1 — Zeit & Ablauf / Aufwand vor Ort (decision)

- **Neue Anfrage V1 must not** ask Büro staff to calculate **exact Aufbauzeit**. Avoid precise minute commitments at intake.
- Instead, capture a **“Zeit & Ablauf / Aufwand vor Ort”** block: office records **setup complexity flags** (multi-select / checklist style), not a single engineered duration:
  - delivery only  
  - buffet setup  
  - beverage setup  
  - tableware setup  
  - equipment / table setup  
  - staff briefing  
  - allergen / signage cards  
  - teardown / pickup later  
  - unclear  
- The system **may** derive a rough **“geschätzter Vorlauf vor Essensbeginn”** as one of these **ranges only**:
  - 15–30 min  
  - 30–60 min  
  - 60–90 min  
  - needs internal review  
- That estimate is **guidance for Büro/Kundenkommunikation only** — **not operational truth**, **not** a substitute for disposition scheduling.
- **Final timing** belongs to **Küche / Disposition / Core**. Promotion into executable plans stays **Core-owned**.

---

## Boundary diagram (conceptual)

| Layer | Truth role |
|--------|------------|
| **Core** | **Authoritative** orders, **`OrderVersion`** lifecycle, print-confirmation acceptance, **`READY_TO_SEND`**, publication to kiosk/overview consumers. |
| **CRM / Inquiry** | Intake & relationship history; feeds controlled pipeline; **not** executable SSOT. |
| **Configurator + `OfferDraft`** | **Prototype editing UX**; outputs must be reconciled into Core **`OrderVersion`** rules — never assumed accepted by default. |
| **Wochenübersicht** | **Derived** — never authoritative edits. |
| **Kitchen kiosk** | **Read-only (MVP)**. |

---

## Latest pushed work (themes — verify against `git log`)

1. **`CatalogItem`** domain cleanup (optional diet / flags / allergens by module pattern).
2. **`price_type` vs `pricing_mode`** documentation + **`isPieceUnitBasis`** (`pricing.ts`).
3. Silberlöffel branding / **`HeaderBar`** polish.
4. **`item_kind`**: composite packages in JSON + **`Paket`** UI hints.
5. **`InquiryV1` / `ConfiguratorPlanningContextV1`** type scaffolding.

---

## Next focus

- Define/implement **Core ↔ Configurator** handoff so edits produce **`OrderVersion`** records with **print-confirmation** and **`READY_TO_SEND`** gates (backend contracts first).
- Align **catalog publication** so prototype **`items.json`** / **`CatalogItem`** either stays fixture-only or mirrors Core-published catalog intentionally.
- Wire **`ConfiguratorPlanningContextV1`** from real intake when the unified channel exists — still **downstream of CRM**, **upstream of** Core commits only via controlled promotion.
- **Neue Anfrage V1**: implement **“Zeit & Ablauf / Aufwand vor Ort”** (flags + optional rough range as above); ensure UX/copy makes clear estimates are **non-binding** until Core/disposition confirms.

---

## What not to do now

- Do **not** treat **`OfferDraft`**, **`CatalogItem`**, or **`items.json`** as operational or acceptance authority.
- Do **not** let CRM or inquiry blobs replace **`OrderVersion`** semantics or skip **print confirmation**.
- Do **not** use **Wochenübersicht** or **kitchen kiosk** as authoritative editing surfaces (kiosk stays read-only MVP).
- Do **not** split intake into incompatible parallel truths — preserve **single controlled flow** from **wix_form / email / phone / manual**.
- Avoid implicit **`READY_TO_SEND`** releases without explicit gate policy.
- Do **not** treat inquiry-time **“geschätzter Vorlauf”** ranges as scheduling commitments or Core operational truth.

---

*Last updated: Neue Anfrage V1 — Zeit & Ablauf / Aufwand vor Ort decision.*
