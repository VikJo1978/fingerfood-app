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

## Accepted progress (snapshot)

- **Lunch Buffet No 1–8** from the **Silberlöffel 2026 PDF** are in **`items.json`** as **real composite** seed items (`lunch-buffet-2026-no-1` … **`no-8`**).
- In the **UI**, they show under **Baustein-Typ → Pakete** and section **Lunch Buffets**.
- Placeholder packages are **`[Demo]`** in the name and live under section **Demo Pakete**.
- **Backend API** sanity check: **`api_lunch_count` = 8** (accepted verification).
- **Local backend**: run with a **Python 3.13** **venv**; **avoid Python 3.14** for backend dependencies — **`pydantic-core`** fails to build there.
- **Composite Customization V1.1** (**accepted progress**): Implemented — **`OfferLineItem`** keeps **`customizationNote`** as **free text**; **placeholder** guides Büro with **Dessert tauschen:** / **Salat entfernen:** / **Starter hinzufügen:** / **Sonstiges:**. **Price stays provisional** and **must be checked internally**. **No** slots, **no** child editor, **no** automatic price delta, **no** backend/Core changes.
- **JSON export** (**accepted progress**): Includes **`itemsIncluded`** on each exported line when the catalog row has non-empty **`items_included`** — especially needed for **Lunch Buffets / Pakete** because **PDF / Angebotsvorschau** will need **package composition**. **`customizationNote`** remains exported. **CSV** export stays simple; **full package composition is JSON-only** for now. **No** PDF generation implemented yet.
- **Angebotsvorschau V1** (**accepted progress**): **Frontend-only** modal — opened from **`OfferSummary`** via **„Angebotsvorschau anzeigen“**; **not** PDF yet. Uses existing **`OfferDraft`**, **`itemsById`**, and **pricing** helpers only. Shows **Basisdaten**, **Positionen**, **Summen**, **Hinweise**; for **Pakete/Buffets**: **`items_included`** as **Zusammensetzung** when available; **`customizationNote`** / **Änderungswunsch** when present. **Semantics**: preview for **Büro** review only — **not** operational truth; **no** backend, persistence, Core handoff, or price-logic changes.
- **Draft Storage V1 Slice 1** (**accepted progress**): **Backend** JSON-file draft storage under **`backend/app/data/drafts/`** — draft **models**, **service**, **routes**, router registration in **`main.py`**. **API**: **`POST /api/drafts`**, **`GET /api/drafts`**, **`GET /api/drafts/{draft_id}`**, **`PUT /api/drafts/{draft_id}`**, **`DELETE /api/drafts/{draft_id}`**. **Payload** remains **opaque** planning data. **Draft** is **not** an **Order**, **not** an **`OrderVersion`**, **not** Core truth. **No** frontend integration yet. **API smoke check** accepted: **`/api/health`** returns **`ok`**; **`/api/drafts`** returns **`[]`**.

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
- **Packages / Buffets** = **`item_kind: composite`** lines; **v1 prototype**: flat catalog price only; **seed data**: **Lunch Buffet No 1–8** in **`items.json`** (PDF-aligned composition in **`items_included`**; **no** automatic Büffetpauschale / delivery / MwSt. calculation in V1). See **Architecture: Composite Customization V1** for **Änderungswunsch** / structured pricing path.

---

## Accepted concept: Angebotsvorschau V1

**Direction:** Before implementing **PDF** generation, the prototype should first provide an **HTML / in-browser** **Angebotsvorschau**.

**Purpose:**

- **Human-readable** offer preview for **Büro** review.  
- **Future basis** for **PDF** generation (same logical content).  
- Uses existing **`OfferDraft`** / **export-shaped** data (no new SSOT).  
- **Does not** become **operational truth** — same boundary as **`OfferDraft`**.

**V1 content (planned):**

- **Basisdaten**: **Firma**, **Ansprechpartner**, **Datum**, **Uhrzeit**, **Ort**, **Personen**.  
- **Positionen**: **name**, **quantity**, **price**, **line total**.  
- **Pakete / Buffets**: show **`itemsIncluded`** / **Zusammensetzung** when present.  
- **Pakete / Buffets**: show **`customizationNote`** / **Änderungswunsch** when present.  
- **Hinweise** (visible disclaimer block):  
  - **Änderungen am Paket müssen intern geprüft werden**  
  - **Preis bleibt vorläufig**  
  - **Büffetpauschale** / **Anlieferung** / **MwSt.** are **not** automatically calculated in V1  

