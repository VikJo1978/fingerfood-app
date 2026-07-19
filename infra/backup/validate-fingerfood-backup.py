#!/usr/bin/env python3
"""Validate Fingerfood backup bundle JSON against project Pydantic models."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DRAFT_FILENAME_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$"
)


def _repo_backend(repo_root: Path) -> Path:
    backend = repo_root / "backend"
    if not backend.is_dir():
        raise SystemExit(f"backend directory not found: {backend}")
    sys.path.insert(0, str(backend))
    return backend


def validate_bundle(bundle_root: Path, repo_root: Path) -> tuple[int, int]:
    _repo_backend(repo_root)
    from app.models.draft import SavedOfferDraft
    from app.models.item import Item

    items_path = bundle_root / "items.json"
    drafts_dir = bundle_root / "drafts"

    if not items_path.is_file():
        raise SystemExit("items.json missing in bundle")

    try:
        items_data = json.loads(items_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"items.json invalid JSON: {exc}") from exc

    if not isinstance(items_data, list):
        raise SystemExit("items.json must be a JSON array")

    items: list[Item] = []
    for index, row in enumerate(items_data):
        try:
            items.append(Item.model_validate(row))
        except Exception as exc:  # noqa: BLE001 - fail-closed validation surface
            raise SystemExit(f"items.json row {index} schema invalid: {exc}") from exc

    if not drafts_dir.is_dir():
        raise SystemExit("drafts/ directory missing in bundle")

    draft_count = 0
    for path in sorted(drafts_dir.iterdir(), key=lambda p: p.name):
        if path.name.startswith("."):
            raise SystemExit(f"unexpected hidden file in drafts/: {path.name}")
        if not path.is_file():
            raise SystemExit(f"unexpected non-file in drafts/: {path.name}")
        if not DRAFT_FILENAME_RE.match(path.name):
            raise SystemExit(f"invalid draft filename contract: {path.name}")
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"draft invalid JSON ({path.name}): {exc}") from exc
        try:
            SavedOfferDraft.model_validate(data)
        except Exception as exc:  # noqa: BLE001
            raise SystemExit(f"draft schema invalid ({path.name}): {exc}") from exc
        draft_count += 1

    return len(items), draft_count


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "usage: validate-fingerfood-backup.py <bundle_root> <repo_root>",
            file=sys.stderr,
        )
        return 2

    bundle_root = Path(sys.argv[1]).resolve()
    repo_root = Path(sys.argv[2]).resolve()

    if not bundle_root.is_dir():
        print(f"bundle root not found: {bundle_root}", file=sys.stderr)
        return 1

    item_count, draft_count = validate_bundle(bundle_root, repo_root)
    print(f"validation_ok item_count={item_count} draft_count={draft_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
