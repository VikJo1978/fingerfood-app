# WORKLOG — Fingerfood / Catering Configurator

Living notes on project truth, boundaries, and sequencing. Update when scope or integrations shift.

---

## Document role (this file)

- **`WORKLOG.md`** is currently the **combined recovery anchor** for this prototype.
- It contains **both**:
  - **Core truth / architecture state**
  - **Accepted execution progress**
- **Do not** use it for speculative redesign or brainstorming.
- Record **accepted decisions**, **completed steps**, and **current next step(s)** only.
- When **Core** / **persistence** / **`OrderVersion`** / **CRM storage** implementation begins, split documentation into:
  - **`docs/handoff/architecture_state.md`**
  - **`docs/handoff/worklog.md`**

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

## Frontend UX decisions (Neue Anfrage & Konfigurator — prototype)

- **Neue Anfrage V1** is a **frontend-only Gesprächsprotokoll** (local browser; no backend, persistence, or routing).
- **Inquiry → Configurator** handoff is split into **planning context** (`ConfiguratorPlanningContextV1`) and **order context prefill** (`ConfiguratorOrderContextPrefillV1`, wrapped in `InquiryToConfiguratorTransferV1`).
- **Billing / abweichende Rechnungsadresse** stays in **inquiry-local state** for now and **must not** be written into **Bemerkungen** (`orderContext.remarks`).
- **Anfrage-Kontext**: read-only block **above** the **Bemerkungen** field so transferred inquiry notes stay scannable (still the same `remarks` value).
- Catalog selection is labeled **Angebotsbausteine** (office “building blocks”), **not** a customer **menu**.
- **Baustein-Typ** uses **chips** for modules and **Pakete** (composite items), replacing the old compact module control.
- **Advanced filters** sit behind **„Weitere Filter anzeigen“**; collapsing **only hides UI**, active filter values remain.
- **`ItemCard`**: diet, ingredients, allergens, **`items_included`** (as **„Enthalten / Zusammensetzung“**, read-only, multiline), and full warnings under **„Details anzeigen“**; primary row stays scannable; for **Pakete/Buffets**, visible composition is the main value proposition — **offer-line customization** stays **`Änderungswunsch`** only (see architecture section).
- **Packages / Buffets** = **`item_kind: composite`** lines; **v1 prototype**: flat catalog price only; **seed data**: **Lunch Buffet No 1–3** in **`items.json`** (PDF-aligned composition in **`items_included`**; **no** automatic Büffetpauschale / delivery / MwSt. calculation in V1). See **Architecture: Composite Customization V1** for **Änderungswunsch** / structured pricing path.

---

## Architecture: Composite Customization V1

**Decision:** Packages / Buffets are **composite** items (`item_kind: composite`) in the catalog and **must eventually** be adjustable by Büro staff when building offers.

**Examples (intent):**

- Dessert tauschen  
- Salat entfernen  
- Starter hinzufügen  
- Fleischgericht durch vegetarische Alternative ersetzen  

**V1 rule (explicit non-goals for this generation):**

- No child editor  
- No slots  
- No automatic price delta  
- No bundle price engine  
- No supplier logic  
- No Core **`OrderVersion`** implementation in this step  

**V1 behavior (semantics until structured customization ships):**

- The composite **offer line keeps the base catalog price** (snapshot / list price as today).  
- Office may add a visible **Änderungswunsch** / **customization note** on the line.  
- **Price must be treated as provisional** and **internally checked** whenever customization is noted.  
- The customization note is **planning / coordination information only** — **not** operational truth.  
- **Final acceptance and pricing** belong to **Core / Disposition** under **`OrderVersion`** rules (incl. print confirmation).  

**Preferred later implementation path:**

1. **`customizationNote`** (or equivalent) on composite **offer lines**  
2. **Structured component slots**  
3. **Priced** replacement / add-on rules  
4. **Core-owned**, **versioned** acceptance  

---

## Configurator implementation (prototype progress)

