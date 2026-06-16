import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import async_session_factory
from app.services.ocr_service import process_document_ocr
from app.services.document_service import get_document

logger = logging.getLogger(__name__)

async def process_document_background(document_id: int, user_id: int | None = None, pages: list[int] | None = None):
    try:
        async with async_session_factory() as db:
            doc = await get_document(db, document_id)
            if not doc:
                logger.error(f"Document {document_id} not found")
                return
            ocr_results = await process_document_ocr(db, document_id, pages)
            logger.info(f"Document {document_id} OCR completed: {len(ocr_results)} pages")
    except Exception as e:
        logger.error(f"OCR processing failed for document {document_id}: {e}", exc_info=True)

async def process_ocr_queue():
    while True:
        await asyncio.sleep(5)
