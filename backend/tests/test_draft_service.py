"""Draft storage tests: CRUD, path-traversal rejection, corrupted-file tolerance."""

import pytest

from app.services import draft_service


@pytest.fixture(autouse=True)
def isolated_drafts_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(draft_service, "DRAFTS_DIR", tmp_path)
    return tmp_path


def test_create_get_roundtrip() -> None:
    created = draft_service.create_draft({"lines": [1, 2], "note": "ä"})
    loaded = draft_service.get_draft(created.id)
    assert loaded is not None
    assert loaded.payload == {"lines": [1, 2], "note": "ä"}
    assert loaded.createdAt == loaded.updatedAt


def test_update_preserves_created_at_and_bumps_updated() -> None:
    created = draft_service.create_draft({"v": 1})
    updated = draft_service.update_draft(created.id, {"v": 2})
    assert updated is not None
    assert updated.payload == {"v": 2}
    assert updated.createdAt == created.createdAt
    assert updated.updatedAt >= created.updatedAt


def test_update_missing_returns_none() -> None:
    assert draft_service.update_draft("00000000-0000-0000-0000-000000000000", {}) is None


def test_delete() -> None:
    created = draft_service.create_draft({})
    assert draft_service.delete_draft(created.id) is True
    assert draft_service.get_draft(created.id) is None
    assert draft_service.delete_draft(created.id) is False


def test_list_sorted_by_updated_desc(monkeypatch) -> None:
    # timestamps have seconds precision — drive the clock to make order deterministic
    ticks = iter(["2026-07-05T10:00:00+00:00", "2026-07-05T10:00:01+00:00", "2026-07-05T10:00:02+00:00"])
    monkeypatch.setattr(draft_service, "_now_iso", lambda: next(ticks))
    a = draft_service.create_draft({"n": "a"})
    b = draft_service.create_draft({"n": "b"})
    b2 = draft_service.update_draft(b.id, {"n": "b2"})
    listed = draft_service.list_drafts()
    assert [d.id for d in listed][0] == b2.id
    assert {d.id for d in listed} == {a.id, b.id}


@pytest.mark.parametrize("bad_id", ["../escape", "a/b", "a\\b", "", "..", "x/../y"])
def test_path_traversal_ids_rejected(bad_id: str) -> None:
    assert draft_service.get_draft(bad_id) is None
    assert draft_service.update_draft(bad_id, {}) is None
    assert draft_service.delete_draft(bad_id) is False


def test_corrupted_file_skipped_in_list(isolated_drafts_dir) -> None:
    draft_service.create_draft({"ok": True})
    (isolated_drafts_dir / "broken.json").write_text("{not json", encoding="utf-8")
    listed = draft_service.list_drafts()
    assert len(listed) == 1
