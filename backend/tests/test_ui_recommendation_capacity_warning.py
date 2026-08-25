from app.routes.ui_recommendation import _capacity_warnings
from app.services.core_capacity_signal_adapter import CoreCapacityRow


def test_elevated_capacity_is_visible_and_non_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=True,
                overload_penalty=75,
                reason_code="CAPACITY_ELEVATED",
            ),
        )
    )

    assert len(warnings) == 1
    assert "Erhöhte Auslastung" in warnings[0]
    assert "ca. 75 %" in warnings[0]
    assert "bleiben verfügbar" in warnings[0]


def test_high_capacity_is_visible_and_non_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=True,
                overload_penalty=85,
                reason_code="CAPACITY_HIGH",
            ),
        )
    )

    assert len(warnings) == 1
    assert "Hohe Auslastung" in warnings[0]
    assert "ca. 85 %" in warnings[0]


def test_near_limit_capacity_is_visible_and_non_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=True,
                overload_penalty=95,
                reason_code="CAPACITY_NEAR_LIMIT",
            ),
        )
    )

    assert len(warnings) == 1
    assert "nahe am empfohlenen Grenzwert" in warnings[0]
    assert "ca. 95 %" in warnings[0]


def test_exceeded_capacity_is_visible_and_explicitly_non_blocking() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=True,
                overload_penalty=100,
                reason_code="CAPACITY_EXCEEDED",
            ),
        )
    )

    assert len(warnings) == 1
    assert "Kapazitätsgrenzwert überschritten" in warnings[0]
    assert "mindestens 100 %" in warnings[0]
    assert "Entscheidung trifft der Mitarbeiter" in warnings[0]


def test_pressure_without_reason_code_uses_same_thresholds() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow("dish-a", True, 82),
            CoreCapacityRow("dish-b", True, 82),
        )
    )

    assert len(warnings) == 1
    assert "Hohe Auslastung" in warnings[0]
    assert "ca. 82 %" in warnings[0]


def test_missing_capacity_fact_warns_without_exposing_raw_reason_code() -> None:
    warnings = _capacity_warnings(
        (
            CoreCapacityRow(
                item_id="dish-a",
                feasible=True,
                overload_penalty=100,
                reason_code="CAPACITY_UNSET",
            ),
        )
    )

    assert len(warnings) == 1
    assert "Kapazität ist nicht hinterlegt" in warnings[0]
    assert "CAPACITY_UNSET" not in warnings[0]
    assert "blockiert die Bearbeitung nicht" in warnings[0]


def test_zero_capacity_pressure_needs_no_warning() -> None:
    assert _capacity_warnings((CoreCapacityRow("dish-a", True, 0),)) == ()
