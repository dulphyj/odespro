import hashlib
import io
import mimetypes
import os
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.config import settings
from app.models.document import Document, DocumentPage, DocumentVersion, DocumentIndex
from app.models.folder import Folder
from app.schemas.document import DocumentCreate, DocumentUpdate
from app.services.storage_service import StorageService

storage_service = StorageService()


async def get_documents(
    db: AsyncSession,
    folder_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
) -> tuple[list[Document], int]:
    query = select(Document).where(Document.is_active == True)

    if folder_id is not None:
        query = query.where(Document.folder_id == folder_id)

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Document.title.ilike(search_term),
                Document.description.ilike(search_term),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    documents = list(result.scalars().all())

    return documents, total


async def get_document(db: AsyncSession, document_id: int) -> Document:
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalars().first()
    if not document:
        raise NotFoundError(f"Document with id {document_id} not found")
    return document


async def create_document(
    db: AsyncSession,
    doc_create: DocumentCreate,
    user_id: int,
    file_data: Optional[bytes] = None,
    content_type: Optional[str] = None,
) -> Document:
    document = Document(
        title=doc_create.title,
        description=doc_create.description,
        folder_id=doc_create.folder_id,
        document_type_id=doc_create.document_type_id,
        owner_id=user_id,
        file_name="",
        file_size=0,
        mime_type="application/octet-stream",
        storage_path="",
    )

    if file_data:
        file_hash = hashlib.sha256(file_data).hexdigest()
        if content_type and content_type != "application/octet-stream":
            mime_type = content_type
        else:
            mime_type, _ = mimetypes.guess_type(doc_create.title or "file")
            content_type = mime_type or "application/octet-stream"
        ext = os.path.splitext(doc_create.title or "file")[1]
        file_name = doc_create.title or f"document_{file_hash[:16]}{ext}"
        storage_path = f"documents/{user_id}/{file_hash[:16]}{ext}"

        await storage_service.upload_file("documents", storage_path, file_data, content_type)

        document.file_name = file_name
        document.file_size = len(file_data)
        document.mime_type = content_type
        document.storage_path = storage_path
        document.checksum = file_hash

    db.add(document)
    await db.flush()
    return document


async def update_document(
    db: AsyncSession, document_id: int, doc_update: DocumentUpdate
) -> Document:
    document = await get_document(db, document_id)
    update_data = doc_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)
    db.add(document)
    await db.flush()
    return document


async def delete_document(db: AsyncSession, document_id: int) -> None:
    document = await get_document(db, document_id)
    if document.storage_path:
        try:
            await storage_service.delete_file("documents", document.storage_path)
        except FileNotFoundError:
            pass
    for page in document.pages:
        if page.storage_path:
            try:
                await storage_service.delete_file("documents", page.storage_path)
            except FileNotFoundError:
                pass
        if page.thumbnail_path:
            try:
                await storage_service.delete_file("thumbnails", page.thumbnail_path)
            except FileNotFoundError:
                pass
    document.is_active = False
    db.add(document)
    await db.flush()


async def get_document_pages(db: AsyncSession, document_id: int) -> list[DocumentPage]:
    result = await db.execute(
        select(DocumentPage)
        .where(DocumentPage.document_id == document_id)
        .order_by(DocumentPage.page_number)
    )
    return list(result.scalars().all())


async def get_document_versions(
    db: AsyncSession, document_id: int
) -> list[DocumentVersion]:
    result = await db.execute(
        select(DocumentVersion)
        .where(DocumentVersion.document_id == document_id)
        .order_by(DocumentVersion.version_number.desc())
    )
    return list(result.scalars().all())


async def create_version(
    db: AsyncSession,
    document_id: int,
    file_data: bytes,
    user_id: int,
    changes_description: Optional[str] = None,
) -> DocumentVersion:
    document = await get_document(db, document_id)

    file_hash = hashlib.sha256(file_data).hexdigest()
    mime_type, _ = mimetypes.guess_type(document.file_name)
    content_type = mime_type or "application/octet-stream"
    ext = os.path.splitext(document.file_name)[1]
    new_version = document.current_version + 1
    storage_path = f"versions/{document_id}/v{new_version}{ext}"

    await storage_service.upload_file("documents", storage_path, file_data, content_type)

    version = DocumentVersion(
        document_id=document_id,
        version_number=new_version,
        file_name=document.file_name,
        file_size=len(file_data),
        storage_path=storage_path,
        checksum=file_hash,
        changes_description=changes_description,
        created_by=user_id,
    )
    db.add(version)

    document.current_version = new_version
    document.file_size = len(file_data)
    document.storage_path = storage_path
    document.checksum = file_hash
    db.add(document)

    await db.flush()
    return version


