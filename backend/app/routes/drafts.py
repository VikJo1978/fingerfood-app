from fastapi import APIRouter, HTTPException

from app.models.draft import (
    CreateDraftRequest,
    DeleteDraftResponse,
    SavedOfferDraft,
    UpdateDraftRequest,
)
from app.services import draft_service

router = APIRouter(prefix="/api/drafts", tags=["drafts"])


@router.post("", response_model=SavedOfferDraft)
def create_draft(body: CreateDraftRequest) -> SavedOfferDraft:
    return draft_service.create_draft(body.payload)


@router.get("", response_model=list[SavedOfferDraft])
def list_drafts() -> list[SavedOfferDraft]:
    return draft_service.list_drafts()


@router.get("/{draft_id}", response_model=SavedOfferDraft)
def get_draft(draft_id: str) -> SavedOfferDraft:
    draft = draft_service.get_draft(draft_id)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.put("/{draft_id}", response_model=SavedOfferDraft)
def update_draft(draft_id: str, body: UpdateDraftRequest) -> SavedOfferDraft:
    draft = draft_service.update_draft(draft_id, body.payload)
    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return draft


@router.delete("/{draft_id}", response_model=DeleteDraftResponse)
def delete_draft(draft_id: str) -> DeleteDraftResponse:
    if not draft_service.delete_draft(draft_id):
        raise HTTPException(status_code=404, detail="Draft not found")
    return DeleteDraftResponse()
