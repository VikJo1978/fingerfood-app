from typing import Any, Literal

from pydantic import BaseModel, Field


class CreateDraftRequest(BaseModel):
    payload: dict[str, Any]


class UpdateDraftRequest(BaseModel):
    payload: dict[str, Any]


class SavedOfferDraft(BaseModel):
    id: str
    createdAt: str
    updatedAt: str
    status: Literal["draft"] = "draft"
    source: Literal["configurator"] = "configurator"
    payload: dict[str, Any]


class DeleteDraftResponse(BaseModel):
    ok: bool = True
