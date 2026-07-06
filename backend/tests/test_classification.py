"""ALLERGEN_LABELS_DE parity with frontend/src/constants/classification.ts."""

from app.models.classification import Allergen, ALLERGEN_LABELS_DE

# Must match frontend/src/constants/classification.ts ALLERGEN_LABELS_DE
# exactly. Keep the two in sync by hand; there is no shared source file for
# this small, EU-mandated, effectively-frozen 14-entry list.
_EXPECTED_FRONTEND_LABELS_DE = {
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


def test_allergen_labels_match_frontend() -> None:
    assert ALLERGEN_LABELS_DE == _EXPECTED_FRONTEND_LABELS_DE


def test_allergen_labels_cover_every_code() -> None:
    assert set(ALLERGEN_LABELS_DE) == set(Allergen)
