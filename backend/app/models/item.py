from typing import Literal

from pydantic import BaseModel, Field

from app.models.classification import Allergen, DietType, IngredientFlags

CateringFormat = Literal["fingerfood", "buffet", "mixed", "other"]
RecommendationEventType = Literal[
    "business",
    "private",
    "wedding",
    "reception",
    "other",
]


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

    recommended_catering_formats: list[CateringFormat] = Field(default_factory=list)
    recommended_event_types: list[RecommendationEventType] = Field(default_factory=list)
    """Optional recommendation metadata, never a hard availability constraint.

    Empty lists mean the catalog has no explicit applicability fact for this item.
    Recommendation scoring must therefore stay neutral rather than infer suitability
    from names/descriptions. Populated values are curated catalog metadata used only
    as soft ranking signals for the Office recommendation flow.
    """

    surcharge_label: str | None = None
    surcharge_amount: float | None = Field(default=None, ge=0)
    """Single optional per-unit surcharge stated in the real menu text (e.g.
    "+ 1,00 € Aufpreis für Lachs oder Rind" on Brötchen Mix 3/Sandwiches/
    Bagels) that the fixed catalog price cannot express on its own. This is
    deliberately NOT a general variant/topping system — just one optional
    checkbox surcharge per item, applied with the same quantity-mode
    multiplier as the base price and the same VAT rate (see
    scripts/derive_vat_rate.py). None for every item without such a note."""

    diet_type: DietType
    ingredient_flags: IngredientFlags = Field(default_factory=IngredientFlags)
    allergens: list[Allergen] = Field(default_factory=list)
    allergens_verified: bool = False
    """False (default) means allergens were mechanically derived from the menu
    description text only (see scripts/derive_allergens.py) — NOT a checked
    food-safety declaration. Must not be relied on for a client with allergies
    without kitchen/owner verification. True is reserved for items a human has
    explicitly reviewed and confirmed."""

    vat_rate_percent: Literal[7, 19] = 19
    """Owner-stated classification per German catering VAT law: since
    1 Jan 2026, food (Speisen, incl. buffets/packages) is taxed at 7%;
    beverages and service/equipment are taxed at 19% — see
    scripts/derive_vat_rate.py for the exact rule and rationale. NOT
    independently verified legal research; the office's Steuerberater should
    confirm before this is relied on for real invoices.

    Schutzformulierung: Die automatische USt.-Zuordnung gilt für Leistungen ab
    01.01.2026; historische Leistungen werden nicht steuerlich bewertet."""