- Catalog fetch, filters (search, section, price type, diet, allergens exclusion, max unit price, module).
- **`items.json` (prototype)**: **Lunch Buffet No 1–3** (`lunch-buffet-2026-no-1` … **`no-3`**) as **PDF-derived** composite rows — **`item_kind` composite**, **`module` food**, **`price_type` person**, **`min_order` 10**; flat **Paketpreis** only; **no** automatic **Büffetpauschale** / **Anlieferung** / **MwSt.** calculation in V1 (text in **`items_included`** only). Legacy placeholder packages marked **`[Demo]`** / section **Demo Pakete**.
- **Angebotsbausteine**: catalog column headed **„Angebotsbausteine auswählen“** with helper copy; **Baustein-Typ** chips (Alle, Speisen, Getränke, **Pakete** = client-side **`item_kind === composite`**, other modules unchanged); secondary filters live under **„Weitere Filter anzeigen“** (collapsed by default; **„Erweiterte Filter aktiv“** when any advanced filter is set; values persist when collapsed).
- **`ItemCard`**: compact card; primary row always shows name, price, description, min order, quantity controls, preview, **Zum Angebot hinzufügen**, **Paket** badge when composite; expanded **Details** include **`items_included`** as read-only **„Enthalten / Zusammensetzung“** (`whitespace-pre-wrap`), then diet, ingredients, allergens, full **`lineWarnings`**; **„Hinweise vorhanden“** when warnings non-empty outside collapse.
- **`OrderContextCard`**: when **`remarks`** exist, a read-only **„Anfrage-Kontext“** block above the editable **Bemerkungen** textarea (same field; no new **`OrderContext`** keys).
- **`OfferSummary`** / **`OfferLineItem`**: line editing, removals, totals from snapshots; composite badge when applicable.
- **`OfferLine`** snapshots carry pricing fields plus optional **`item_kind`** for exports/display resilience.
- **`HeaderBar`** with Silberlöffel logo and title/subtitle layout (iterated for balance).
- Types: **`ItemKind`** `simple | composite`; **`InquiryV1`** (full protocol placeholder); **`ConfiguratorPlanningContextV1`** (planning-only: persons, budget, desired modules, dietary, event type, service style); **`ConfiguratorOrderContextPrefillV1`** + **`InquiryToConfiguratorTransferV1`** (**`planning`** + **`orderContextPrefill`**) for inquiry → configurator handoff **without** pushing full protocol into **`OfferDraft`**.

---

## Inquiry / CRM boundary

- **`InquiryV1`** (types): Full intake / protocol shape — id, timestamps, source, status, clarification state, opaque **`protocol`**. **Not** operational truth; **not** Core **`OrderVersion`**.
- **Neue Anfrage V1 (UI)**: **`InquiryIntake`** on **`HomePage`** — **frontend-only** soft protocol (no backend, persistence, routing, Core handoff). Blocks: Kontakt, Veranstaltung (incl. **Lieferadresse / Veranstaltungsort**), Wunsch/Bedarf, Zeit & Aufwand + rough **Vorlauf** (non-binding copy), kritische Punkte, **„Noch offen“** summary; **abweichende Rechnungsadresse** fields stay **only in inquiry local state** — **not** merged into **`orderContext.remarks`** (remarks = Veranstaltungsart / Service-Stil / Ernährung only).
- **Inquiry → Configurator**: **`InquiryToConfiguratorTransferV1`** with **`planning`** (**`ConfiguratorPlanningContextV1`**) + **`orderContextPrefill`** (**`ConfiguratorOrderContextPrefillV1`**). Planning drives persons, budget, optional single **`catalogModule`**; prefill fills company, contact, date, time, location, remarks. Aufwand / critical statuses / full protocol **do not** land in **`OfferDraft`**.
- **`ConfiguratorPlanningContextV1`**: Planning slice only (persons, budget, desired modules, dietary, event type, service style). Still **not** Core truth until promoted via controlled flows.
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
- **Prototype**: checklist + rough range implemented in **`InquiryIntake`** (local-only; not persisted).

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
4. **`item_kind`**: composite packages in JSON + **`Paket`** UI; client-side **`packages`** catalog filter.
5. **Neue Anfrage → Configurator**: **`InquiryIntake`**, **`InquiryToConfiguratorTransferV1`**, planning vs order-context prefill; billing **not** in remarks.
6. **Configurator UX**: **Angebotsbausteine** copy/chips; **`SearchFilters`** collapsed **Weitere Filter**; **`ItemCard`** collapsible details incl. **„Enthalten / Zusammensetzung“** from **`items_included`**; **`OrderContextCard`** **Anfrage-Kontext** read-only block for remarks.
7. **Catalog seed**: **Lunch Buffet No 1–3** composite **`items.json`** rows (flat **person** price, **`min_order` 10**); no V1 auto surcharge engine; demo packages **`[Demo]`**.

---

## Next focus

- Define/implement **Core ↔ Configurator** handoff so edits produce **`OrderVersion`** records with **print-confirmation** and **`READY_TO_SEND`** gates (backend contracts first).
- Align **catalog publication** so prototype **`items.json`** / **`CatalogItem`** either stays fixture-only or mirrors Core-published catalog intentionally.
- **Intake channel**: persist/promote inquiry protocol and billing fields via CRM/Core when the unified pipeline exists — frontend prototype remains **local-only** until then.
- Extend **Neue Anfrage** (persistence, validation, channel routing) **without** breaking the planning/prefill boundary into **`OfferDraft`**.

---

## What not to do now

- Do **not** treat **`OfferDraft`**, **`CatalogItem`**, or **`items.json`** as operational or acceptance authority.
- Do **not** let CRM or inquiry blobs replace **`OrderVersion`** semantics or skip **print confirmation**.
- Do **not** use **Wochenübersicht** or **kitchen kiosk** as authoritative editing surfaces (kiosk stays read-only MVP).
- Do **not** split intake into incompatible parallel truths — preserve **single controlled flow** from **wix_form / email / phone / manual**.
- Avoid implicit **`READY_TO_SEND`** releases without explicit gate policy.
- Do **not** treat inquiry-time **“geschätzter Vorlauf”** ranges as scheduling commitments or Core operational truth.

---

*Last updated: Document role section (recovery anchor, future docs/handoff split).*
