export const DIET_TYPES = ["vegetarian", "vegan", "pescetarian", "omnivore"] as const;
export type DietType = (typeof DIET_TYPES)[number];

export const DIET_LABELS_DE: Record<DietType, string> = {
  vegetarian: "Vegetarisch",
  vegan: "Vegan",
  pescetarian: "Pescetarisch",
  omnivore: "Omnivor",
};

export const ALLERGENS = [
  "gluten",
  "milk",
  "egg",
  "soy",
  "nuts",
  "peanuts",
  "sesame",
  "fish",
  "crustaceans",
  "celery",
  "mustard",
  "sulfites",
  "lupin",
  "molluscs",
] as const;
export type AllergenCode = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS_DE: Record<AllergenCode, string> = {
  gluten: "Gluten",
  milk: "Milch",
  egg: "Ei",
  soy: "Soja",
  nuts: "Schalenfrüchte",
  peanuts: "Erdnüsse",
  sesame: "Sesam",
  fish: "Fisch",
  crustaceans: "Krebstiere",
  celery: "Sellerie",
  mustard: "Senf",
  sulfites: "Sulfite",
  lupin: "Lupinen",
  molluscs: "Weichtiere",
};

export const INGREDIENT_FLAG_KEYS = [
  "contains_meat",
  "contains_pork",
  "contains_poultry",
  "contains_beef",
  "contains_fish",
  "contains_shellfish",
  "contains_dairy",
  "contains_egg",
  "contains_honey",
  "contains_alcohol",
  "contains_gelatin",
] as const;
export type IngredientFlagKey = (typeof INGREDIENT_FLAG_KEYS)[number];

export const INGREDIENT_FLAG_LABELS_DE: Record<IngredientFlagKey, string> = {
  contains_meat: "Fleisch",
  contains_pork: "Schweinefleisch",
  contains_poultry: "Geflügel",
  contains_beef: "Rind",
  contains_fish: "Fisch",
  contains_shellfish: "Schalentiere",
  contains_dairy: "Milchprodukte",
  contains_egg: "Ei",
  contains_honey: "Honig",
  contains_alcohol: "Alkohol",
  contains_gelatin: "Gelatine",
};
