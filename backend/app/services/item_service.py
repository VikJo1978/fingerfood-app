import json
from pathlib import Path

from app.models.item import Item


def load_items(path: Path) -> list[Item]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return []
    return [Item.model_validate(row) for row in data]
