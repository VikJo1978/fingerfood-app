from datetime import date

from app.models.classification import DietType, IngredientFlags
from app.models.item import Item
from app.services.core_customer_history_adapter import (
    CoreCustomerHistoryDish,
    CoreCustomerHistoryOrder,
    CustomerHistorySignal,
    customer_history_signals_from_core_orders,
)
from app.services.core_customer_preference_adapter import (
    CoreCustomerPreference,
    CustomerPreferenceSignal,
    customer_preference_signals_from_core_preferences,
)
from app.services.recommendation_engine import RecommendationRequest, rank_items


def _item(item_id: str, *, name: str | None = None) -> Item:
    return Item(
        id=item_id,
        name=name or item_id,
        section="Test",
        category="Fingerfood",
        price=5.0,
        price_type="piece",
        min_order=1,
        unit_label="Stück",
        diet_type=DietType.omnivore,
        ingredient_flags=IngredientFlags(),
        allergens=[],
        allergens_verified=True,
    )


def test_history_adapter_derives_frequent_and_recent_soft_signals() -> None:
    orders = (
        CoreCustomerHistoryOrder(
            order_id="o-2",
            event_date=date(2026, 8, 1),
            cancelled=False,
            dishes=(CoreCustomerHistoryDish("dish-a", "Dish A"),),
        ),
        CoreCustomerHistoryOrder(
            order_id="o-1",
            event_date=date(2026, 6, 1),
            cancelled=False,
            dishes=(CoreCustomerHistoryDish("dish-a", "Dish A"),),
        ),
    )

    signals = customer_history_signals_from_core_orders(
        orders,
        as_of=date(2026, 8, 25),
        configurator_item_ids=("dish-a",),
    )

    assert [signal.kind for signal in signals] == [
        "frequently_ordered",
        "recently_ordered",
    ]
    assert all(signal.order_count == 2 for signal in signals)


def test_cancelled_and_unknown_catalog_items_do_not_create_history_signals() -> None:
    orders = (
        CoreCustomerHistoryOrder(
            order_id="cancelled",
            event_date=date(2026, 8, 1),
            cancelled=True,
            dishes=(CoreCustomerHistoryDish("dish-a", "Dish A"),),
        ),
        CoreCustomerHistoryOrder(
            order_id="unknown",
            event_date=date(2026, 8, 1),
            cancelled=False,
            dishes=(CoreCustomerHistoryDish("not-in-configurator", "Old custom"),),
        ),
    )

    assert (
        customer_history_signals_from_core_orders(
            orders,
            as_of=date(2026, 8, 25),
            configurator_item_ids=("dish-a",),
        )
        == ()
    )


def test_recent_history_is_soft_penalty_not_reject() -> None:
    item = _item("dish-a")
    signal = CustomerHistorySignal(
        item_id="dish-a",
        kind="recently_ordered",
        order_count=1,
        last_ordered_on=date(2026, 8, 1),
        explanation="recent",
    )

    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(),
        customer_history_signals=(signal,),
    )

    assert ranked[0].eligible is True
    assert ranked[0].score == -5
    assert "history recent -15: last 2026-08-01" in ranked[0].explanations


def test_current_explicit_must_have_wins_over_recent_repetition() -> None:
    items = [_item("wanted"), _item("other")]
    signal = CustomerHistorySignal(
        item_id="wanted",
        kind="recently_ordered",
        order_count=1,
        last_ordered_on=date(2026, 8, 1),
        explanation="recent",
    )

    ranked = rank_items(
        items,
        {"wanted": 500, "other": 500},
        RecommendationRequest(must_have_item_ids=frozenset({"wanted"})),
        customer_history_signals=(signal,),
    )

    assert ranked[0].item_id == "wanted"
    assert "history recent: repetition penalty ignored for must-have" in ranked[0].explanations


def test_explicit_preference_adapter_uses_only_exact_unique_catalog_name() -> None:
    catalog = (
        _item("a", name="Mini-Frikadellen"),
        _item("b", name="Lachs Canapé"),
        _item("c", name="Lachs Canapé"),
    )
    preferences = (
        CoreCustomerPreference("favorite_dish", " mini-frikadellen ", "customer_stated"),
        CoreCustomerPreference("favorite_dish", "Mini Frikadellen", "customer_stated"),
        CoreCustomerPreference("disliked_dish", "Lachs Canapé", "office_recorded"),
        CoreCustomerPreference("service_style", "Buffet", "office_recorded"),
    )

    signals = customer_preference_signals_from_core_preferences(
        preferences,
        catalog_items=catalog,
    )

    assert signals == (
        CustomerPreferenceSignal(
            item_id="a",
            kind="favorite_dish",
            source="customer_stated",
            explanation="explicit customer preference: favorite_dish (customer_stated)",
        ),
    )


def test_stored_favorite_outweighs_recent_repetition_without_blocking() -> None:
    item = _item("favorite")
    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(),
        customer_history_signals=(
            CustomerHistorySignal(
                item_id=item.id,
                kind="recently_ordered",
                order_count=2,
                last_ordered_on=date(2026, 8, 1),
                explanation="recent",
            ),
        ),
        customer_preference_signals=(
            CustomerPreferenceSignal(
                item_id=item.id,
                kind="favorite_dish",
                source="customer_stated",
                explanation="favorite",
            ),
        ),
    )

    assert ranked[0].eligible is True
    assert ranked[0].score == 25
    assert "stored favorite +30: customer_stated" in ranked[0].explanations
    assert "history recent -15: last 2026-08-01" in ranked[0].explanations


def test_current_inquiry_overrides_stored_dislike() -> None:
    item = _item("wanted")
    ranked = rank_items(
        [item],
        {item.id: 500},
        RecommendationRequest(must_have_item_ids=frozenset({item.id})),
        customer_preference_signals=(
            CustomerPreferenceSignal(
                item_id=item.id,
                kind="disliked_dish",
                source="office_recorded",
                explanation="old dislike",
            ),
        ),
    )

    assert ranked[0].score == 110
    assert "stored dislike ignored because current inquiry requires item" in ranked[0].explanations