**Boundaries:**

- **Frontend-only**  
- **No** backend  
- **No** persistence  
- **No** PDF generation yet  
- **No** Core handoff  
- **No** price logic changes  

---

## Accepted architecture direction: Draft Storage V1

**Decision:** The **next persistence step** should be **backend Draft Storage V1**, **not** frontend **`localStorage`**.

**Reason:** Work done now should remain **reusable later**. **`localStorage`** is acceptable for **throwaway demos**, but **not** the main project direction.

### Draft Storage V1 semantics

- **Draft** is a saved **planning artifact** / **Angebotsentwurf**.  
- **Draft** is **NOT** an **Order**.  
- **Draft** is **NOT** an **`OrderVersion`**.  
- **Draft** is **NOT** Core truth.  
- **Draft** does **not** create operational acceptance.  
- **Draft** does **not** bypass **print confirmation** or **`READY_TO_SEND`** gates.  

### Preferred V1 storage

- **Backend JSON file storage**  
- Path idea: **`backend/app/data/drafts/*.json`**  
- **Later migratable** to DB  

### Preferred API direction

- **`POST /api/drafts`**  
- **`GET /api/drafts`**  
- **`GET /api/drafts/{draft_id}`**  
- **`PUT /api/drafts/{draft_id}`**  
- **`DELETE /api/drafts/{draft_id}`**  

### Preferred reusable record shape

- **`id`**  
- **`createdAt`**  
- **`updatedAt`**  
- **`status`**: **`draft`**  
- **`source`**: **`configurator`**  
- **`payload`**:  
  - **`orderContext`**  
  - **`persons`**  
  - **`budgetEnabled`**  
  - **`totalBudget`**  
  - **`lines`**  
  - **`customizationNote`** on composite lines when present  
  - **Item snapshots** needed for preview / PDF continuity  

### Future path

- A **saved Draft** may later be **promoted** into a **Core candidate `OrderVersion`** through a **controlled promotion** flow.  
- **Promotion** is **future work** and must remain **Core-owned**.  

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

### Accepted decision (snapshot)

**Current accepted direction:**

- V1 keeps **free-text** **`customizationNote`** on composite offer lines.  
- **Price remains provisional.**  
- Office sees **„Preis intern prüfen“**.  
- **No** automatic price delta.  
- **No** slots.  
- **No** child editor.  
- **No** Core implementation **in this step**.  

**Next safe step:**

- **V1.1** should **not** introduce full component slots yet.  
- Instead, improve **Änderungswunsch** UX with **template prompts / helper text**, e.g.: **Dessert tauschen:** / **Salat entfernen:** / **Starter hinzufügen:** / **Sonstiges:**  

**Later:**

- **V1.2** — **accepted concept** (subsection below): semi-structured customization input.  
- **V2** — real **component slots**, priced replacements/add-ons, and **Core-owned** acceptance.  

### Accepted concept: Composite Customization V1.2

**Concept:** **V1.2** should move from **one** free-text **Änderungswunsch** toward a **semi-structured** customization **form** for **composite** offer lines (still **prototype / local** editing — same role as today’s note).

**V1.2 fields / prompts (planned):**

- Dessert tauschen  
- Salat / Vorspeise entfernen  
- Starter hinzufügen  
- Hauptgericht ersetzen  
- Vegetarische / vegane Alternative  
- Sonstiges  

**Required semantics (V1.2 design constraints):**

- Still **planning-only** — **not** operational truth.  
- **Price remains provisional.**  
- **Show / preserve** copy: **„Preis bleibt vorläufig. Änderungen müssen intern geprüft werden.“**  
- **No** backend  
- **No** persistence  
- **No** slots  
- **No** child editor  
- **No** automatic price delta  
- **No** Core / **`OrderVersion`** implementation  

**Position in roadmap (accepted):**

- **V1.1** — free-text **`customizationNote`** with **helper / template placeholder**.  
- **V1.2** — **semi-structured** customization input (this concept).  
- **V2** — real **component slots** + **priced** replacements/add-ons + **Core-owned** acceptance.  

---

## Configurator implementation (prototype progress)

