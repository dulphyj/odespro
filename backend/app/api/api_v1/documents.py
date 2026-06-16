from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.document import (
    DocumentCreate, DocumentUpdate, DocumentResponse,
    DocumentListResponse, DocumentPageResponse,
    DocumentVersionResponse, DocumentIndexResponse,
)
from app.schemas.common import MessageResponse
from app.services import document_service
from app.services.storage_service import StorageService
from app.services.audit_service import log_action

storage_service = StorageService()
router = APIRouter(tags=["documents"])


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    folder_id: Optional[int] = Query(None, description="Filter by folder"),
    search: Optional[str] = Query(None, description="Search in title/description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    skip = (page - 1) * page_size
    documents, total = await document_service.get_documents(
        db, folder_id=folder_id, skip=skip, limit=page_size, search=search
    )
    return DocumentListResponse(
        items=documents,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    title: str = Form(...),
    description: Optional[str] = Form(None),
    folder_id: Optional[int] = Form(None),
    document_type_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc_create = DocumentCreate(
        title=title,
        description=description,
        folder_id=folder_id,
        document_type_id=document_type_id,
    )
    file_data = await file.read()
    document = await document_service.create_document(db, doc_create, current_user.id, file_data, content_type=file.content_type)
    await log_action(
        db, current_user.id, current_user.username, "DOCUMENT_CREATE",
        "DOCUMENT", str(document.id),
        f"Created document {document.title}",
        details={"file_name": file.filename, "file_size": len(file_data)},
        ip_address=request.client.host if request and request.client else None,
    )
    return document


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_document(db, document_id)


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    body: DocumentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.update_document(db, document_id, body)
    await log_action(db, current_user.id, current_user.username, "DOCUMENT_UPDATE", "DOCUMENT", str(document_id), f"Updated document {document.title}")
    return document


@router.delete("/{document_id}", response_model=MessageResponse)
async def delete_document(
    document_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.get_document(db, document_id)
    await document_service.delete_document(db, document_id)
    await log_action(db, current_user.id, current_user.username, "DOCUMENT_DELETE", "DOCUMENT", str(document_id), f"Deleted document {document.title}")
    return MessageResponse(message="Document deleted successfully")


@router.get("/{document_id}/download")
async def download_document(
    document_id: int,
    inline: bool = Query(False, description="Inline (preview) vs attachment download"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.get_document(db, document_id)
    file_data = await storage_service.download_file("documents", document.storage_path)
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        BytesIO(file_data),
        media_type=document.mime_type,
        headers={"Content-Disposition": f'{disposition}; filename="{document.file_name}"'},
    )


@router.get("/{document_id}/preview")
async def preview_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = await document_service.get_document(db, document_id)
    if document.pages and document.pages[0].thumbnail_path:
        file_data = await storage_service.download_file("thumbnails", document.pages[0].thumbnail_path)
    else:
        file_data = await storage_service.download_file("documents", document.storage_path)
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    return StreamingResponse(BytesIO(file_data), media_type="image/png")


@router.get("/{document_id}/pages", response_model=list[DocumentPageResponse])
async def list_document_pages(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_document_pages(db, document_id)


@router.get("/{document_id}/pages/{page_id}/image")
async def get_page_image(
    document_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.document import DocumentPage
    result = await db.execute(
        select(DocumentPage).where(DocumentPage.id == page_id, DocumentPage.document_id == document_id)
    )
    page = result.scalars().first()
    if not page or not page.storage_path:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Page not found")
    file_data = await storage_service.download_file("documents", page.storage_path)
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    ext = page.storage_path.rsplit(".", 1)[-1].lower() if "." in page.storage_path else "png"
    media_type = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "tiff": "image/tiff"}.get(ext, "image/png")
    return StreamingResponse(BytesIO(file_data), media_type=media_type)


@router.get("/{document_id}/pages/{page_id}/thumbnail")
async def get_page_thumbnail(
    document_id: int,
    page_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.document import DocumentPage
    result = await db.execute(
        select(DocumentPage).where(DocumentPage.id == page_id, DocumentPage.document_id == document_id)
    )
    page = result.scalars().first()
    if not page:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Page not found")
    thumb_path = page.thumbnail_path or page.storage_path
    bucket = "thumbnails" if page.thumbnail_path else "documents"
    try:
        file_data = await storage_service.download_file(bucket, thumb_path)
    except FileNotFoundError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    from io import BytesIO
    from fastapi.responses import StreamingResponse
    ext = thumb_path.rsplit(".", 1)[-1].lower() if "." in thumb_path else "png"
    media_type = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "tiff": "image/tiff"}.get(ext, "image/png")
    return StreamingResponse(BytesIO(file_data), media_type=media_type)


@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
async def list_document_versions(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await document_service.get_document_versions(db, document_id)


@router.post("/{document_id}/versions", response_model=DocumentVersionResponse, status_code=201)
async def create_document_version(
    document_id: int,
    file: UploadFile = File(...),
    changes_description: Optional[str] = Form(None),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_data = await file.read()
    version = await document_service.create_version(
        db, document_id, file_data, current_user.id, changes_description
    )
    await log_action(
        db, current_user.id, current_user.username, "DOCUMENT_VERSION",
        "DOCUMENT", str(document_id),
        f"Created version {version.version_number}",
    )
    return version


@router.get("/{document_id}/indexes", response_model=list[DocumentIndexResponse])
async def list_document_indexes(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.document import DocumentIndex
    result = await db.execute(
        select(DocumentIndex)
        .where(DocumentIndex.document_id == document_id)
        .order_by(DocumentIndex.field_name)
    )
    return list(result.scalars().all())


@router.post("/{document_id}/indexes", response_model=DocumentIndexResponse, status_code=201)
async def add_document_index(
    document_id: int,
    field_name: str = Form(...),
    field_value: str = Form(...),
    field_type: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models.document import DocumentIndex

    document = await document_service.get_document(db, document_id)

    result = await db.execute(
        select(DocumentIndex).where(
            DocumentIndex.document_id == document_id,
            DocumentIndex.field_name == field_name,
        )
    )
    existing = result.scalars().first()
    if existing:
        existing.field_value = field_value
        existing.field_type = field_type
        db.add(existing)
        await db.flush()
        return existing

    idx = DocumentIndex(
        document_id=document_id,
        field_name=field_name,
        field_value=field_value,
        field_type=field_type,
    )
    db.add(idx)
    await db.flush()
    return idx


class _RotateRequest(BaseModel):
    degrees: int

class _ReorderRequest(BaseModel):
    page_ids: list[int]


@router.put("/{document_id}/pages/{page_id}/rotate", response_model=DocumentPageResponse)
async def rotate_document_page(
    document_id: int,
    page_id: int,
    body: _RotateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    page = await document_service.rotate_page(db, page_id, document_id, body.degrees)
    await log_action(db, current_user.id, current_user.username, "PAGE_ROTATE", "DOCUMENT", str(document_id), f"Rotated page {page_id}")
    return page


@router.delete("/{document_id}/pages/{page_id}", response_model=MessageResponse)
async def delete_document_page(
    document_id: int,
    page_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await document_service.delete_page(db, page_id, document_id)
    await log_action(db, current_user.id, current_user.username, "PAGE_DELETE", "DOCUMENT", str(document_id), f"Deleted page {page_id}")
    return MessageResponse(message="Page deleted")


@router.put("/{document_id}/pages/reorder", response_model=list[DocumentPageResponse])
async def reorder_document_pages(
    document_id: int,
    body: _ReorderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pages = await document_service.reorder_pages(db, document_id, body.page_ids)
    await log_action(db, current_user.id, current_user.username, "PAGE_REORDER", "DOCUMENT", str(document_id), "Reordered pages")
    return pages
