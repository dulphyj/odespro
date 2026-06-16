from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.dependencies import get_current_superuser
from app.models.user import User
from app.schemas.audit import AuditFilter, AuditLogResponse, AuditLogListResponse
from app.services import audit_service

router = APIRouter(tags=["audit"])


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    date_from: Optional[datetime] = Query(None, description="Start date"),
    date_to: Optional[datetime] = Query(None, description="End date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    filters = AuditFilter(
        action=action,
        entity_type=entity_type,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    skip = (page - 1) * page_size
    logs, total = await audit_service.get_audit_logs(db, filters, skip=skip, limit=page_size)
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/user/{user_id}", response_model=list[AuditLogResponse])
async def get_user_activity(
    user_id: int,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    logs = await audit_service.get_user_activity(db, user_id, days=days)
    return [AuditLogResponse.model_validate(log) for log in logs]


@router.get("/entity/{entity_type}/{entity_id}", response_model=list[AuditLogResponse])
async def get_entity_history(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = await audit_service.get_entity_history(db, entity_type, entity_id)
    return [AuditLogResponse.model_validate(log) for log in logs]
