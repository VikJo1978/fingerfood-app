"""Stable Catalog dish_id mapping — must match Core seed_catalog_from_items.py."""

from __future__ import annotations

import re
import uuid

CATALOG_NAMESPACE = uuid.UUID("6d1c0000-0000-4000-8000-000000000001")
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def dish_id_from_source_id(source_id: str) -> str:
    if _UUID_RE.match(source_id):
        return source_id
    return str(uuid.uuid5(CATALOG_NAMESPACE, source_id))
