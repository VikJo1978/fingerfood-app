from fastapi import APIRouter, Query

from app.models.classification import ALLERGEN_CODES, ALLERGEN_LABELS_DE, Allergen, DietType
from app.models.item import Item
from app.services.catalog_factory import build_catalog_adapter

router = APIRouter(prefix="/api/items", tags=["items"])

_cache: list[Item] | None = None
_cache_source: str | None = None


def _all_items() -> list[Item]:
    global _cache, _cache_source
    adapter = build_catalog_adapter()
    loaded = adapter.load_items_for_compose()
    if _cache is None or _cache_source != loaded.catalog_revision:
        _cache = list(loaded.items.values())
        _cache_source = loaded.catalog_revision
    return _cache


def _allergen_codes_for_query(q: str) -> set[Allergen]:
    """A search word matching a German allergen-group label (e.g. "fisch")
    also matches items carrying that allergen — so "fisch" finds buffets
    containing "Lachs" or "Forelle" even though the word "Fisch" itself never
    appears in their text. Reuses the audited `allergens` list computed by
    scripts/derive_allergens.py, no separate species word list to maintain."""
    return {code for code, label in ALLERGEN_LABELS_DE.items() if q in label.lower()}


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
        description="food | beverage | staff | tableware | equipment — Katalogmodul (optional)",
    ),
) -> list[Item]:
    """
    Filtering plan:
    - search: name, description, category, diet_type, items_included, and
      allergen-group labels (e.g. "fisch" also matches items whose derived
      allergens include "fish", such as Lachs/Forelle dishes)
    - section, price_type: exact
    - diet: one DietType
    - exclude_allergens: hide items declaring any of these allergens
    - max_unit_price: only if > 0 (0 = no cap)
    """
    items = _all_items()
    out = items

    if search:
        q = search.lower().strip()
        allergen_hit = _allergen_codes_for_query(q)
        out = [
            i
            for i in out
            if q in i.name.lower()
            or q in i.description.lower()
            or q in i.category.lower()
            or q in i.diet_type.value
            or q in (i.items_included or "").lower()
            or (allergen_hit and allergen_hit.intersection(i.allergens))
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

    if module in ("food", "beverage", "staff", "tableware", "equipment"):
        out = [i for i in out if i.module == module]

    return out


@router.get("/sections", response_model=list[str])
def list_sections() -> list[str]:
    items = _all_items()
    sections = sorted({i.section for i in items})
    return sections
