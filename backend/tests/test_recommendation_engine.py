from app.models.classification import Allergen, DietType, IngredientFlags
from app.models.item import Item
from app.services.recommendation_engine import (
    CapacitySignal,
    ProductionSignal,
    RecommendationRequest,
    rank_items,
)


def _item(
    item_id: str,
    *,
    category: str = "Fingerfood",
    diet_type: DietType = DietType.omnivore,
    contains_pork: bool = False,
    allergens: list[Allergen] | None = None,
    allergens_verified: bool = True,
) -> Item:
    return Item(
        id=item_id,
        name=item_id,
        section="Test",
        category=category,
        price=5.0,
        price_type="piece",
        min_order=1,
        unit_label="Stück",
        diet_type=diet_type,
        ingredient_flags=IngredientFlags(contains_pork=contains_pork),
        allergens=allergens or [],
        allergens_verified=allergens_verified,
    )


def test_hard_constraints_reject_diet_pork_and_allergen_conflicts() -> None:
    items = [
        _item("meat", contains_pork=True),
        _item("milk", diet_type=DietType.vegetarian, allergens=[Allergen.milk]),
        _item("safe", diet_type=DietType.vegan),
    ]
    request = RecommendationRequest(
        diet_type=DietType.vegetarian,
        no_pork=True,
        excluded_allergens=frozenset({Allergen.milk}),
    )

    ranked = rank_items(items, {item.id: 500 for item in items}, request)

    assert ranked[0].item_id == "safe"
    rejected = {candidate.item_id: candidate.hard_reject_reasons for candidate in ranked[1:]}
    assert "diet_conflict" in rejected["meat"]
    assert "pork_conflict" in rejected["meat"]
    assert rejected["milk"] == ("allergen_conflict",)


def test_allergy_request_rejects_unverified_allergen_data() -> None:
    item = _item(
        "unknown-allergens",
        diet_type=DietType.vegan,
        allergens_verified=False,
    )

    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(excluded_allergens=frozenset({Allergen.nuts})),
    )

    assert ranked[0].eligible is False
    assert ranked[0].hard_reject_reasons == ("allergens_unverified",)


def test_confirmed_same_day_production_beats_open_offer_signal() -> None:
    items = [_item("confirmed"), _item("open")]

    ranked = rank_items(
        items,
        {"confirmed": 500, "open": 500},
        RecommendationRequest(),
        production_signals=(
            ProductionSignal("confirmed", "CONFIRMED"),
            ProductionSignal("open", "OPEN_OFFER"),
        ),
    )

    assert [candidate.item_id for candidate in ranked] == ["confirmed", "open"]
    assert ranked[0].score - ranked[1].score == 25


def test_explicit_must_have_wins_over_same_day_bonus() -> None:
    items = [_item("wanted"), _item("overlap")]

    ranked = rank_items(
        items,
        {"wanted": 500, "overlap": 500},
        RecommendationRequest(must_have_item_ids=frozenset({"wanted"})),
        production_signals=(ProductionSignal("overlap", "CONFIRMED"),),
    )

    assert ranked[0].item_id == "wanted"
    assert "must-have" in ranked[0].explanations


def test_economic_profile_prefers_lower_price_for_equal_candidates() -> None:
    items = [_item("cheap"), _item("expensive")]

    ranked = rank_items(
        items,
        {"cheap": 300, "expensive": 900},
        RecommendationRequest(profile="ECONOMIC"),
    )

    assert [candidate.item_id for candidate in ranked] == ["cheap", "expensive"]


def test_ranking_is_reproducible_with_item_id_tie_break() -> None:
    items = [_item("b"), _item("a")]

    ranked = rank_items(
        items,
        {"a": 500, "b": 500},
        RecommendationRequest(),
    )

    assert [candidate.item_id for candidate in ranked] == ["a", "b"]


def test_unavailable_capacity_is_advisory_not_a_hard_reject_or_score_penalty() -> None:
    item = _item("capacity-warning")

    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(),
        capacity_signals=(
            CapacitySignal(
                item.id,
                feasible=True,
                overload_penalty=100,
                reason_code="CAPACITY_UNSET",
            ),
        ),
    )

    assert ranked[0].eligible is True
    assert ranked[0].hard_reject_reasons == ()
    assert ranked[0].score == 10
    assert (
        "capacity advisory: capacity data unavailable or incomplete"
        in ranked[0].explanations
    )


def test_capacity_pressure_applies_soft_penalty_and_changes_ranking() -> None:
    items = [_item("free"), _item("busy")]

    ranked = rank_items(
        items,
        {"free": 500, "busy": 500},
        RecommendationRequest(),
        capacity_signals=(
            CapacitySignal(
                "busy",
                overload_penalty=75,
                reason_code="CAPACITY_ELEVATED",
            ),
        ),
    )

    assert [candidate.item_id for candidate in ranked] == ["free", "busy"]
    by_id = {candidate.item_id: candidate for candidate in ranked}
    assert by_id["free"].score == 10
    assert by_id["busy"].score == 5
    assert "capacity advisory: 75% load, -5" in by_id["busy"].explanations


def test_capacity_penalties_follow_warning_tiers() -> None:
    item = _item("capacity-tier")
    expected = (
        (75, "CAPACITY_ELEVATED", 5),
        (85, "CAPACITY_HIGH", 10),
        (95, "CAPACITY_NEAR_LIMIT", 20),
        (100, "CAPACITY_EXCEEDED", 30),
    )

    for load_percent, reason_code, penalty in expected:
        ranked = rank_items(
            [item],
            {item.id: 500},
            RecommendationRequest(),
            capacity_signals=(
                CapacitySignal(
                    item.id,
                    feasible=True,
                    overload_penalty=load_percent,
                    reason_code=reason_code,
                ),
            ),
        )

        assert ranked[0].eligible is True
        assert ranked[0].score == 10 - penalty
        assert (
            f"capacity advisory: {load_percent}% load, -{penalty}"
            in ranked[0].explanations
        )


def test_explicit_must_have_remains_stronger_than_capacity_penalty() -> None:
    items = [_item("must-have"), _item("free")]

    ranked = rank_items(
        items,
        {"must-have": 500, "free": 500},
        RecommendationRequest(must_have_item_ids=frozenset({"must-have"})),
        capacity_signals=(
            CapacitySignal(
                "must-have",
                overload_penalty=100,
                reason_code="CAPACITY_EXCEEDED",
            ),
        ),
    )

    assert ranked[0].item_id == "must-have"
    assert ranked[0].eligible is True
    assert ranked[0].score == 80


def test_capacity_percentage_fallback_uses_same_soft_tiers() -> None:
    item = _item("legacy-capacity")

    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(),
        capacity_signals=(CapacitySignal(item.id, overload_penalty=82),),
    )

    assert ranked[0].eligible is True
    assert ranked[0].score == 0
    assert "capacity advisory: 82% load, -10" in ranked[0].explanations
