from app.services.catalog_ids import dish_id_from_source_id
from app.services.core_capacity_signal_adapter import (
    CoreCapacityRow,
    capacity_signals_from_core_rows,
)
from app.services.recommendation_engine import CapacitySignal


def test_capacity_rows_map_back_to_configurator_item_ids() -> None:
    item_id = "D1"
    rows = (
        CoreCapacityRow(
            item_id=dish_id_from_source_id(item_id),
            feasible=True,
            overload_penalty=75,
            reason_code="CAPACITY_ELEVATED",
        ),
    )

    assert capacity_signals_from_core_rows(
        rows,
        configurator_item_ids=(item_id,),
    ) == (
        CapacitySignal(
            item_id=item_id,
            feasible=True,
            overload_penalty=75,
            reason_code="CAPACITY_ELEVATED",
        ),
    )


def test_capacity_rows_ignore_unknown_core_ids_and_keep_advisory_reason() -> None:
    rows = (
        CoreCapacityRow(
            item_id=dish_id_from_source_id("D2"),
            feasible=True,
            overload_penalty=100,
            reason_code="CAPACITY_UNSET",
        ),
        CoreCapacityRow(item_id="unknown-core-id", feasible=True, overload_penalty=10),
    )

    signals = capacity_signals_from_core_rows(
        rows,
        configurator_item_ids=("D2",),
    )

    assert len(signals) == 1
    assert signals[0].item_id == "D2"
    assert signals[0].feasible is True
    assert signals[0].overload_penalty == 100
    assert signals[0].reason_code == "CAPACITY_UNSET"