async def upload_document_file(
    db: AsyncSession, document_id: int, file_data: bytes, user_id: int
) -> Document:
    document = await get_document(db, document_id)

    file_hash = hashlib.sha256(file_data).hexdigest()
    mime_type, _ = mimetypes.guess_type(document.file_name)
    content_type = mime_type or "application/octet-stream"
    ext = os.path.splitext(document.file_name or "file")[1]
    storage_path = f"documents/{document.owner_id}/{file_hash[:16]}{ext}"

    await storage_service.upload_file("documents", storage_path, file_data, content_type)

    document.file_size = len(file_data)
    document.mime_type = content_type
    document.storage_path = storage_path
    document.checksum = file_hash

    if content_type.startswith("image/"):
        page = DocumentPage(
            document_id=document.id,
            page_number=1,
            storage_path=storage_path,
        )
        db.add(page)

    db.add(document)
    await db.flush()
    return document


async def search_documents_fulltext(
    db: AsyncSession,
    query: str,
    filters: Optional[dict] = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Document], int]:
    base = select(Document).where(Document.is_active == True)

    search_term = f"%{query}%"
    base = base.where(
        or_(
            Document.title.ilike(search_term),
            Document.description.ilike(search_term),
            Document.id.in_(
                select(DocumentPage.document_id).where(
                    DocumentPage.ocr_text.ilike(search_term)
                )
            ),
        )
    )

    if filters:
        if "folder_id" in filters and filters["folder_id"] is not None:
            base = base.where(Document.folder_id == filters["folder_id"])
        if "document_type_id" in filters:
            base = base.where(Document.document_type_id == filters["document_type_id"])
        if "owner_id" in filters:
            base = base.where(Document.owner_id == filters["owner_id"])
        if "classification" in filters:
            base = base.where(Document.classification == filters["classification"])
        if "date_from" in filters:
            base = base.where(Document.created_at >= filters["date_from"])
        if "date_to" in filters:
            base = base.where(Document.created_at <= filters["date_to"])
        if "is_indexed" in filters:
            base = base.where(Document.is_indexed == filters["is_indexed"])

    count_query = select(func.count()).select_from(base.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    base = base.order_by(Document.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(base)
    documents = list(result.scalars().all())

    return documents, total


async def split_pdf_to_pages(
    db: AsyncSession, document_id: int
) -> list[DocumentPage]:
    document = await get_document(db, document_id)
    if not document.storage_path:
        raise ValidationError("Document has no file")

    existing = await get_document_pages(db, document_id)
    if existing:
        return existing

    file_data = await storage_service.download_file("documents", document.storage_path)
    import fitz
    doc = fitz.open(stream=file_data, filetype="pdf")
    pages = []
    for i in range(len(doc)):
        page = doc[i]
        pix = page.get_pixmap(dpi=200)
        img_data = pix.tobytes("png")
        page_hash = hashlib.sha256(img_data).hexdigest()
        storage_path = f"pages/{document_id}/{page_hash[:16]}.png"
        await storage_service.upload_file("documents", storage_path, img_data, "image/png")
        dp = DocumentPage(
            document_id=document_id,
            page_number=i + 1,
            storage_path=storage_path,
            width=pix.width,
            height=pix.height,
        )
        db.add(dp)
        pages.append(dp)
    doc.close()
    document.page_count = len(pages)
    db.add(document)
    await db.flush()
    return pages


async def rotate_page(
    db: AsyncSession, page_id: int, document_id: int, degrees: int
) -> DocumentPage:
    result = await db.execute(
        select(DocumentPage).where(DocumentPage.id == page_id, DocumentPage.document_id == document_id)
    )
    page = result.scalars().first()
    if not page:
        raise NotFoundError("Page not found")
    page.rotation = (page.rotation + degrees) % 360
    db.add(page)
    await db.flush()
    return page


async def delete_page(
    db: AsyncSession, page_id: int, document_id: int
) -> None:
    result = await db.execute(
        select(DocumentPage).where(DocumentPage.id == page_id, DocumentPage.document_id == document_id)
    )
    page = result.scalars().first()
    if not page:
        raise NotFoundError("Page not found")
    if page.storage_path:
        try:
            await storage_service.delete_file("documents", page.storage_path)
        except FileNotFoundError:
            pass
    await db.delete(page)
    remaining = await get_document_pages(db, document_id)
    for i, p in enumerate(remaining):
        p.page_number = i + 1
        db.add(p)
    document = await get_document(db, document_id)
    document.page_count = len(remaining)
    db.add(document)
    await db.flush()


async def reorder_pages(
    db: AsyncSession, document_id: int, page_ids: list[int]
) -> list[DocumentPage]:
    existing = await get_document_pages(db, document_id)
    existing_ids = {p.id for p in existing}
    if set(page_ids) != existing_ids:
        raise ValidationError("Page IDs must match all document pages")
    for i, pid in enumerate(page_ids):
        for p in existing:
            if p.id == pid:
                p.page_number = i + 1
                db.add(p)
                break
    await db.flush()
    return sorted(existing, key=lambda p: p.page_number)
