from pathlib import Path

from app.models.classification import DietType, IngredientFlags
from app.models.item import Item
from app.services.item_service import load_items
from app.services.recommendation_engine import RecommendationRequest, rank_items


def _item(
    item_id: str,
    *,
    formats: list[str] | None = None,
    event_types: list[str] | None = None,
) -> Item:
    return Item(
        id=item_id,
        name=item_id,
        section="Test",
        category="Test",
        price=5.0,
        price_type="piece",
        min_order=1,
        unit_label="Stück",
        module="food",
        item_kind="simple",
        diet_type=DietType.omnivore,
        ingredient_flags=IngredientFlags(),
        recommended_catering_formats=formats or [],
        recommended_event_types=event_types or [],
    )


def test_real_catalog_loads_curated_recommendation_applicability() -> None:
    items_path = Path(__file__).parents[1] / "app" / "data" / "items.json"
    by_id = {item.id: item for item in load_items(items_path)}

    business = by_id["business-hanseatisch"]
    assert business.recommended_catering_formats == ["fingerfood", "mixed"]
    assert business.recommended_event_types == ["business"]

    fingerfood = by_id["ff-party-frikadelle"]
    assert fingerfood.recommended_catering_formats == ["fingerfood", "mixed"]

    reception = by_id["empfangsbuffet-1"]
    assert reception.recommended_catering_formats == ["fingerfood", "buffet", "mixed"]
    assert reception.recommended_event_types == ["reception"]


def test_catering_format_match_is_soft_ranking_signal() -> None:
    matching = _item("matching", formats=["fingerfood"])
    mismatching = _item("mismatching", formats=["buffet"])

    ranked = rank_items(
        [mismatching, matching],
        {"matching": 500, "mismatching": 500},
        RecommendationRequest(catering_format="fingerfood"),
    )

    assert [candidate.item_id for candidate in ranked] == ["matching", "mismatching"]
    assert ranked[0].score - ranked[1].score == 25
    assert "catering format match +15" in ranked[0].explanations
    assert "catering format mismatch -10" in ranked[1].explanations
    assert all(candidate.eligible for candidate in ranked)


def test_event_type_match_prefers_explicit_business_item() -> None:
    business = _item("business", event_types=["business"])
    reception = _item("reception", event_types=["reception"])

    ranked = rank_items(
        [reception, business],
        {"business": 500, "reception": 500},
        RecommendationRequest(event_type="business"),
    )

    assert [candidate.item_id for candidate in ranked] == ["business", "reception"]
    assert ranked[0].score - ranked[1].score == 15
    assert "event type match +10" in ranked[0].explanations
    assert "event type mismatch -5" in ranked[1].explanations


def test_missing_applicability_metadata_stays_neutral() -> None:
    unclassified = _item("unclassified")

    ranked = rank_items(
        [unclassified],
        {"unclassified": 500},
        RecommendationRequest(catering_format="buffet", event_type="wedding"),
    )

    assert ranked[0].score == 10
    assert not any("format" in text for text in ranked[0].explanations)
    assert not any("event type" in text for text in ranked[0].explanations)
