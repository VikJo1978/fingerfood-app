import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { HomePage } from "../HomePage";
import * as api from "../../services/api";
import { createInitialOfferDraft } from "../../types";
import type { CatalogItem } from "../../types";

const testItem: CatalogItem = {
  id: "item-1",
  name: "Fingerfood Paket",
  section: "Test",
  category: "Test",
  subcategory: null,
  price: 8,
  price_type: "piece",
  min_order: 1,
  unit_label: "Stück",
  description: "Testartikel.",
  items_included: null,
  module: "food",
  source_type: "internal",
  item_kind: "simple",
  pricing_mode: "per_piece",
  customization_mode: "fixed",
};

const SAVED_ID = "saved-draft-17";

function savedPayload() {
  const draft = createInitialOfferDraft();
  draft.persons = 37;
  draft.orderContext.companyName = "Backend Draft GmbH";
  draft.orderContext.contactPerson = "Ada Beispiel";
  draft.orderContext.eventDate = "2026-10-15";
  draft.budgetEnabled = true;
  draft.totalBudget = 1400;
  draft.budgetType = "total";
  draft.budgetBasis = "net";
  draft.budgetScope = "positions_only";
  return draft;
}

vi.mock("../../services/api", async () => {
  const actual = await vi.importActual<typeof import("../../services/api")>(
    "../../services/api"
  );
  return {
    ...actual,
    fetchItems: vi.fn(async () => [testItem]),
    listDrafts: vi.fn(),
    getDraft: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
  };
});

vi.mock("../../services/session", async () => {
  const actual = await vi.importActual<typeof import("../../services/session")>(
    "../../services/session"
  );
  return {
    ...actual,
    fetchUiSession: vi.fn(async () => ({
      status: "disabled" as const,
      state: {
        employee_auth_mode: "disabled" as const,
        authenticated: false,
        application_access_allowed: false,
        principal: null,
        csrf_token: null,
      },
    })),
  };
});

const listDraftsMock = vi.mocked(api.listDrafts);
const getDraftMock = vi.mocked(api.getDraft);
const createDraftMock = vi.mocked(api.createDraft);
const updateDraftMock = vi.mocked(api.updateDraft);

function savedRecord(payload: unknown = savedPayload()): api.SavedOfferDraft {
  return {
    id: SAVED_ID,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-25T11:00:00Z",
    status: "draft",
    source: "configurator",
    payload,
  };
}

async function openSavedDraft(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Entwürfe anzeigen" }));
  expect(await screen.findByText("Backend Draft GmbH")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Öffnen" }));
  await act(async () => {});
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = "";
  window.history.replaceState(null, "", "/");
  listDraftsMock.mockReset();
  getDraftMock.mockReset();
  createDraftMock.mockReset();
  updateDraftMock.mockReset();
  listDraftsMock.mockResolvedValue([savedRecord()]);
  getDraftMock.mockResolvedValue(savedRecord());
  updateDraftMock.mockResolvedValue(savedRecord());
  createDraftMock.mockResolvedValue(savedRecord());
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("saved backend draft restore", () => {
  it("lists saved drafts only when requested and opens one into the configurator", async () => {
    render(<HomePage />);
    await act(async () => {});

    expect(listDraftsMock).not.toHaveBeenCalled();
    await openSavedDraft();

    expect(listDraftsMock).toHaveBeenCalledTimes(1);
    expect(getDraftMock).toHaveBeenCalledWith(SAVED_ID);
    expect(screen.getByDisplayValue("Backend Draft GmbH")).toBeTruthy();
    expect(screen.getByDisplayValue("Ada Beispiel")).toBeTruthy();
    expect(screen.getByDisplayValue("37")).toBeTruthy();
    expect((screen.getByLabelText("Basis") as HTMLSelectElement).value).toBe("net");
    expect((screen.getByLabelText("Umfang") as HTMLSelectElement).value).toBe(
      "positions_only"
    );
    expect(screen.getByText("Gespeicherter Entwurf geöffnet.")).toBeTruthy();
  });

  it("uses the restored backend id for updates instead of creating a duplicate", async () => {
    render(<HomePage />);
    await act(async () => {});
    await openSavedDraft();

    fireEvent.click(screen.getByText("Weitere Aktionen"));
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await act(async () => {});

    expect(updateDraftMock).toHaveBeenCalledWith(SAVED_ID, expect.any(Object));
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("persists backend draft identity with the active manual session across reload", async () => {
    const first = render(<HomePage />);
    await act(async () => {});
    await openSavedDraft();
    await act(async () => {});
    first.unmount();

    render(<HomePage />);
    await act(async () => {});
    expect(await screen.findByDisplayValue("Backend Draft GmbH")).toBeTruthy();

    fireEvent.click(screen.getByText("Weitere Aktionen"));
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await act(async () => {});

    expect(updateDraftMock).toHaveBeenCalledWith(SAVED_ID, expect.any(Object));
    expect(createDraftMock).not.toHaveBeenCalled();
    expect(getDraftMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed saved payload and stays on the intake screen", async () => {
    const malformed = savedRecord({
      persons: 37,
      orderContext: { companyName: "Nicht vertrauen" },
    });
    listDraftsMock.mockResolvedValue([malformed]);
    getDraftMock.mockResolvedValue(malformed);

    render(<HomePage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Gespeicherte Entwürfe anzeigen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Öffnen" }));
    await act(async () => {});

    expect(
      screen.getByText(
        "Gespeicherter Entwurf ist beschädigt oder mit dieser Version nicht kompatibel."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Angebot vorbereiten" })).toBeTruthy();
    expect(screen.queryByDisplayValue("Backend Draft GmbH")).toBeNull();
  });

  it("starting a genuinely new manual offer forgets the restored backend id", async () => {
    render(<HomePage />);
    await act(async () => {});
    await openSavedDraft();

    fireEvent.click(screen.getAllByRole("button", { name: "Zurück zur Anfrage" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Angebot vorbereiten" }));
    await act(async () => {});

    fireEvent.click(screen.getByText("Weitere Aktionen"));
    fireEvent.click(screen.getByRole("button", { name: "Entwurf speichern" }));
    await act(async () => {});

    expect(createDraftMock).toHaveBeenCalledTimes(1);
  });
});
