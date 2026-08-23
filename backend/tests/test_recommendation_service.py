from app.models.classification import DietType, IngredientFlags
from app.models.item import Item
from app.services.recommendation_engine import RecommendationRequest
from app.services.recommendation_service import generate_recommendation_variants


def _item(item_id: str, *, contains_pork: bool = False) -> Item:
    return Item(
        id=item_id,
        name=item_id,
        section="Test",
        category="Fingerfood",
        price=5.0,
        price_type="piece",
        min_order=1,
        unit_label="Stück",
        diet_type=DietType.omnivore,
        ingredient_flags=IngredientFlags(contains_pork=contains_pork),
        allergens=[],
        allergens_verified=True,
    )


def test_each_variant_uses_its_own_profile_ranking() -> None:
    items = [_item("cheap"), _item("mid"), _item("premium")]
    prices = {"cheap": 100, "mid": 1000, "premium": 5000}

    variants = generate_recommendation_variants(
        items,
        prices,
        RecommendationRequest(),
        guest_count=20,
    )

    assert [variant.kind for variant in variants] == [
        "ECONOMIC",
        "RECOMMENDED",
        "PREMIUM",
    ]
    assert variants[0].lines[0].item_id == "cheap"
    assert variants[2].lines[0].item_id == "premium"
    assert "economic price weighting" in variants[0].lines[0].explanations
    assert "premium price weighting" in variants[2].lines[0].explanations


def test_hard_constraints_are_reapplied_for_every_profile() -> None:
    items = [_item("safe"), _item("pork", contains_pork=True)]
    prices = {"safe": 500, "pork": 5000}

    variants = generate_recommendation_variants(
        items,
        prices,
        RecommendationRequest(no_pork=True),
        guest_count=10,
    )

    assert variants
    assert all(
        "pork" not in {line.item_id for line in variant.lines}
        for variant in variants
    )


def test_generation_is_reproducible() -> None:
    items = [_item("b"), _item("a"), _item("c")]
    prices = {"a": 500, "b": 500, "c": 500}
    request = RecommendationRequest()

    first = generate_recommendation_variants(
        items,
        prices,
        request,
        guest_count=12,
    )
    second = generate_recommendation_variants(
        list(reversed(items)),
        prices,
        request,
        guest_count=12,
    )

    assert first == second
