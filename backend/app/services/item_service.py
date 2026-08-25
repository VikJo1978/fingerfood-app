import json
from pathlib import Path
from typing import Any

from app.models.item import Item

_RECOMMENDATION_APPLICABILITY_FILE = "recommendation_applicability.json"


def _load_recommendation_applicability(path: Path) -> dict[str, Any]:
    metadata_path = path.with_name(_RECOMMENDATION_APPLICABILITY_FILE)
    if not metadata_path.exists():
        return {}
    data = json.loads(metadata_path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def _recommendation_metadata_for_row(
    row: dict[str, Any], metadata: dict[str, Any]
) -> dict[str, Any]:
    category_rules = metadata.get("category_rules")
    item_rules = metadata.get("item_rules")

    result: dict[str, Any] = {}
    if isinstance(category_rules, dict):
        category = row.get("category")
        category_rule = category_rules.get(category) if isinstance(category, str) else None
        if isinstance(category_rule, dict):
            result.update(category_rule)

    if isinstance(item_rules, dict):
        item_id = row.get("id")
        item_rule = item_rules.get(item_id) if isinstance(item_id, str) else None
        if isinstance(item_rule, dict):
            result.update(item_rule)

    return result


def load_items(path: Path) -> list[Item]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []

    metadata = _load_recommendation_applicability(path)
    items: list[Item] = []
    for raw_row in data:
        if not isinstance(raw_row, dict):
            continue
        row = dict(raw_row)
        row.update(_recommendation_metadata_for_row(row, metadata))
        items.append(Item.model_validate(row))
    return items
