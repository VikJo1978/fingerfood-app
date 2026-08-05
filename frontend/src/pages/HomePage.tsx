import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { ConfiguratorShell } from "../components/layout/ConfiguratorShell";
import { HeaderBar } from "../components/layout/HeaderBar";
import { InquiryHeroCard } from "../components/InquiryHeroCard";
import { InquiryIntake } from "../components/inquiry/InquiryIntake";
import { OrderContextCard } from "../components/OrderContextCard";
import { TopControls } from "../components/TopControls";
import { SearchFilters } from "../components/filters/SearchFilters";
import { ItemCard } from "../components/results/ItemCard";
import { OfferSummary } from "../components/summary/OfferSummary";
import type { CatalogModuleFilter, PriceTypeFilter } from "../services/api";
import { createDraft, fetchItems, updateDraft } from "../services/api";
import {
  fetchUiSession,
  sessionStatusMessage,
  type SessionBootstrapStatus,
} from "../services/session";
import { exchangeCoreHandoff } from "../services/handoff";
import type {
  CatalogItem,
  ChargesDefinition,
  InquiryToConfiguratorTransferV1,
  OfferLine,
  QuantityMode,
} from "../types";
import { createInitialOfferDraft } from "../types";
import { filterCatalog } from "../utils/filterCatalog";
import { UuidGenerationError, generateUuidV4 } from "../utils/uuid";
import {
  computeOfferLineTotal,
  computePauschalen,
  computeVatBreakdown,
  formatCurrency,
  isPieceUnitBasis,
} from "../utils/pricing";
import {
  buildOfferSnapshotRequest,
  prepareAndNavigateToCoreOffer,
  prepareOfferErrorMessage,
} from "../utils/offerSnapshotRequest";
import { buildProposalPayloadV1 } from "../utils/proposalExport";
import {
  clearStoredCoreInquiryHandoff,
  consumeCoreInquiryHandoff,
  readCoreInquiryHandoffHistoryMarker,
  readStoredCoreInquiryHandoff,
  storeCoreInquiryHandoff,
  CORE_INQUIRY_FRAGMENT_PREFIX,
} from "../utils/coreInquiryHandoff";
import { consumeCoreHandoffCode } from "../utils/coreEmployeeHandoff";
import {
  clearDraftFromSession,
  readDraftFromSession,
  readManualDraftHistoryMarker,
  saveDraftToSession,
  writeManualDraftHistoryMarker,
  type DraftPersistenceScope,
} from "../utils/draftPersistence";
import { formatDateDe } from "../utils/formatDate";
import { WarningBanner } from "../components/ui/WarningBanner";
import type { DietType } from "../constants/classification";

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PageMode = "inquiry" | "configurator";

type DraftSaveStatus = "idle" | "saving" | "saved" | "error";
type PrepareStatus = "idle" | "preparing" | "done" | "error";