- Catalog fetch, filters (search, section, price type, diet, allergens exclusion, max unit price, module).
- **`items.json` (prototype)**: **Lunch Buffet No 1–8** (`lunch-buffet-2026-no-1` … **`no-8`**) as **PDF-derived** composite rows — **`item_kind` composite**, **`module` food**, **`price_type` person**, **`min_order` 10**; flat **Paketpreis** only; **no** automatic **Büffetpauschale** / **Anlieferung** / **MwSt.** calculation in V1 (text in **`items_included`** only). Legacy placeholder packages marked **`[Demo]`** / section **Demo Pakete**. **API check**: **`api_lunch_count` = 8** (verified).
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
7. **Catalog seed**: **Lunch Buffet No 1–8** composite **`items.json`** rows; **`api_lunch_count` = 8** verified; demo packages **`[Demo]`** / **Demo Pakete**; local backend on **Python 3.13 venv** (not **3.14** — **`pydantic-core`** build break).

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

*Last updated: Draft Storage V1 Slice 1 implemented (backend); Draft Storage V1 architecture direction; Angebotsvorschau V1 implemented (modal); JSON export `itemsIncluded`; Lunch Buffet 1–8 seed, API count, Python 3.13 venv note.*

---

## Accepted progress: Test baseline + pricing parity guard (2026-07-05)

- **Backend tests** (`backend/tests/`, run: `cd backend && .venv/bin/pytest tests/ -q`): pricing service (line totals, warnings, subtotal/per-person, unknown-item, global low-person info), catalog filters over the real `items.json` via HTTP TestClient (36 items, 8 Lunch Buffets, diet/allergen/price/module/search/sections), draft storage (CRUD, path-traversal rejection, corrupted-file tolerance, sort order with controlled clock). **27 passed.**
- **Frontend tests** (vitest, run: `cd frontend && npm test`): pricing unit + snapshot-based line totals, `normalizeCatalogItem` defensive normalization (defaults, guards, allergen sanitizing, foodish/non-foodish split). **20 passed.** `npm run build` stays green.
- **Pricing parity guard** (`shared/pricing_fixtures.json`): one golden fixture set checked by BOTH pytest and vitest against their respective pricing implementations (totals + warning codes). If either side's formula changes without the other, its test suite fails. This is the containment for the known duplication of pricing logic (Python `pricing_service` vs TS `utils/pricing`).
- **Accepted direction (not yet implemented):** when pricing grows beyond flat lines (Büffetpauschale, Anlieferung, MwSt.), the **backend becomes the single authoritative calculator** (`/api/offer/calculate`); the frontend keeps instant display marked *vorläufig*. The parity guard covers only the current flat formulas and must not be stretched to cover diverging ones.
- Boundaries unchanged: drafts are not Orders/OrderVersions/Core truth; catalog remains a development fixture.

---

## Accepted progress: Angebotsvorschau print/PDF + catalog composite audit (2026-07-06)

- **Real gap found while testing office usability**: kitchen has no path to receive
  composition (dish content) at all — the office panel's Küchenzettel (separate
  repo) carries no dish info, and the Angebotsvorschau modal here had no print/PDF
  affordance whatsoever (verified: no `window.print`, no `@media print` existed
  anywhere in the frontend before this step).
- **Angebotsvorschau print/PDF** (accepted progress): added a "Drucken / PDF"
  button; global `@media print` rule (`index.css`) hides everything except
  `[data-print-root]` (the preview card), with Tailwind `print:` variants
  resetting the modal's max-height/overflow/shadow so full content flows across
  pages. Browser's native "Print to PDF" produces the actual PDF — no PDF library
  added (smallest safe fix, per reviewed plan: print step first, kitchen
  integration deferred).
- **Catalog composite/item_kind audit** (accepted progress, `backend/tests/test_catalog_composite_consistency.py`):
  found by hand while testing — "Warmes Fingerfood-Buffet" (`buffet-finger`)
  shows no composition in the Angebotsvorschau despite having `items_included`,
  because `items_included` is overloaded for two meanings (real dish
  composition vs. a logistics/service note) and this item is `item_kind: simple`.
  Also found: `paket-getraenke-standard`, `paket-buffet-business` (composite,
  but items_included is a one-line service note, not a dish list — would show
  under a misleading "ZUSAMMENSETZUNG" heading) and `paket-service-empfang`
  (composite with empty items_included — the "Paket" badge implies composition
  that never renders). These four are catalog **data** questions, not code bugs
  — the test documents them by name (`KNOWN_COMPOSITE_WITHOUT_REAL_DISH_LIST`,
  `KNOWN_PACKAGE_LIKE_BUT_SIMPLE`) and fails if the set ever changes (fixed or
  regressed) without a deliberate update to this file — a catalog owner decision,
  not something guessed here.
