import time
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError
from app.models.document import Document, DocumentPage
from app.models.ocr import OcrResult


async def process_document_ocr(
    db: AsyncSession,
    document_id: int,
    pages: Optional[list[int]] = None,
) -> list[OcrResult]:
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalars().first()
    if not document:
        raise NotFoundError(f"Document with id {document_id} not found")

    pages_query = select(DocumentPage).where(
        DocumentPage.document_id == document_id
    ).order_by(DocumentPage.page_number)
    if pages:
        pages_query = pages_query.where(DocumentPage.page_number.in_(pages))

    pages_result = await db.execute(pages_query)
    document_pages = list(pages_result.scalars().all())

    if not document_pages:
        from app.services.document_service import split_pdf_to_pages
        try:
            document_pages = await split_pdf_to_pages(db, document_id)
        except Exception as e:
            raise ValidationError(f"Cannot process document: no pages available and PDF splitting failed: {e}")

    ocr_results = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for page in document_pages:
            if not page.storage_path:
                continue

            from app.services.storage_service import StorageService
            storage = StorageService()
            try:
                image_data = await storage.download_file("documents", page.storage_path)
            except FileNotFoundError:
                continue

            start_time = time.time()
            try:
                files = {"file": (f"page_{page.page_number}.png", image_data, "image/png")}
                response = await client.post(
                    f"{settings.OCR_SERVICE_URL}/ocr/file",
                    files=files,
                    params={"language": "latin"},
                )
                response.raise_for_status()
                ocr_data = response.json()
            except httpx.HTTPError as e:
                raise RuntimeError(f"OCR service error for page {page.page_number}: {e}")

            processing_time = int((time.time() - start_time) * 1000)
            full_text = ocr_data.get("text", "")
            confidence = ocr_data.get("confidence", 0.0)

            page.ocr_text = full_text
            page.ocr_confidence = confidence
            db.add(page)

            ocr_result = OcrResult(
                document_id=document_id,
                page_id=page.id,
                full_text=full_text,
                confidence=confidence,
                processing_time_ms=processing_time,
                language=ocr_data.get("language", "latin"),
                raw_data=ocr_data,
            )
            db.add(ocr_result)
            ocr_results.append(ocr_result)

    document.is_indexed = True
    db.add(document)
    await db.flush()

    from app.services.classification_service import classify_document_by_text
    await classify_document_by_text(db, document_id)

    return ocr_results


async def get_ocr_results(db: AsyncSession, document_id: int) -> list[OcrResult]:
    result = await db.execute(
        select(OcrResult)
        .options(selectinload(OcrResult.page))
        .where(OcrResult.document_id == document_id)
        .order_by(OcrResult.created_at.desc())
    )
    return list(result.scalars().all())


async def get_ocr_by_page(db: AsyncSession, page_id: int) -> OcrResult:
    result = await db.execute(
        select(OcrResult)
        .options(selectinload(OcrResult.page))
        .where(OcrResult.page_id == page_id)
    )
    ocr = result.scalars().first()
    if not ocr:
        raise NotFoundError(f"OCR result for page {page_id} not found")
    return ocr
