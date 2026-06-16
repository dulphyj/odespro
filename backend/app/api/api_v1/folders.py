from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.folder import FolderCreate, FolderUpdate, FolderResponse
from app.schemas.document import DocumentResponse
from app.schemas.common import MessageResponse
from app.services import folder_service
from app.services.audit_service import log_action

router = APIRouter(tags=["folders"])


@router.get("", response_model=list[FolderResponse])
async def list_folders(
    parent_id: Optional[int] = Query(None, description="Filter by parent folder ID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await folder_service.get_folders(db, parent_id=parent_id)


@router.post("", response_model=FolderResponse, status_code=201)
async def create_folder(
    body: FolderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = await folder_service.create_folder(db, body, current_user.id)
    await log_action(db, current_user.id, current_user.username, "FOLDER_CREATE", "FOLDER", str(folder.id), f"Created folder {folder.name}", ip_address=request.client.host if request.client else None)
    return folder


@router.get("/tree", response_model=list[dict])
async def get_folder_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await folder_service.get_folder_tree(db)


@router.get("/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await folder_service.get_folder(db, folder_id)


@router.put("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    body: FolderUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = await folder_service.update_folder(db, folder_id, body)
    await log_action(db, current_user.id, current_user.username, "FOLDER_UPDATE", "FOLDER", str(folder_id), f"Updated folder {folder.name}")
    return folder


@router.delete("/{folder_id}", response_model=MessageResponse)
async def delete_folder(
    folder_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    folder = await folder_service.get_folder(db, folder_id)
    await folder_service.delete_folder(db, folder_id)
    await log_action(db, current_user.id, current_user.username, "FOLDER_DELETE", "FOLDER", str(folder_id), f"Deleted folder {folder.name}")
    return MessageResponse(message="Folder deleted successfully")


@router.get("/{folder_id}/documents", response_model=list[DocumentResponse])
async def list_folder_documents(
    folder_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.document_service import get_documents
    docs, _ = await get_documents(db, folder_id=folder_id, skip=skip, limit=limit)
    return docs
