from app.services.catalog_ids import dish_id_from_source_id
from app.services.core_production_signal_adapter import (
    CoreSameDayDemandRow,
    production_signals_from_core_rows,
)


def test_core_rows_map_to_expected_confidence_levels() -> None:
    signals = production_signals_from_core_rows(
        (
            CoreSameDayDemandRow("a", "CONFIRMED_ORDER"),
            CoreSameDayDemandRow("b", "ACCEPTED_ORDER"),
            CoreSameDayDemandRow("c", "SENT_OFFER"),
        )
    )

    assert [(signal.item_id, signal.confidence) for signal in signals] == [
        ("a", "CONFIRMED"),
        ("b", "LIKELY"),
        ("c", "OPEN_OFFER"),
    ]


def test_rejected_and_cancelled_rows_do_not_influence_ranking() -> None:
    signals = production_signals_from_core_rows(
        (
            CoreSameDayDemandRow("a", "REJECTED"),
            CoreSameDayDemandRow("b", "CANCELLED"),
        )
    )

    assert signals == ()


def test_strongest_same_item_signal_wins_deterministically() -> None:
    signals = production_signals_from_core_rows(
        (
            CoreSameDayDemandRow("dish", "SENT_OFFER"),
            CoreSameDayDemandRow("dish", "ACCEPTED_ORDER"),
            CoreSameDayDemandRow("dish", "CONFIRMED_ORDER"),
        )
    )

    assert len(signals) == 1
    assert signals[0].item_id == "dish"
    assert signals[0].confidence == "CONFIRMED"


def test_core_catalog_ids_are_mapped_back_to_configurator_item_ids() -> None:
    source_item_id = "fingerfood-mini-wrap"
    core_catalog_id = dish_id_from_source_id(source_item_id)

    signals = production_signals_from_core_rows(
        (CoreSameDayDemandRow(core_catalog_id, "CONFIRMED_ORDER"),),
        configurator_item_ids=(source_item_id,),
    )

    assert len(signals) == 1
    assert signals[0].item_id == source_item_id
    assert signals[0].confidence == "CONFIRMED"


def test_unknown_core_catalog_id_is_ignored_when_mapping_is_explicit() -> None:
    signals = production_signals_from_core_rows(
        (CoreSameDayDemandRow("unknown-core-id", "CONFIRMED_ORDER"),),
        configurator_item_ids=("known-source-item",),
    )

    assert signals == ()
