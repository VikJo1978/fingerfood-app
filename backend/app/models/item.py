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

    diet_type: DietType
    ingredient_flags: IngredientFlags = Field(default_factory=IngredientFlags)
    allergens: list[Allergen] = Field(default_factory=list)
