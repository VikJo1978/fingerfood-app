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
