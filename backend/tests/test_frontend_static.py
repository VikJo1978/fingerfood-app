"""Production frontend hosting must stay optional and separate from /api."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def frontend_dist(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text(
        '<!doctype html><main id="root">Fingerfood production UI</main>',
        encoding="utf-8",
    )
    (assets / "app.js").write_text("window.fingerfood = true;", encoding="utf-8")
    monkeypatch.setattr(settings, "frontend_dist_path", dist)
    return dist


def test_root_serves_index(frontend_dist: Path) -> None:
    response = TestClient(app).get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Fingerfood production UI" in response.text


def test_asset_is_served(frontend_dist: Path) -> None:
    response = TestClient(app).get("/assets/app.js")

    assert response.status_code == 200
    assert response.text == "window.fingerfood = true;"


def test_missing_asset_does_not_use_spa_fallback(frontend_dist: Path) -> None:
    response = TestClient(app).get("/assets/missing.js")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_unknown_frontend_route_uses_spa_fallback(frontend_dist: Path) -> None:
    response = TestClient(app).get("/angebot/preview")

    assert response.status_code == 200
    assert "Fingerfood production UI" in response.text


def test_api_unknown_never_uses_spa_fallback(frontend_dist: Path) -> None:
    response = TestClient(app).get("/api/unknown")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_missing_frontend_does_not_break_api(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "frontend_dist_path", tmp_path / "missing")
    client = TestClient(app)

    assert client.get("/api/health").status_code == 200
    response = client.get("/")
    assert response.status_code == 503
    assert response.json() == {"detail": "Frontend build is unavailable"}


def test_unconfigured_frontend_does_not_break_api(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "frontend_dist_path", None)
    client = TestClient(app)

    assert client.get("/api/health").status_code == 200
    response = client.get("/")
    assert response.status_code == 503
    assert response.json() == {"detail": "Frontend is not configured"}