export function HomePage() {
  const [pageMode, setPageMode] = useState<PageMode>("inquiry");
  const [offerDraft, setOfferDraft] = useState(createInitialOfferDraft);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const [importedInquiryId, setImportedInquiryId] = useState<string | null>(null);
  // Which sessionStorage key the active draft persists under — resolved
  // once we know whether this is a Core-Inquiry session or a manual one
  // (see utils/draftPersistence.ts). Starts "manual" since that's the
  // scope for a fresh, not-yet-resolved intake session.
  const [draftScope, setDraftScope] = useState<DraftPersistenceScope>({
    kind: "manual",
  });
  // Hero-card display only (see InquiryHeroCard) — not part of OrderContextV1
  // / OfferDraft, so it never reaches the Core prepare-offer payload.
  const [inquiryEventType, setInquiryEventType] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffExchangePending, setHandoffExchangePending] = useState(false);
  const [prepareStatus, setPrepareStatus] = useState<PrepareStatus>("idle");
  const [prepareMessage, setPrepareMessage] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionBootstrapStatus>("loading");
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionCsrfReady, setSessionCsrfReady] = useState(false);
  const [prepareContextId, setPrepareContextId] = useState<string | null>(null);
  const handoffBootstrapStarted = useRef(false);

  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [priceType, setPriceType] = useState<PriceTypeFilter>("");
  const [diet, setDiet] = useState<DietType | "">("");
  const [excludeAllergens, setExcludeAllergens] = useState("");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const [catalogModule, setCatalogModule] = useState<CatalogModuleFilter>("");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchItems({});
      setCatalog(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Laden fehlgeschlagen.");
      setCatalog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    void (async () => {
      const result = await fetchUiSession();
      setSessionStatus(result.status);
      setSessionNotice(sessionStatusMessage(result.status));
      setSessionCsrfReady(
        result.status === "authenticated" && !!result.state?.csrf_token
      );
    })();
  }, []);

  useEffect(() => {
    setSection("");
  }, [catalogModule]);

  const sectionOptions = useMemo(() => {
    let base = catalog;
    if (catalogModule === "food") {
      base = catalog.filter((i) => i.module === "food");
    } else if (catalogModule === "beverage") {
      base = catalog.filter((i) => i.module === "beverage");
    } else if (catalogModule === "staff") {
      base = catalog.filter((i) => i.module === "staff");
    } else if (catalogModule === "tableware") {
      base = catalog.filter((i) => i.module === "tableware");
    } else if (catalogModule === "equipment") {
      base = catalog.filter((i) => i.module === "equipment");
    } else if (catalogModule === "packages") {
      base = catalog.filter((i) => i.item_kind === "composite");
    }
    return Array.from(new Set(base.map((i) => i.section)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "de"));
  }, [catalog, catalogModule]);

  const visibleItems = useMemo(
    () =>
      filterCatalog(catalog, {
        search,
        section,
        priceType,
        diet,
        excludeAllergens,
        maxUnitPriceRaw: maxUnitPrice,
        module: catalogModule,
      }),
    [catalog, search, section, priceType, diet, excludeAllergens, maxUnitPrice, catalogModule]
  );

  const itemsById = useMemo(() => {
    const m: Record<string, CatalogItem> = {};
    for (const it of catalog) m[it.id] = it;
    return m;
  }, [catalog]);

  const { subtotal, pricePerPerson } = useMemo(() => {
    let sub = 0;
    for (const line of offerDraft.lines) {
      sub += computeOfferLineTotal(line, offerDraft.persons);
    }
    const ppp = offerDraft.persons > 0 ? sub / offerDraft.persons : 0;
    return { subtotal: Math.round(sub * 100) / 100, pricePerPerson: Math.round(ppp * 100) / 100 };
  }, [offerDraft.lines, offerDraft.persons]);

  const pauschalen = useMemo(
    () =>
      computePauschalen(
        subtotal,
        offerDraft.persons,
        offerDraft.lines.length > 0,
        offerDraft.chargesDefinition
      ),
    [subtotal, offerDraft.persons, offerDraft.lines.length, offerDraft.chargesDefinition]
  );

  const vat = useMemo(
    () => computeVatBreakdown(offerDraft, itemsById, pauschalen),
    [offerDraft, itemsById, pauschalen]
  );

  const clampPersons = (n: number) => Math.min(5000, Math.max(0, Math.round(n) || 0));

  const handlePrepareOffer = useCallback((transfer: InquiryToConfiguratorTransferV1) => {
    const { planning, orderContextPrefill: pre } = transfer;
    const remarksTrim = pre.remarks.trim();
    setOfferDraft((d) => ({
      ...d,
      persons: planning.persons === null ? d.persons : clampPersons(planning.persons),
      budgetEnabled: planning.budgetEnabled,
      totalBudget:
        planning.budgetEnabled && planning.budget != null
          ? Math.max(0, planning.budget)
          : d.totalBudget,
      orderContext: {
        ...d.orderContext,
        companyName: pre.companyName,
        contactPerson: pre.contactPerson,
        email: pre.email,
        phone: pre.phone,
        eventDate: pre.eventDate,
        eventTime: pre.eventTime,
        location: pre.location,
        billingAddress: pre.billingAddress.trim() ? pre.billingAddress.trim() : undefined,
        remarks: remarksTrim ? remarksTrim : undefined,
      },
    }));
    if (planning.desiredModules.length === 1) {
      setCatalogModule(planning.desiredModules[0]);
    }
    setInquiryEventType(planning.eventType.trim());
    setPageMode("configurator");
  }, []);

  /** InquiryIntake's own manual "weak protocol" form — an explicit,
   * standalone new draft, not a Core handoff. Clears any handoff still
   * cached in sessionStorage from a previous customer's Inquiry in this
   * tab before applying the manually-entered data, so it can never bleed
   * into (or later resurface for) this unrelated draft. Also: explicitly
   * starting a new draft here — resets to a fresh OfferDraft (not whatever
   * lines/budget a previous draft in this tab left behind) and clears any
   * persisted manual-scope draft, per the same "never bleed into an
   * unrelated draft" rule applied to sessionStorage persistence. */
  const onManualPrepareOffer = useCallback(
    (transfer: InquiryToConfiguratorTransferV1) => {
      clearStoredCoreInquiryHandoff();
      clearDraftFromSession({ kind: "manual" });
      setOfferDraft(createInitialOfferDraft());
      setImportedInquiryId(null);
      setPrepareContextId(null);
      setDraftScope({ kind: "manual" });
      writeManualDraftHistoryMarker(window.location, window.history);
      handlePrepareOffer(transfer);
    },
    [handlePrepareOffer]
  );

  useEffect(() => {
    if (sessionStatus === "loading" || handoffBootstrapStarted.current) {
      return;
    }
    handoffBootstrapStarted.current = true;
    let cancelled = false;

    /** Persisted-draft restore is a pure convenience layered on top of the
     * existing Core-handoff prefill: it never runs instead of
     * handlePrepareOffer, only after it, and — when a matching persisted
     * draft exists for the resolved scope — replaces the whole draft
     * wholesale with the operator's own more-complete in-progress editing
     * state (added lines, configured budget) rather than merging field by
     * field. Scope keying alone (see draftStorageKey) is what guarantees
     * this can never pull one Inquiry's saved state into another. */
    function restoreScopedDraft(scope: DraftPersistenceScope): void {
      const restored = readDraftFromSession(scope);
      if (restored !== null) {
        setOfferDraft(restored);
      }
      setDraftScope(scope);
    }

    async function bootstrapHandoff(): Promise<void> {
      if (sessionStatus === "disabled") {
        const result = consumeCoreInquiryHandoff(window.location, window.history);
        if (result.present) {
          if (result.handoff === null) {
            setHandoffError("Anfragedaten konnten nicht sicher übernommen werden.");
            return;
          }
          handlePrepareOffer(result.handoff.transfer);
          setImportedInquiryId(result.handoff.inquiry_id);
          setPrepareContextId(null);
          storeCoreInquiryHandoff(result.handoff);
          restoreScopedDraft({ kind: "inquiry", inquiryId: result.handoff.inquiry_id });
          return;
        }
        const marker = readCoreInquiryHandoffHistoryMarker(window.history);
        if (marker !== null) {
          const restored = readStoredCoreInquiryHandoff(marker.inquiry_id);
          if (restored !== null) {
            handlePrepareOffer(restored.transfer);
            setImportedInquiryId(restored.inquiry_id);
            setPrepareContextId(null);
            restoreScopedDraft({ kind: "inquiry", inquiryId: restored.inquiry_id });
          }
          return;
        }
        const manualMarker = readManualDraftHistoryMarker(window.history);
        if (manualMarker === null) return;
        const restoredManual = readDraftFromSession({ kind: "manual" });
        if (restoredManual !== null) {
          setOfferDraft(restoredManual);
          setDraftScope({ kind: "manual" });
          setPageMode("configurator");
        }
        return;
      }

      clearStoredCoreInquiryHandoff();

      if (window.location.hash.startsWith(CORE_INQUIRY_FRAGMENT_PREFIX)) {
        consumeCoreInquiryHandoff(window.location, window.history);
        setHandoffError("Unsigned Core-Handoff wird im Mitarbeiter-Modus abgewiesen.");
        return;
      }

      const result = consumeCoreHandoffCode(window.location, window.history);
      if (!result.present) {
        const manualMarker = readManualDraftHistoryMarker(window.history);
        if (manualMarker === null) return;
        const restoredManual = readDraftFromSession({ kind: "manual" });
        if (restoredManual !== null) {
          setOfferDraft(restoredManual);
          setDraftScope({ kind: "manual" });
          setPageMode("configurator");
        }
        return;
      }
      if (result.code === null) {
        setHandoffError("Core-Handoff konnte nicht sicher übernommen werden.");
        return;
      }
      if (sessionStatus !== "authenticated" || !sessionCsrfReady) {
        setHandoffError(sessionNotice ?? "Core-Handoff konnte nicht autorisiert werden.");
        return;
      }
      setHandoffExchangePending(true);
      setHandoffError(null);
      try {
        const exchanged = await exchangeCoreHandoff(result.code);
        if (cancelled) return;
        handlePrepareOffer(exchanged.transfer);
        setImportedInquiryId(null);
        setPrepareContextId(exchanged.context_id);
        restoreScopedDraft({ kind: "handoff", contextId: exchanged.context_id });
      } catch {
        if (!cancelled) {
          setHandoffError(
            "Core-Handoff konnte nicht bestätigt werden. Angebotsvorbereitung bleibt deaktiviert."
          );
        }
      } finally {
        if (!cancelled) {
          setHandoffExchangePending(false);
        }
      }
    }

    void bootstrapHandoff();
    return () => {
      cancelled = true;
    };
  }, [handlePrepareOffer, sessionCsrfReady, sessionNotice, sessionStatus]);

  // Persist the active draft on every change while in the Configurator —
  // the one place all seven required fields (positions, quantities, guest
  // count, budget amount/type/basis/scope) live together. Best-effort; see
  // saveDraftToSession.
  useEffect(() => {
    if (pageMode !== "configurator") return;
    saveDraftToSession(draftScope, offerDraft);
  }, [pageMode, draftScope, offerDraft]);

  const onAddLine = (
    item: CatalogItem,
    mode: QuantityMode,
    quantity: number,
    surchargeSelected: boolean
  ) => {
    let lineId: string;
    try {
      lineId = generateUuidV4();
    } catch (error) {
      if (error instanceof UuidGenerationError) {
        setAddItemError(
          "Position konnte nicht hinzugefügt werden: kein sicherer Zufallsgenerator verfügbar."
        );
        return;
      }
      throw error;
    }
    setAddItemError(null);
    const hasSurcharge = item.surcharge_amount != null && !!item.surcharge_label;
    const line: OfferLine = {
      lineId,
      itemId: item.id,
      quantityMode: mode,
      quantity,
      // Both preserved for export/API; line totals use `price_type` + `chosen_price` (unit basis).
      snapshot: {
        title: item.name,
        source_type: item.source_type,
        pricing_mode: item.pricing_mode,
        price_type: item.price_type,
        chosen_price: item.price,
        item_kind: item.item_kind,
        // Frozen even when the item has no surcharge (undefined) or wasn't
        // selected (false) — keeps the audit trail of what was offered.
        ...(hasSurcharge
          ? {
              surchargeSelected,
              surchargeLabel: item.surcharge_label,
              surchargeAmount: item.surcharge_amount,
            }
          : {}),
      } satisfies OfferLine["snapshot"],
    };
    setOfferDraft((d) => ({ ...d, lines: [...d.lines, line] }));
  };

  const onRemoveLine = (lineId: string) => {
    setOfferDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.lineId !== lineId) }));
  };

  const onLineQty = (lineId: string, q: number) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.lineId === lineId ? { ...l, quantity: Math.max(1, Math.round(q)) } : l
      ),
    }));
  };

  const onLineMode = (lineId: string, mode: QuantityMode) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.lineId !== lineId) return l;
        const def = mode === "total" ? 10 : 1;
        return { ...l, quantityMode: mode, quantity: def };
      }),
    }));
  };

  const onLineCustomizationNote = (lineId: string, note: string) => {
    setOfferDraft((d) => ({
      ...d,
      lines: d.lines.map((l) =>
        l.lineId === lineId
          ? { ...l, customizationNote: note === "" ? undefined : note }
          : l
      ),
    }));
  };

  const onChargesChange = useCallback((charges: ChargesDefinition) => {
    setOfferDraft((d) => ({ ...d, chargesDefinition: charges }));
  }, []);

  const createChargeLineId = useCallback(() => {
    try {
      return generateUuidV4();
    } catch {
      return `dishware-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
    }
  }, []);

  const exportPayload = () => {
    const lines = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lineTotal = computeOfferLineTotal(l, offerDraft.persons);
      const itemsIncluded = it?.items_included?.trim();
      return {
        lineId: l.lineId,
        itemId: l.itemId,
        name: it?.name ?? l.snapshot.title,
        snapshot: l.snapshot,
        quantityMode: l.quantityMode,
        quantity: l.quantity,
        lineTotal,
        ...(l.customizationNote?.trim() ? { customizationNote: l.customizationNote.trim() } : {}),
        ...(itemsIncluded ? { itemsIncluded } : {}),
      };
    });
    return {
      meta: {
        orderContext: offerDraft.orderContext,
        persons: offerDraft.persons,
        budgetEnabled: offerDraft.budgetEnabled,
        totalBudgetEUR: offerDraft.budgetEnabled ? offerDraft.totalBudget : null,
        subtotalEUR: subtotal,
        pricePerPersonEUR: pricePerPerson,
      },
      lines,
    };
  };

  const onExportJson = () => {
    downloadText(
      `angebot-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(exportPayload(), null, 2),
      "application/json"
    );
  };

  const onExportProposalJson = () => {
    // Guard (accepted 2026-07-08): the Office Panel's /proposal-preview
    // validates event_date, so exporting without one would produce a file
    // that predictably fails import. Abort with a hint instead — nothing is
    // persisted or sent anywhere either way.
    if (!offerDraft.orderContext.eventDate) {
      alert(
        "Büro-Export braucht ein Eventdatum: bitte zuerst im Auftragskontext " +
          "das Datum setzen."
      );
      return;
    }
    const payload = buildProposalPayloadV1(
      offerDraft,
      itemsById,
      pauschalen.grandTotal,
      vat.totalInclVat,
      currentDraftId
    );
    downloadText(
      `proposal-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  };

  const onSaveDraft = useCallback(async () => {
    setDraftSaveStatus("saving");
    setDraftSaveMessage(null);
    try {
      if (currentDraftId === null) {
        const saved = await createDraft(offerDraft);
        setCurrentDraftId(saved.id);
      } else {
        await updateDraft(currentDraftId, offerDraft);
      }
      setDraftSaveStatus("saved");
      setDraftSaveMessage("Entwurf gespeichert.");
    } catch (e) {
      setDraftSaveStatus("error");
      setDraftSaveMessage(
        e instanceof Error ? e.message : "Entwurf konnte nicht gespeichert werden"
      );
    }
  }, [currentDraftId, offerDraft]);

  const onPrepareInCore = useCallback(async () => {
    if (
      sessionStatus === "loading" ||
      sessionStatus === "not_authenticated"
      || sessionStatus === "access_denied" ||
      sessionStatus === "unavailable" ||
      (sessionStatus === "authenticated" && !sessionCsrfReady)
    ) {
      setPrepareStatus("error");
      setPrepareMessage(sessionNotice ?? "Mitarbeiteranmeldung erforderlich.");
      return;
    }
    if (!offerDraft.orderContext.eventDate) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte zuerst ein Eventdatum im Auftragskontext setzen.");
      return;
    }
    if (offerDraft.lines.length === 0) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte mindestens eine Position hinzufügen.");
      return;
    }
    if (offerDraft.persons <= 0) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte zuerst eine gültige Personenzahl eintragen.");
      return;
    }
    if (
      (offerDraft.chargesDefinition.buffet.baseMode === "PAUSCHALE" ||
        offerDraft.chargesDefinition.dishware.baseMode === "PAUSCHALE") &&
      offerDraft.persons <= 0
    ) {
      setPrepareStatus("error");
      setPrepareMessage("Pauschalen pro Person benötigen eine gültige Personenzahl.");
      return;
    }
    if (
      offerDraft.chargesDefinition.dishware.additionalLines.some(
        (line) => line.description.trim() === "" || line.description.length > 500
      )
    ) {
      setPrepareStatus("error");
      setPrepareMessage("Bitte zusätzliche Geschirrpositionen vollständig ausfüllen.");
      return;
    }
    setPrepareStatus("preparing");
    setPrepareMessage(null);
    try {
      const body =
        sessionStatus === "disabled"
          ? buildOfferSnapshotRequest(
              offerDraft,
              importedInquiryId,
              currentDraftId
            )
          : buildOfferSnapshotRequest(
              offerDraft,
              null,
              currentDraftId,
              prepareContextId
            );
      await prepareAndNavigateToCoreOffer(body, {
        onPrepared: (result) => {
          // Prepared successfully and about to navigate away to Core — the
          // handoff has done its job; clear it so it can't resurface for a
          // later, unrelated Configurator visit in this tab. Same for the
          // persisted draft: this Inquiry's Offer now exists in Core, so
          // there is nothing left in this Configurator session worth
          // restoring for it later.
          clearStoredCoreInquiryHandoff();
          clearDraftFromSession(draftScope);
          setPrepareContextId(null);
          setPrepareStatus("done");
          setPrepareMessage(
            `Angebot in Core vorbereitet (${result.offer_id.slice(0, 8)}).`
          );
        },
      });
    } catch (error) {
      setPrepareStatus("error");
      setPrepareMessage(prepareOfferErrorMessage(error));
    }
  }, [
    currentDraftId,
    draftScope,
    importedInquiryId,
    offerDraft,
    prepareContextId,
    sessionCsrfReady,
    sessionNotice,
    sessionStatus,
  ]);

  const canPrepareInCore =
    (
      (sessionStatus === "disabled" && importedInquiryId !== null) ||
      (sessionStatus === "authenticated" && sessionCsrfReady && prepareContextId !== null)
    ) && !handoffExchangePending;

  const onExportCsv = () => {
    const header =
      "Position;Bezug;Menge;Preisart;Stück-/Personenpreis EUR;Name;Zeilensumme EUR;Änderungswunsch";
    const rows = offerDraft.lines.map((l) => {
      const it = itemsById[l.itemId];
      const lt = computeOfferLineTotal(l, offerDraft.persons);
      const modeDe = l.quantityMode === "total" ? "Gesamt" : "Pro Person";
      const pt = isPieceUnitBasis(l.snapshot.price_type) ? "Stück" : "Person";
      const unitPrice = l.snapshot.chosen_price;
      const rawName = it?.name ?? l.snapshot.title;
      const name = `"${rawName.replace(/"/g, '""')}"`;
      const noteRaw = l.customizationNote?.trim() ?? "";
      const noteCol = `"${noteRaw.replace(/"/g, '""')}"`;
      return `${l.itemId};${modeDe};${l.quantity};${pt};${unitPrice};${name};${lt.toFixed(2)};${noteCol}`;
    });
    const csv = [header, ...rows.filter(Boolean)].join("\n");
    downloadText(
      `angebot-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  };

  const showPersonWarning = offerDraft.persons < 10;

  const heroTitle =
    inquiryEventType || offerDraft.orderContext.companyName.trim() || "Catering-Anfrage";
  const heroFacts = [
    offerDraft.orderContext.eventDate ? formatDateDe(offerDraft.orderContext.eventDate) : "",
    offerDraft.orderContext.location.trim(),
    `ca. ${offerDraft.persons} Gäste`,
  ].filter(Boolean);

  if (pageMode === "inquiry") {
    return (
      <AppShell>
        <div className="space-y-8">
          <HeaderBar
            title="Neue Anfrage erfassen"
            subtitle="Weiches Anfrage-Protokoll für die Akquise — ohne Speicherung. Anschließend starten Sie den Konfigurator mit den wichtigsten Standardwerten."
          />
          {handoffExchangePending ? (
            <WarningBanner message="Core-Handoff wird geprüft…" />
          ) : null}
          {handoffError ? <WarningBanner message={handoffError} /> : null}
          <InquiryIntake onPrepareOffer={onManualPrepareOffer} />
        </div>
      </AppShell>
    );
  }

  return (
    <ConfiguratorShell onBack={() => setPageMode("inquiry")} crumb={heroTitle}>
      <div className="space-y-5">
        {/* OFFER_PANE_FIXED_VIEWPORT_WORKSPACE_V1: a real fixed-height,
            overflow:hidden split workspace on desktop — not sticky. Sticky
            (the previous approach here) only pins *after* the page has
            been scrolled past its natural in-flow position, so the pane
            visibly travels with the document until that point; it also
            made the pane's height a guess (`max-h`) tuned for one specific
            scroll offset. Here the workspace itself is the fixed-size box
            (viewport height minus the TopBar (76px) and the content area's
            top padding (34px) = 110px, using 100dvh so mobile Safari's
            dynamic toolbar doesn't leave a stale gap), `overflow-hidden`
            so it is never itself a scroll container, and each column
            declares its own scroll region inside that fixed box: the left
            column (catalog/context) via `overflow-y-auto`, the right
            column (Offer pane) via `h-full` feeding OfferSummary's own
            existing fixed-header/scrollable-middle/fixed-footer structure.
            The document/body is never the scroll container for either —
            scrolling the catalog cannot move the Offer pane, because the
            Offer pane isn't positioned relative to document scroll at all
            anymore. Mobile/tablet (below `lg:`) keeps normal page flow —
            none of this applies below the breakpoint. */}
        <div className="grid gap-[22px] lg:h-[calc(100dvh-110px)] lg:grid-cols-[minmax(0,1.35fr)_minmax(420px,1fr)] lg:overflow-hidden">
          <div className="grid content-start gap-[22px] lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
            {importedInquiryId || prepareContextId ? (
              <WarningBanner
                message={
                  importedInquiryId
                    ? `Aus Core-Anfrage ${importedInquiryId.slice(0, 8)} vorbefüllt. Bitte alle Angaben prüfen — noch kein Auftrag und keine Kundenbenachrichtigung.`
                    : "Aus verifiziertem Core-Handoff vorbefüllt. Bitte alle Angaben prüfen — noch kein Auftrag und keine Kundenbenachrichtigung."
                }
              />
            ) : null}

            <InquiryHeroCard
              eyebrow="Angebot vorbereiten"
              title={heroTitle}
              facts={heroFacts}
              stateTitle="Angebot zusammenstellen"
              stateDescription="Entwurf — noch kein Auftrag, keine Kundenbenachrichtigung."
            />

            {showPersonWarning ? (
              <WarningBanner message="Hinweis: Viele Angebote und Positionen sind erst ab 10 Personen vorgesehen." />
            ) : null}

            {loadError ? <WarningBanner tone="danger" message={loadError} /> : null}

            {sessionNotice ? <WarningBanner message={sessionNotice} /> : null}

            {addItemError ? <WarningBanner tone="danger" message={addItemError} /> : null}

            <OrderContextCard
              orderContext={offerDraft.orderContext}
              onOrderContextChange={(patch) =>
                setOfferDraft((d) => ({
                  ...d,
                  orderContext: { ...d.orderContext, ...patch },
                }))
              }
            />

            <TopControls
              persons={offerDraft.persons}
              onPersonsChange={(n) =>
                setOfferDraft((d) => ({ ...d, persons: clampPersons(n) }))
              }
              budgetEnabled={offerDraft.budgetEnabled}
              onBudgetEnabledChange={(v) => setOfferDraft((d) => ({ ...d, budgetEnabled: v }))}
              totalBudget={offerDraft.totalBudget}
              onTotalBudgetChange={(n) =>
                setOfferDraft((d) => ({ ...d, totalBudget: Math.max(0, n) }))
              }
              budgetType={offerDraft.budgetType}
              onBudgetTypeChange={(v) => setOfferDraft((d) => ({ ...d, budgetType: v }))}
              budgetBasis={offerDraft.budgetBasis}
              onBudgetBasisChange={(v) => setOfferDraft((d) => ({ ...d, budgetBasis: v }))}
              budgetScope={offerDraft.budgetScope}
              onBudgetScopeChange={(v) => setOfferDraft((d) => ({ ...d, budgetScope: v }))}
            />

            <div className="space-y-0.5">
              <p className="text-[11px] font-extrabold uppercase tracking-[.08em] text-accent">
                Katalog
              </p>
              <h2 className="text-[15px] font-bold text-ink">Angebotsbausteine auswählen</h2>
            </div>
            <SearchFilters
              catalogModule={catalogModule}
              onCatalogModuleChange={setCatalogModule}
              search={search}
              onSearchChange={setSearch}
              section={section}
              onSectionChange={setSection}
              sections={sectionOptions}
              priceType={priceType}
              onPriceTypeChange={setPriceType}
              diet={diet}
              onDietChange={setDiet}
              excludeAllergens={excludeAllergens}
              onExcludeAllergensChange={setExcludeAllergens}
              maxUnitPrice={maxUnitPrice}
              onMaxUnitPriceChange={setMaxUnitPrice}
            />

            {loading ? (
              <p className="text-sm text-muted">Artikel werden geladen…</p>
            ) : (
              <div className="space-y-2">
                {visibleItems.length === 0 ? (
                  <p className="rounded-card border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">
                    Keine Treffer. Bitte Filter lockern oder Suche ändern.
                  </p>
                ) : (
                  visibleItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      persons={offerDraft.persons}
                      onAdd={onAddLine}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid content-start gap-[22px] lg:h-full lg:min-h-0">
            <OfferSummary
              draft={offerDraft}
              itemsById={itemsById}
              subtotal={subtotal}
              pricePerPerson={pricePerPerson}
              pauschalen={pauschalen}
              vat={vat}
              onQuantityChange={onLineQty}
              onModeChange={onLineMode}
              onCustomizationNoteChange={onLineCustomizationNote}
              onRemove={onRemoveLine}
              onChargesChange={onChargesChange}
              createChargeLineId={createChargeLineId}
              onExportJson={onExportJson}
              onExportCsv={onExportCsv}
              onExportProposalJson={onExportProposalJson}
              draftSaveStatus={draftSaveStatus}
              draftSaveMessage={draftSaveMessage}
              onSaveDraft={onSaveDraft}
              prepareStatus={prepareStatus}
              prepareMessage={prepareMessage}
              canPrepareInCore={canPrepareInCore}
              onPrepareInCore={onPrepareInCore}
            />
          </div>
        </div>

        <footer className="border-t border-line pt-6 text-center text-xs text-muted">
          Keine Buchung — nur Orientierung. Summen: {formatCurrency(subtotal)} · Status:
          Entwurf
        </footer>
      </div>
    </ConfiguratorShell>
  );
}
