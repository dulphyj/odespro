from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.schemas.audit import AuditFilter


async def log_action(
    db: AsyncSession,
    user_id: Optional[int],
    username: Optional[str],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    description: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    audit = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(audit)
    await db.flush()
    return audit


async def get_audit_logs(
    db: AsyncSession,
    filters: AuditFilter,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[AuditLog], int]:
    conditions = []
    if filters.action:
        conditions.append(AuditLog.action == filters.action)
    if filters.entity_type:
        conditions.append(AuditLog.entity_type == filters.entity_type)
    if filters.user_id is not None:
        conditions.append(AuditLog.user_id == filters.user_id)
    if filters.date_from:
        conditions.append(AuditLog.created_at >= filters.date_from)
    if filters.date_to:
        conditions.append(AuditLog.created_at <= filters.date_to)

    query = select(AuditLog)
    if conditions:
        query = query.where(and_(*conditions))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    logs = list(result.scalars().all())

    return logs, total


async def get_user_activity(
    db: AsyncSession, user_id: int, days: int = 30
) -> list[AuditLog]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user_id, AuditLog.created_at >= since)
        .order_by(AuditLog.created_at.desc())
    )
    return list(result.scalars().all())


async def get_entity_history(
    db: AsyncSession, entity_type: str, entity_id: str
) -> list[AuditLog]:
    result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_type == entity_type,
            AuditLog.entity_id == entity_id,
        )
        .order_by(AuditLog.created_at.desc())
    )
    return list(result.scalars().all())
