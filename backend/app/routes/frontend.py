"""Optional production SPA hosting from a pre-built frontend directory."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

from app.core.config import settings

router = APIRouter(include_in_schema=False)

_SPA_SHELL_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}
_REVALIDATE_HEADERS = {"Cache-Control": "no-cache, must-revalidate, max-age=0"}
_IMMUTABLE_ASSET_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


def _configured_dist() -> Path:
    configured = settings.frontend_dist_path
    if configured is None:
        raise HTTPException(status_code=503, detail="Frontend is not configured")
    dist = configured.resolve()
    if not dist.is_dir() or not (dist / "index.html").is_file():
        raise HTTPException(status_code=503, detail="Frontend build is unavailable")
    return dist


def _static_file(dist: Path, frontend_path: str) -> Path | None:
    candidate = (dist / frontend_path).resolve()
    try:
        candidate.relative_to(dist)
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@router.get("/{frontend_path:path}", response_class=FileResponse)
def frontend_spa(frontend_path: str) -> Response:
    """Serve built assets and use index.html only for non-API frontend routes."""

    if frontend_path == "api" or frontend_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")

    dist = _configured_dist()
    static_file = _static_file(dist, frontend_path) if frontend_path else None
    if static_file is not None:
        if frontend_path.startswith("assets/"):
            return FileResponse(static_file, headers=_IMMUTABLE_ASSET_HEADERS)
        if static_file.name == "index.html":
            return FileResponse(static_file, headers=_SPA_SHELL_HEADERS)
        return FileResponse(static_file, headers=_REVALIDATE_HEADERS)
    if frontend_path.startswith("assets/"):
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(dist / "index.html", headers=_SPA_SHELL_HEADERS)
