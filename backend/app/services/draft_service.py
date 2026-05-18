import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.models.draft import SavedOfferDraft

DRAFTS_DIR = Path(__file__).resolve().parent.parent / "data" / "drafts"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _ensure_drafts_dir() -> None:
    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)


def _draft_path(draft_id: str) -> Path:
    if not draft_id or "/" in draft_id or "\\" in draft_id or ".." in draft_id:
        raise ValueError("invalid draft id")
    return DRAFTS_DIR / f"{draft_id}.json"


def _write_draft(draft: SavedOfferDraft) -> None:
    _ensure_drafts_dir()
    path = _draft_path(draft.id)
    path.write_text(
        json.dumps(draft.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _read_draft_file(path: Path) -> SavedOfferDraft | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return SavedOfferDraft.model_validate(data)
    except (json.JSONDecodeError, ValueError):
        return None


def list_drafts() -> list[SavedOfferDraft]:
    _ensure_drafts_dir()
    drafts: list[SavedOfferDraft] = []
    for path in DRAFTS_DIR.glob("*.json"):
        draft = _read_draft_file(path)
        if draft is not None:
            drafts.append(draft)
    drafts.sort(key=lambda d: d.updatedAt, reverse=True)
    return drafts


def get_draft(draft_id: str) -> SavedOfferDraft | None:
    try:
        return _read_draft_file(_draft_path(draft_id))
    except ValueError:
        return None


def create_draft(payload: dict) -> SavedOfferDraft:
    now = _now_iso()
    draft = SavedOfferDraft(
        id=str(uuid4()),
        createdAt=now,
        updatedAt=now,
        payload=payload,
    )
    _write_draft(draft)
    return draft


def update_draft(draft_id: str, payload: dict) -> SavedOfferDraft | None:
    try:
        _draft_path(draft_id)
    except ValueError:
        return None
    existing = get_draft(draft_id)
    if existing is None:
        return None
    updated = SavedOfferDraft(
        id=existing.id,
        createdAt=existing.createdAt,
        updatedAt=_now_iso(),
        status=existing.status,
        source=existing.source,
        payload=payload,
    )
    _write_draft(updated)
    return updated


def delete_draft(draft_id: str) -> bool:
    try:
        path = _draft_path(draft_id)
    except ValueError:
        return False
    if not path.is_file():
        return False
    path.unlink()
    return True
