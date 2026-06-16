from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.ocr import OcrRequest, OcrResponse, OcrResultResponse
from app.schemas.common import MessageResponse
from app.services import ocr_service
from app.services.audit_service import log_action

router = APIRouter(tags=["ocr"])


@router.post("/process", response_model=list[OcrResponse], status_code=201)
async def process_ocr(
    body: OcrRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = await ocr_service.process_document_ocr(db, body.document_id, body.pages)
    await log_action(
        db, current_user.id, current_user.username, "OCR_PROCESS",
        "DOCUMENT", str(body.document_id),
        f"OCR processed for document {body.document_id}",
        ip_address=request.client.host if request.client else None,
    )
    return results


@router.get("/{document_id}", response_model=list[OcrResultResponse])
async def get_ocr_results(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results = await ocr_service.get_ocr_results(db, document_id)
    return [
        OcrResultResponse(
            id=r.id,
            document_id=r.document_id,
            page_number=r.page.page_number if r.page else 0,
            full_text=r.full_text or "",
            confidence=r.confidence or 0.0,
            created_at=r.created_at,
        )
        for r in results
    ]


@router.get("/page/{page_id}", response_model=OcrResultResponse)
async def get_ocr_by_page(
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await ocr_service.get_ocr_by_page(db, page_id)
    return OcrResultResponse(
        id=result.id,
        document_id=result.document_id,
        page_number=result.page.page_number if result.page else 0,
        full_text=result.full_text or "",
        confidence=result.confidence or 0.0,
        created_at=result.created_at,
    )