- Backend: 29 tests passing (was 27). Frontend: 20 passing (unchanged), build green.
- **Still open** (deferred, not done here): composition still does not reach the
  kitchen's Küchenzettel — that remains its own accepted step per
  CONFIGURATOR_EXECUTION_PACK_V1 (catering-system repo) §3/§4, only after the
  four catalog items above are reviewed by a catalog owner.

---

## Accepted progress: real Silberlöffel catalog rebuild + Pauschalen (2026-07-06)

- **Full catalog replacement**: the entire 36-item placeholder catalog (incl.
  the three "[Demo]"-prefixed packages under "Demo Pakete") was deleted and
  rebuilt from three real source menus: Cateringangebot.pdf (34 pages),
  Lunch_Buffets_2026.pdf (8 buffets; Lunch_Buffets1_2026.pdf confirmed an
  identical duplicate), and Mittagsmenue.pdf (own "Mittagsmenue" section:
  M1-M10 + M3+/M10+/M10++ addons, D1-D4 desserts included in the menu price,
  S1/S2 salads, bread). **201 real items**, authored via
  `backend/scripts/build_items.py` (reviewable Python source, not hand-typed
  JSON) — 61 composite (buffets/packages with full Kalt/Warm/Dessert
  compositions transcribed from source), 140 simple.
- **Allergen safety decision (owner-approved)**: none of the three source
  PDFs contain structured allergen/ingredient data — only prose descriptions
  and occasional "vegetarisch/vegan" tags. Per explicit instruction, allergens
  are NOT guessed. `Item.allergens_verified: bool = False` was added to the
  schema (mirrored as `CatalogItem.allergens_verified` on the frontend); every
  real item gets `False`. Allergens/ingredient_flags are derived only via a
  literal, auditable keyword scan (`backend/scripts/derive_allergens.py`,
  not a runtime module — a content-authoring tool). UI shows a loud warning
  wherever allergens are displayed (ItemCard detail view; Angebotsvorschau
  Hinweise) — "nur automatisch aus der Beschreibung abgeleitet, nicht
  küchenseitig geprüft". `allergens_verified=True` is reserved for a future
  human-reviewed state; a test asserts no item currently claims it.
- **Catalog consistency audit rewritten** (`test_catalog_composite_consistency.py`):
  the old known-gaps (three "[Demo]" packages) no longer exist — the file was
  rewritten, not patched, with the known-sets now empty (verified zero
  findings of that class on the real catalog). Same discipline as before: the
  test fails if the sets ever change without a deliberate update.
- **Pauschalen — real V1 automatic calculation** (owner-approved, replacing
  the former "not automatically calculated" Hinweis): Büffetpauschale
  0,50 €/person, Geschirrpauschale 2,00 €/person (both consistent across all
  three source PDFs), Anliefergebühr 35,00 € flat — chosen as the
  delivery+pickup figure from the Mittagsmenue T&Cs (vs. the 30,00 €
  delivery-only figure seen elsewhere), scoped to the source's stated
  standard zone (Innenstadt Hamburg, barrierefrei, ohne Treppen, direkt
  anfahrbar) and noted as such in the UI — not a universal formula. Applied
  unconditionally per offer in V1 (not conditioned on pickup vs. delivery or
  order size — documented in code as an approximation).
  - Backend: `OfferResponse` gained `buffetpauschale`, `geschirrpauschale`,
    `anlieferung`, `grand_total` (additive, non-breaking).
  - Frontend: `computePauschalen()` in `utils/pricing.ts` mirrors the backend
    constants exactly; both checked against new `pauschalen_cases` in
    `shared/pricing_fixtures.json` (same parity-guard mechanism as the
    existing line-pricing fixtures).
  - UI: Summen sections (sidebar `OfferSummary` and `OfferPreview` modal) show
    the full breakdown and a grand total.
- Backend: 32 tests passing (was 29). Frontend: 22 passing, build green.
- Boundaries unchanged: still no configurator→Core bridge, drafts still not
  Orders/OrderVersions, catalog still a fixture Core does not own (per
  CONFIGURATOR_EXECUTION_PACK_V1 in the catering-system repo).
