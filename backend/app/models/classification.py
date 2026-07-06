"""Structured diet, ingredient flags, and allergen declarations."""

from enum import Enum

from pydantic import BaseModel, ConfigDict


class DietType(str, Enum):
    vegetarian = "vegetarian"
    vegan = "vegan"
    pescetarian = "pescetarian"
    omnivore = "omnivore"


class Allergen(str, Enum):
    gluten = "gluten"
    milk = "milk"
    egg = "egg"
    soy = "soy"
    nuts = "nuts"
    peanuts = "peanuts"
    sesame = "sesame"
    fish = "fish"
    crustaceans = "crustaceans"
    celery = "celery"
    mustard = "mustard"
    sulfites = "sulfites"
    lupin = "lupin"
    molluscs = "molluscs"


ALLERGEN_CODES: frozenset[str] = frozenset(a.value for a in Allergen)

# German display labels. Must stay in sync with
# frontend/src/constants/classification.ts ALLERGEN_LABELS_DE (parity-checked
# by test_allergen_labels_match_frontend). Used to let a search for an
# allergen-group word (e.g. "fisch") also match items via their already
# audited `allergens` list (see scripts/derive_allergens.py) — not a new
# keyword list, just reusing that one.
ALLERGEN_LABELS_DE: dict[Allergen, str] = {
    Allergen.gluten: "Gluten",
    Allergen.milk: "Milch",
    Allergen.egg: "Ei",
    Allergen.soy: "Soja",
    Allergen.nuts: "Schalenfrüchte",
    Allergen.peanuts: "Erdnüsse",
    Allergen.sesame: "Sesam",
    Allergen.fish: "Fisch",
    Allergen.crustaceans: "Krebstiere",
    Allergen.celery: "Sellerie",
    Allergen.mustard: "Senf",
    Allergen.sulfites: "Sulfite",
    Allergen.lupin: "Lupinen",
    Allergen.molluscs: "Weichtiere",
}


class IngredientFlags(BaseModel):
    """Declared ingredients / composition flags (boolean)."""

    model_config = ConfigDict(extra="forbid")

    contains_meat: bool = False
    contains_pork: bool = False
    contains_poultry: bool = False
    contains_beef: bool = False
    contains_fish: bool = False
    contains_shellfish: bool = False
    contains_dairy: bool = False
    contains_egg: bool = False
    contains_honey: bool = False
    contains_alcohol: bool = False
    contains_gelatin: bool = False
