import type { CatalogItem, OfferDraft, OfferLine } from "../types";

export interface DraftCatalogReconciliationResult {
  draft: OfferDraft;
  reconciledTitles: string[];
  unresolvedTitles: string[];
}

function currentLineSnapshot(line: OfferLine, item: CatalogItem): OfferLine["snapshot"] {
  const hasSurcharge = item.surcharge_amount != null && !!item.surcharge_label;
  return {
    title: item.name,
    source_type: item.source_type,
    pricing_mode: item.pricing_mode,
    price_type: item.price_type,
    chosen_price: item.price,
    item_kind: item.item_kind,
    ...(hasSurcharge
      ? {
          surchargeSelected: line.snapshot.surchargeSelected ?? false,
          surchargeLabel: item.surcharge_label,
          surchargeAmount: item.surcharge_amount,
        }
      : {}),
  };
}

export function reconcileDraftCatalogLines(
  draft: OfferDraft,
  catalog: CatalogItem[]
): DraftCatalogReconciliationResult {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const byExactTitle = new Map<string, CatalogItem[]>();
  for (const item of catalog) {
    const bucket = byExactTitle.get(item.name) ?? [];
    bucket.push(item);
    byExactTitle.set(item.name, bucket);
  }

  const reconciledTitles: string[] = [];
  const unresolvedTitles: string[] = [];
  const lines = draft.lines.map((line) => {
    if (byId.has(line.itemId)) return line;

    const matches = byExactTitle.get(line.snapshot.title) ?? [];
    if (matches.length !== 1) {
      unresolvedTitles.push(line.snapshot.title);
      return line;
    }

    const item = matches[0];
    reconciledTitles.push(line.snapshot.title);
    return {
      ...line,
      itemId: item.id,
      snapshot: currentLineSnapshot(line, item),
    };
  });

  return {
    draft: { ...draft, lines },
    reconciledTitles,
    unresolvedTitles,
  };
}
