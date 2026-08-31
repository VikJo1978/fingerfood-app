from app.models.classification import DietType, IngredientFlags
from app.models.item import Item
from app.services.recommendation_engine import RecommendationCandidate
from app.services.recommendation_variant_assembler import assemble_variants


def _item(
    item_id: str,
    *,
    price_type: str = "piece",
    min_order: int = 1,
) -> Item:
    return Item(
        id=item_id,
        name=item_id,
        section="Test",
        category="Fingerfood",
        price=5.0,
        price_type=price_type,
        min_order=min_order,
        unit_label="Stück",
        diet_type=DietType.omnivore,
        ingredient_flags=IngredientFlags(),
        allergens=[],
        allergens_verified=True,
    )


def _candidate(item_id: str, score: int, *, eligible: bool = True) -> RecommendationCandidate:
    return RecommendationCandidate(
        item_id=item_id,
        score=score,
        hard_reject_reasons=() if eligible else ("diet_conflict",),
        explanations=("ranked",) if eligible else (),
    )


def test_assembles_three_named_variants_from_eligible_candidates() -> None:
    items = [_item(f"item-{index}") for index in range(1, 7)]
    ranked = [_candidate(item.id, 100 - index) for index, item in enumerate(items)]
    prices = {item.id: index * 100 for index, item in enumerate(items, start=1)}

    variants = assemble_variants(items, ranked, prices, guest_count=20)

    assert [variant.kind for variant in variants] == [
        "ECONOMIC",
        "RECOMMENDED",
        "PREMIUM",
    ]
    assert [variant.label for variant in variants] == [
        "Wirtschaftlich",
        "Empfohlen",
        "Premium",
    ]
    assert len(variants[0].lines) == 3
    assert len(variants[1].lines) == 4
    assert len(variants[2].lines) == 5


def test_hard_rejected_candidate_never_enters_any_variant() -> None:
    items = [_item("safe"), _item("rejected")]
    ranked = [_candidate("rejected", 999, eligible=False), _candidate("safe", 1)]

    variants = assemble_variants(
        items,
        ranked,
        {"safe": 500, "rejected": 100},
        guest_count=10,
    )

    assert variants
    assert all(
        "rejected" not in {line.item_id for line in variant.lines}
        for variant in variants
    )


def test_complete_variant_budget_ceiling_is_respected() -> None:
    items = [_item("a"), _item("b"), _item("c")]
    ranked = [_candidate("a", 30), _candidate("b", 20), _candidate("c", 10)]

    variants = assemble_variants(
        items,
        ranked,
        {"a": 400, "b": 300, "c": 200},
        guest_count=10,
        max_variant_net_cents=500,
    )

    assert variants
    assert all(variant.net_total_cents <= 500 for variant in variants)


def test_per_person_quantity_scales_with_guest_count() -> None:
    item = _item("buffet", price_type="person", min_order=5)

    variants = assemble_variants(
        [item],
        [_candidate("buffet", 10)],
        {"buffet": 1200},
        guest_count=23,
    )

    line = variants[0].lines[0]
    assert line.quantity == 23
    assert line.net_total_cents == 27600
    assert "quantity from guest count" in line.explanations


def test_piece_quantity_without_demand_defaults_to_one_piece_per_guest() -> None:
    item = _item("canape", price_type="piece", min_order=12)

    variants = assemble_variants(
        [item],
        [_candidate("canape", 10)],
        {"canape": 250},
        guest_count=80,
    )

    line = variants[0].lines[0]
    assert line.quantity == 80
    assert line.net_total_cents == 20000
    assert "quantity defaults to one piece per guest" in line.explanations


def test_piece_quantity_guest_default_still_respects_catalog_minimum() -> None:
    item = _item("canape", price_type="piece", min_order=30)

    variants = assemble_variants(
        [item],
        [_candidate("canape", 10)],
        {"canape": 250},
        guest_count=20,
    )

    line = variants[0].lines[0]
    assert line.quantity == 30
    assert "catalog minimum applied" in line.explanations


def test_explicit_piece_demand_drives_quantity_and_budget() -> None:
    item = _item("canape", price_type="piece", min_order=12)

    variants = assemble_variants(
        [item],
        [_candidate("canape", 10)],
        {"canape": 250},
        guest_count=80,
        piece_quantity_by_item_id={"canape": 80},
        max_variant_net_cents=20000,
    )

    assert variants[0].lines[0].quantity == 80
    assert variants[0].lines[0].net_total_cents == 20000
    assert "quantity from explicit piece demand" in variants[0].lines[0].explanations

    over_budget = assemble_variants(
        [item],
        [_candidate("canape", 10)],
        {"canape": 250},
        guest_count=80,
        piece_quantity_by_item_id={"canape": 81},
        max_variant_net_cents=20000,
    )
    assert over_budget == ()


def test_explicit_piece_demand_respects_catalog_minimum() -> None:
    item = _item("canape", price_type="piece", min_order=12)

    variants = assemble_variants(
        [item],
        [_candidate("canape", 10)],
        {"canape": 250},
        guest_count=20,
        piece_quantity_by_item_id={"canape": 5},
    )

    line = variants[0].lines[0]
    assert line.quantity == 12
    assert "catalog minimum applied" in line.explanations


def test_non_positive_piece_demand_is_rejected() -> None:
    item = _item("canape", price_type="piece", min_order=12)

    try:
        assemble_variants(
            [item],
            [_candidate("canape", 10)],
            {"canape": 250},
            guest_count=20,
            piece_quantity_by_item_id={"canape": 0},
        )
    except ValueError as exc:
        assert str(exc) == "piece quantities must be positive"
    else:
        raise AssertionError("expected invalid piece quantity to fail")


def test_variant_ordering_is_deterministic_per_profile() -> None:
    items = [_item("cheap"), _item("balanced"), _item("premium")]
    ranked = [
        _candidate("balanced", 100),
        _candidate("cheap", 80),
        _candidate("premium", 70),
    ]
    prices = {"cheap": 200, "balanced": 500, "premium": 900}

    variants = assemble_variants(items, ranked, prices, guest_count=10)

    economic, recommended, premium = variants
    assert economic.lines[0].item_id == "cheap"
    assert recommended.lines[0].item_id == "balanced"
    assert premium.lines[0].item_id == "premium"
