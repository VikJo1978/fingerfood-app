from app.services.catalog_ids import dish_id_from_source_id
from app.services.core_capacity_signal_adapter import (
    CoreCapacityRow,
    capacity_signals_from_core_rows,
)


def test_capacity_rows_map_back_to_configurator_item_ids() -> None:
    item_id = "D1"
    rows = (
        CoreCapacityRow(
            item_id=dish_id_from_source_id(item_id),
            feasible=True,
            overload_penalty=35,
        ),
    )

    assert capacity_signals_from_core_rows(
        rows,
        configurator_item_ids=(item_id,),
    ) == (
        __import__(
            "app.services.recommendation_engine", fromlist=["CapacitySignal"]
        ).CapacitySignal(item_id=item_id, feasible=True, overload_penalty=35),
    )


def test_capacity_rows_ignore_unknown_core_ids_and_preserve_hard_reject() -> None:
    rows = (
        CoreCapacityRow(
            item_id=dish_id_from_source_id("D2"),
            feasible=False,
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
    assert signals[0].feasible is False
    assert signals[0].overload_penalty == 100
