"""Deterministic, auditable allergen/ingredient-flag derivation from German menu
text. Used only to author items.json from the real Silberlöffel PDFs — this is
NOT a runtime app module and NOT a food-safety declaration mechanism.

Every item built with this deliberately gets allergens_verified=False: the
keyword lists below are a best-effort, reviewable substring match over the
literal menu description, not a checked ingredient audit. A human (kitchen/
catalog owner) must review before any of this is relied on for a client with
a declared allergy.
"""

from __future__ import annotations

# Keyword -> Allergen code (EU 14). Case-insensitive substring match on the
# combined name + description + items_included text. Deliberately narrow:
# only literal, unambiguous German menu words. No inference from dish "style"
# (e.g. "Mousse" is not auto-flagged egg, since several here are vegan).
ALLERGEN_KEYWORDS: dict[str, list[str]] = {
    "gluten": [
        "brot", "brötchen", "baguette", "nudel", "spätzle", "gnocchi", "penne",
        "farfalle", "makkaroni", "tagliatelle", "teigtasche", "blätterteig",
        "pizza", "quiche", "bisquit", "biskuit", "croûton", "wan tan",
        "tortilla", "bagel", "sandwich", "canapé", "wrap", "kuchen", "torte",
        "strudel", "gebäck", "laugengebäck", "grissini", "panade", "cornflakes",
    ],
    "milk": [
        "käse", "sahne", "parmesan", "mozzarella", "feta", "gorgonzola",
        "frischkäse", "joghurt", "butter", "creme fraiche", "crème fraîche",
        "mascarpone", "quark", "cheddar", "panna cotta", "béarnaise", "sahnesauce",
        "sahnehaube", "rahm", "milch",
    ],
    "egg": ["mayonnaise", " ei ", "eier", "eiern"],
    "soy": ["soja"],
    "nuts": [
        "mandel", "walnuss", "haselnuss", "pistazie", "cashew", "pinienkern",
        "nüsse", "nuss ", "nussmantel",
    ],
    "peanuts": ["erdnuss"],
    "sesame": ["sesam"],
    "fish": [
        "lachs", "fisch", "kabeljau", "thunfisch", "forelle", "barsch",
        "matjes", "hering", "tropenbarsch", "seeteufel", "red snapper",
    ],
    "crustaceans": ["scampi", "garnele", "krebs", "shrimp", "flusskrebs", "riesengarnele"],
    "celery": ["sellerie"],
    "mustard": ["senf"],
}

# ingredient_flags derivation: same discipline — literal keyword only.
INGREDIENT_KEYWORDS: dict[str, list[str]] = {
    "contains_meat": [
        "schwein", "rind", "lamm", "hähnchen", "huhn", "geflügel", "pute",
        "poulard", "ente", "hack", "speck", "schinken", "kasseler", "wurst",
        "steak", "filet vom", "burgunderbraten",
    ],
    "contains_pork": ["schwein", "speck", "schinken", "kasseler", "katenschinken"],
    "contains_poultry": ["hähnchen", "huhn", "geflügel", "pute", "poulard", "ente"],
    "contains_beef": ["rind", "burgunderbraten"],
    "contains_fish": [
        "lachs", "fisch", "kabeljau", "thunfisch", "forelle", "barsch",
        "matjes", "hering", "tropenbarsch", "seeteufel",
    ],
    "contains_shellfish": ["scampi", "garnele", "krebs", "shrimp", "flusskrebs"],
    "contains_dairy": [
        "käse", "sahne", "parmesan", "mozzarella", "feta", "gorgonzola",
        "frischkäse", "joghurt", "butter", "creme fraiche", "crème fraîche",
        "mascarpone", "quark",
    ],
    "contains_egg": ["mayonnaise", " ei ", "eier"],
    "contains_honey": ["honig"],
    "contains_alcohol": ["wein", "sherry", "cognac", "likör", "marsala", "calvados"],
    "contains_gelatin": ["gelatine"],
}


def derive_allergens(*texts: str) -> list[str]:
    combined = " ".join(t.lower() for t in texts if t)
    found: list[str] = []
    for code, words in ALLERGEN_KEYWORDS.items():
        if any(w in combined for w in words):
            found.append(code)
    return sorted(found)


def derive_ingredient_flags(*texts: str) -> dict[str, bool]:
    combined = " ".join(t.lower() for t in texts if t)
    return {flag: any(w in combined for w in words) for flag, words in INGREDIENT_KEYWORDS.items()}
