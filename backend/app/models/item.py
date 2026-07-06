from typing import Literal

from pydantic import BaseModel, Field

from app.models.classification import Allergen, DietType, IngredientFlags


class Item(BaseModel):
    id: str
    name: str
    section: str
    category: str
    subcategory: str | None = None
    price: float = Field(ge=0)
    price_type: Literal["piece", "person"]
    min_order: int = Field(ge=1)
    unit_label: str
    description: str = ""
    items_included: str | None = None
    module: Literal["food", "beverage", "staff", "tableware", "equipment"] = "food"
    item_kind: Literal["simple", "composite"] = "simple"

    diet_type: DietType
    ingredient_flags: IngredientFlags = Field(default_factory=IngredientFlags)
    allergens: list[Allergen] = Field(default_factory=list)
    allergens_verified: bool = False
    """False (default) means allergens were mechanically derived from the menu
    description text only (see scripts/derive_allergens.py) — NOT a checked
    food-safety declaration. Must not be relied on for a client with allergies
    without kitchen/owner verification. True is reserved for items a human has
    explicitly reviewed and confirmed."""
