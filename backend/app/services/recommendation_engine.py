"""Deterministic recommendation scoring foundation for issue #151.

This module intentionally ranks catalog candidates only. Variant assembly remains a
separate step so hard constraints, scoring and explanations stay independently
testable. AI is not part of the decision path.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.classification import Allergen, DietType
from app.models.item import Item

RecommendationProfile = Literal["ECONOMIC", "RECOMMENDED", "PREMIUM"]
ProductionConfidence = Literal["CONFIRMED", "LIKELY", "OPEN_OFFER"]

_CAPACITY_LOAD_REASON_CODES = frozenset(
    {
        "CAPACITY_ELEVATED",
        "CAPACITY_HIGH",
        "CAPACITY_NEAR_LIMIT",
        "CAPACITY_EXCEEDED",
    }
)
_CAPACITY_SCORE_PENALTY = {
    "CAPACITY_ELEVATED": 5,
    "CAPACITY_HIGH": 10,
    "CAPACITY_NEAR_LIMIT": 20,
    "CAPACITY_EXCEEDED": 30,
}


@dataclass(frozen=True)
class RecommendationRequest:
    profile: RecommendationProfile = "RECOMMENDED"
    diet_type: DietType | None = None
    excluded_allergens: frozenset[Allergen] = frozenset()
    no_pork: bool = False
    preferred_categories: frozenset[str] = frozenset()
    disliked_item_ids: frozenset[str] = frozenset()
    must_have_item_ids: frozenset[str] = frozenset()
    max_unit_net_cents: int | None = None


@dataclass(frozen=True)
class ProductionSignal:
    item_id: str
    confidence: ProductionConfidence


@dataclass(frozen=True)
class CapacitySignal:
    item_id: str
    feasible: bool = True
    overload_penalty: int = 0
    reason_code: str | None = None

    def __post_init__(self) -> None:
        if self.overload_penalty < 0:
            raise ValueError("overload_penalty must be non-negative")


@dataclass(frozen=True)
class RecommendationCandidate:
    item_id: str
    score: int
    hard_reject_reasons: tuple[str, ...]
    explanations: tuple[str, ...]

    @property
    def eligible(self) -> bool:
        return not self.hard_reject_reasons


_PRODUCTION_BONUS: dict[ProductionConfidence, int] = {
    "CONFIRMED": 30,
    "LIKELY": 20,
    "OPEN_OFFER": 5,
}


def rank_items(
    items: list[Item],
    unit_net_cents_by_item_id: dict[str, int],
    request: RecommendationRequest,
    *,
    production_signals: tuple[ProductionSignal, ...] = (),
    capacity_signals: tuple[CapacitySignal, ...] = (),
) -> list[RecommendationCandidate]:
    """Rank items deterministically and return rejected candidates last.

    Production capacity is advisory operational context. It may apply a small soft
    ranking penalty, but it never rejects an otherwise valid catalog item. The human
    remains responsible for the final capacity decision.
    """

    production_bonus = _production_bonus_by_item(production_signals)
    capacity_by_item = {signal.item_id: signal for signal in capacity_signals}
    candidates = [
        _score_item(
            item,
            unit_net_cents_by_item_id.get(item.id),
            request,
            production_bonus.get(item.id, 0),
            capacity_by_item.get(item.id),
        )
        for item in items
    ]
    return sorted(
        candidates,
        key=lambda candidate: (
            not candidate.eligible,
            -candidate.score,
            candidate.item_id,
        ),
    )


def _score_item(
    item: Item,
    unit_net_cents: int | None,
    request: RecommendationRequest,
    production_bonus: int,
    capacity_signal: CapacitySignal | None,
) -> RecommendationCandidate:
    rejects: list[str] = []
    explanations: list[str] = []
    score = 0

    if item.module != "food":
        rejects.append("not_food")

    if request.diet_type is not None and not _diet_compatible(
        item.diet_type, request.diet_type
    ):
        rejects.append("diet_conflict")

    if request.no_pork and item.ingredient_flags.contains_pork:
        rejects.append("pork_conflict")

    if request.excluded_allergens:
        if not item.allergens_verified:
            rejects.append("allergens_unverified")
        elif request.excluded_allergens.intersection(item.allergens):
            rejects.append("allergen_conflict")

    if unit_net_cents is None:
        rejects.append("price_missing")
    elif unit_net_cents <= 0:
        rejects.append("non_positive_price")
    elif (
        request.max_unit_net_cents is not None
        and unit_net_cents > request.max_unit_net_cents
    ):
        rejects.append("over_unit_budget")

    if rejects:
        return RecommendationCandidate(
            item_id=item.id,
            score=0,
            hard_reject_reasons=tuple(sorted(set(rejects))),
            explanations=(),
        )

    if item.id in request.must_have_item_ids:
        score += 100
        explanations.append("must-have")
    if item.id in request.disliked_item_ids:
        score -= 40
        explanations.append("explicit dislike")
    if item.category in request.preferred_categories:
        score += 20
        explanations.append("preferred category")
    if production_bonus:
        score += production_bonus
        explanations.append(f"same-day production +{production_bonus}")

    if capacity_signal is not None:
        capacity_reason = capacity_signal.reason_code
        if capacity_reason in _CAPACITY_LOAD_REASON_CODES:
            penalty = _CAPACITY_SCORE_PENALTY[capacity_reason]
            score -= penalty
            explanations.append(
                f"capacity advisory: {capacity_signal.overload_penalty}% load, -{penalty}"
            )
        elif capacity_reason is not None:
            explanations.append("capacity advisory: capacity data unavailable or incomplete")
        elif not capacity_signal.feasible:
            explanations.append("capacity advisory: limit or data issue")
        else:
            fallback_reason = _capacity_reason_from_percent(
                capacity_signal.overload_penalty
            )
            if fallback_reason is not None:
                penalty = _CAPACITY_SCORE_PENALTY[fallback_reason]
                score -= penalty
                explanations.append(
                    f"capacity advisory: {capacity_signal.overload_penalty}% load, "
                    f"-{penalty}"
                )

    assert unit_net_cents is not None
    if request.profile == "ECONOMIC":
        score += max(0, 25 - unit_net_cents // 100)
        explanations.append("economic price weighting")
    elif request.profile == "PREMIUM":
        score += min(20, unit_net_cents // 250)
        explanations.append("premium price weighting")
    else:
        score += 10
        explanations.append("balanced base score")

    return RecommendationCandidate(
        item_id=item.id,
        score=score,
        hard_reject_reasons=(),
        explanations=tuple(explanations),
    )


def _capacity_reason_from_percent(load_percent: int) -> str | None:
    if load_percent >= 100:
        return "CAPACITY_EXCEEDED"
    if load_percent >= 90:
        return "CAPACITY_NEAR_LIMIT"
    if load_percent >= 80:
        return "CAPACITY_HIGH"
    if load_percent >= 70:
        return "CAPACITY_ELEVATED"
    return None


def _production_bonus_by_item(
    signals: tuple[ProductionSignal, ...],
) -> dict[str, int]:
    bonuses: dict[str, int] = {}
    for signal in signals:
        bonuses[signal.item_id] = max(
            bonuses.get(signal.item_id, 0),
            _PRODUCTION_BONUS[signal.confidence],
        )
    return bonuses


def _diet_compatible(item_diet: DietType, required: DietType) -> bool:
    if required == DietType.vegan:
        return item_diet == DietType.vegan
    if required == DietType.vegetarian:
        return item_diet in {DietType.vegetarian, DietType.vegan}
    if required == DietType.pescetarian:
        return item_diet in {
            DietType.pescetarian,
            DietType.vegetarian,
            DietType.vegan,
        }
    return True
