import {
  DIET_LABELS_DE,
  INGREDIENT_FLAG_KEYS,
  INGREDIENT_FLAG_LABELS_DE,
  type DietType,
  type IngredientFlagKey,
} from "../constants/classification";
import type { IngredientFlags } from "../types";

export function dietLabelDe(d: DietType | undefined): string {
  if (!d) return DIET_LABELS_DE.omnivore;
  return DIET_LABELS_DE[d] ?? DIET_LABELS_DE.omnivore;
}

export function activeIngredientLabels(
  flags: IngredientFlags | undefined | null
): { key: IngredientFlagKey; label: string }[] {
  if (!flags) return [];
  const out: { key: IngredientFlagKey; label: string }[] = [];
  for (const key of INGREDIENT_FLAG_KEYS) {
    if (flags[key]) out.push({ key, label: INGREDIENT_FLAG_LABELS_DE[key] });
  }
  return out;
}
