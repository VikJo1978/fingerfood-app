from app.routes.ui_recommendation import _capacity_warnings
from app.services.core_capacity_signal_adapter import CoreCapacityRow


def test_exhausted_capacity_is_visible_but_explicitly_non_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=False,
                overload_penalty=100,
                reason_code="CAPACITY_EXHAUSTED",
            ),
        )
    )

    assert len(warnings) == 1
    assert "erreicht oder überschritten" in warnings[0]
    assert "bleiben verfügbar" in warnings[0]
    assert "Entscheidung trifft der Mitarbeiter" in warnings[0]


def test_capacity_pressure_is_shown_as_information_only() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow("dish-a", True, 75),
            CoreCapacityRow("dish-b", True, 75),
        )
    )

    assert warnings == (
        "Produktionshinweis: Die aktuelle Tagesauslastung liegt bei ungefähr 75 %. "
        "Das ist nur ein Hinweis; Empfehlungen und Angebot bleiben verfügbar.",
    )


def test_missing_capacity_fact_warns_without_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=False,
                overload_penalty=100,
                reason_code="CAPACITY_UNSET",
            ),
        )
    )

    assert len(warnings) == 1
    assert "CAPACITY_UNSET" in warnings[0]
    assert "blockiert die Bearbeitung nicht" in warnings[0]


def test_zero_capacity_pressure_needs_no_warning() -> None:
    assert _capacity_warnings((CoreCapacityRow("dish-a", True, 0),)) == ()
