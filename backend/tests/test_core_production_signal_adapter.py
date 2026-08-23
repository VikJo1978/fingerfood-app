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
