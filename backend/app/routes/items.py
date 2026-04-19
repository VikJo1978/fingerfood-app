from fastapi import APIRouter, Query

from app.core.config import settings
from app.models.classification import ALLERGEN_CODES, DietType
from app.models.item import Item
from app.services.item_service import load_items

router = APIRouter(prefix="/api/items", tags=["items"])

_cache: list[Item] | None = None


def _all_items() -> list[Item]:
    global _cache
    if _cache is None:
        _cache = load_items(settings.items_json_path)
    return _cache


def _parse_exclude_allergens(raw: str | None) -> set[str]:
    if not raw:
        return set()
    out: set[str] = set()
    for part in raw.split(","):
        p = part.strip().lower()
        if p in ALLERGEN_CODES:
            out.add(p)
    return out


@router.get("", response_model=list[Item])
def list_items(
    search: str | None = Query(default=None),
    section: str | None = Query(default=None),
    price_type: str | None = Query(default=None),
    diet: str | None = Query(
        default=None,
        description="vegetarian | vegan | pescetarian | omnivore",
    ),
    exclude_allergens: str | None = Query(
        default=None,
        description="Komma-getrennte Allergen-Codes (Artikel mit diesen Allergenen ausblenden)",
    ),
    max_unit_price: float | None = Query(default=None, ge=0),
    module: str | None = Query(
        default=None,
        description="food | beverage | staff | tableware — Katalogmodul (optional)",
    ),
) -> list[Item]:
    """
    Filtering plan:
    - search: name, description, category, diet_type
    - section, price_type: exact
    - diet: one DietType
    - exclude_allergens: hide items declaring any of these allergens
    - max_unit_price: only if > 0 (0 = no cap)
    """
    items = _all_items()
    out = items

    if search:
        q = search.lower().strip()
        out = [
            i
            for i in out
            if q in i.name.lower()
            or q in i.description.lower()
            or q in i.category.lower()
            or q in i.diet_type.value
        ]

    if section:
        sec = section.strip()
        out = [i for i in out if i.section == sec]

    if price_type in ("piece", "person"):
        out = [i for i in out if i.price_type == price_type]

    if diet:
        d = diet.strip().lower()
        try:
            want = DietType(d)
            out = [i for i in out if i.diet_type == want]
        except ValueError:
            out = []

    avoid = _parse_exclude_allergens(exclude_allergens)
    if avoid:

        def no_declared_allergens(item: Item) -> bool:
            declared = {a.value for a in item.allergens}
            return not (declared & avoid)

        out = [i for i in out if no_declared_allergens(i)]

    if max_unit_price is not None and max_unit_price > 0:
        out = [i for i in out if i.price <= max_unit_price]

    if module in ("food", "beverage", "staff", "tableware"):
        out = [i for i in out if i.module == module]

    return out


@router.get("/sections", response_model=list[str])
def list_sections() -> list[str]:
    items = _all_items()
    sections = sorted({i.section for i in items})
    return sections
