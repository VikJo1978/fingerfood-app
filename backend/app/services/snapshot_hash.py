"""Canonical OfferSnapshot content hash — matches Core offer_snapshot.py."""

from __future__ import annotations

import hashlib
import json
import re

_SNAPSHOT_HASH_RE = re.compile(r"sha256:[0-9a-f]{64}\Z")


def canonical_snapshot_json(value: object) -> str:
    return _serialize_json_value(value)


def compute_snapshot_hash(payload: dict[str, object]) -> str:
    body = {key: value for key, value in payload.items() if key != "snapshot_hash"}
    canonical = canonical_snapshot_json(body)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def _serialize_json_value(value: object) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        raise ValueError("floating-point values are forbidden")
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(_serialize_json_value(item) for item in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("JSON object keys must be strings")
        parts = [
            json.dumps(key, ensure_ascii=False)
            + ":"
            + _serialize_json_value(value[key])
            for key in sorted(value)
        ]
        return "{" + ",".join(parts) + "}"
    raise ValueError(f"unsupported JSON value type: {type(value)!r}")
