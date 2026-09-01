import type { OfferDraft } from "../types";
import { paymentMethodBlocker } from "./paymentMethod";
import { prepareFulfillmentBlocker } from "./offerSnapshotRequest";

export type OfficeNextActionKind =
  | "persons"
  | "positions"
  | "fulfillment"
  | "event_date"
  | "delivery_time"
  | "event_start"
  | "return_logistics"
  | "charges"
  | "payment"
  | "ready";

export interface OfficeNextAction {
  kind: OfficeNextActionKind;
  title: string;
  description: string;
  actionLabel?: string;
  hardBlocker: boolean;
}

const CANONICAL_LOCAL_TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function exactEventStart(draft: OfferDraft): string {
  const explicit = draft.orderContext.eventStart?.trim() ?? "";
  if (CANONICAL_LOCAL_TIME_RE.test(explicit)) return explicit;

  const legacy = draft.orderContext.eventTime.trim();
  if (CANONICAL_LOCAL_TIME_RE.test(legacy)) return legacy;
  return legacy.match(/^((?:[01]\d|2[0-3]):[0-5]\d)\s*[–-]/)?.[1] ?? "";
}

function exactDeliveryTime(draft: OfferDraft): string {
  const explicit = draft.orderContext.deliveryTime?.trim() ?? "";
  if (CANONICAL_LOCAL_TIME_RE.test(explicit)) return explicit;

  const legacy = draft.orderContext.deliveryWindowStart?.trim() ?? "";
  return CANONICAL_LOCAL_TIME_RE.test(legacy) ? legacy : "";
}

function invalidReturnLogistics(draft: OfferDraft): boolean {
  const current = draft.chargesDefinition.returnLogistics;
  if (current?.mode !== "SAME_DAY") return false;

  if (
    current.pickupWindowText?.trim() === "" ||
    current.pickupWindowText == null ||
    !Number.isInteger(current.sameDayFeeCents) ||
    current.sameDayFeeCents < 0
  ) {
    return true;
  }

  const start = current.pickupWindowStartLocal?.trim() ?? "";
  const end = current.pickupWindowEndLocal?.trim() ?? "";
  return Boolean(start) !== Boolean(end) || Boolean(start && end && start >= end);
}

function invalidDishwareLines(draft: OfferDraft): boolean {
  return draft.chargesDefinition.dishware.additionalLines.some(
    (line) =>
      line.description.trim() === "" ||
      line.description.length > 500 ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      !Number.isInteger(line.unitNetCents) ||
      line.unitNetCents < 0
  );
}

export function getOfficeNextAction(draft: OfferDraft): OfficeNextAction {
  if (!(Number.isInteger(draft.persons) && draft.persons > 0)) {
    return {
      kind: "persons",
      title: "Personenzahl festlegen",
      description: "Bitte eine gültige Personenzahl eintragen.",
      actionLabel: "Personenzahl eintragen",
      hardBlocker: true,
    };
  }

  if (draft.lines.length === 0) {
    return {
      kind: "positions",
      title: "Positionen auswählen",
      description: "Bitte mindestens eine Position zum Angebot hinzufügen.",
      actionLabel: "Zum Katalog",
      hardBlocker: true,
    };
  }

  const fulfillmentBlocker = prepareFulfillmentBlocker(draft.chargesDefinition);
  if (fulfillmentBlocker !== null) {
    return {
      kind: "fulfillment",
      title: "Erfüllung festlegen",
      description: fulfillmentBlocker,
      actionLabel: "Jetzt festlegen",
      hardBlocker: true,
    };
  }

  if (!draft.orderContext.eventDate.trim()) {
    return {
      kind: "event_date",
      title: "Veranstaltungsdatum ergänzen",
      description: "Bitte das Datum der Veranstaltung im Auftragskontext eintragen.",
      actionLabel: "Datum ergänzen",
      hardBlocker: true,
    };
  }

  const fulfillmentMode =
    draft.chargesDefinition.delivery.fulfillment?.fulfillmentMode ?? "UNKNOWN";
  if (fulfillmentMode === "DELIVERY" && !exactDeliveryTime(draft)) {
    return {
      kind: "delivery_time",
      title: "Lieferzeit ergänzen",
      description:
        "Die genaue Lieferzeit fehlt noch. Bitte ergänzen, sobald sie bekannt ist. Sie bleibt ein Hinweis und blockiert die Vorbereitung nicht.",
      actionLabel: "Lieferzeit ergänzen",
      hardBlocker: false,
    };
  }

  if (!exactEventStart(draft)) {
    return {
      kind: "event_start",
      title: "Beginn der Veranstaltung ergänzen",
      description:
        "Der genaue Veranstaltungsbeginn fehlt noch. Bitte ergänzen, sobald er bekannt ist. Er bleibt ein Hinweis und blockiert die Vorbereitung nicht.",
      actionLabel: "Beginn ergänzen",
      hardBlocker: false,
    };
  }

  if (invalidReturnLogistics(draft)) {
    return {
      kind: "return_logistics",
      title: "Rückholung vervollständigen",
      description:
        "Die Rückholung am Veranstaltungstag ist noch unvollständig. Bitte Abholfenster und Angaben prüfen.",
      actionLabel: "Rückholung bearbeiten",
      hardBlocker: true,
    };
  }

  if (invalidDishwareLines(draft)) {
    return {
      kind: "charges",
      title: "Geschirrpositionen vervollständigen",
      description:
        "Mindestens eine zusätzliche Geschirrposition ist unvollständig. Bitte Beschreibung, Anzahl und Preis prüfen.",
      actionLabel: "Geschirr bearbeiten",
      hardBlocker: true,
    };
  }

  if (paymentMethodBlocker(draft.orderContext.companyName, draft.paymentMethod) !== null) {
    return {
      kind: "payment",
      title: "Zahlungsart wählen",
      description: "Bitte die Zahlungsart für dieses Angebot festlegen.",
      actionLabel: "Zahlungsart wählen",
      hardBlocker: true,
    };
  }

  return {
    kind: "ready",
    title: "Bereit für Core",
    description: "Alle aktuell erforderlichen Angaben für die Vorbereitung sind vorhanden.",
    hardBlocker: false,
  };
}

export function officePrepareHardBlocked(draft: OfferDraft): boolean {
  if (!(Number.isInteger(draft.persons) && draft.persons > 0)) return true;
  if (draft.lines.length === 0) return true;
  if (prepareFulfillmentBlocker(draft.chargesDefinition) !== null) return true;
  if (!draft.orderContext.eventDate.trim()) return true;
  if (invalidReturnLogistics(draft)) return true;
  if (invalidDishwareLines(draft)) return true;
  return paymentMethodBlocker(draft.orderContext.companyName, draft.paymentMethod) !== null;
}
