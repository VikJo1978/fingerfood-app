"""Bearer auth for fingerfood commercial write endpoints."""

from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_fingerfood_api_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Reject unauthenticated access to commercial write routes."""
    expected = settings.fingerfood_api_token
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="FINGERFOOD_API_TOKEN not configured",
        )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
