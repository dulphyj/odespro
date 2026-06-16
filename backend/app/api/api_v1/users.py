from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.dependencies import get_current_superuser, check_permissions
from app.models.user import User
from app.models.role import UserRole, Role
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.common import MessageResponse
from app.core.exceptions import NotFoundError
from app.services import user_service
from app.services.audit_service import log_action

router = APIRouter(tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    return await user_service.get_users(db, skip=skip, limit=limit)


@router.post("", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.create_user(db, body)
    await log_action(db, current_user.id, current_user.username, "USER_CREATE", "USER", str(user.id), f"Created user {user.username}")
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    return await user_service.get_user(db, user_id)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.update_user(db, user_id, body)
    await log_action(db, current_user.id, current_user.username, "USER_UPDATE", "USER", str(user_id), f"Updated user {user.username}")
    return user


@router.delete("/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.get_user(db, user_id)
    await user_service.delete_user(db, user_id)
    await log_action(db, current_user.id, current_user.username, "USER_DELETE", "USER", str(user_id), f"Deleted user {user.username}")
    return MessageResponse(message="User deleted successfully")


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.activate_user(db, user_id)
    await log_action(db, current_user.id, current_user.username, "USER_ACTIVATE", "USER", str(user_id), f"Activated user {user.username}")
    return user


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.deactivate_user(db, user_id)
    await log_action(db, current_user.id, current_user.username, "USER_DEACTIVATE", "USER", str(user_id), f"Deactivated user {user.username}")
    return user


@router.post("/{user_id}/roles", response_model=UserResponse)
async def assign_user_roles(
    user_id: int,
    role_ids: list[int],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    user = await user_service.get_user(db, user_id)

    result = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id)
    )
    existing = result.scalars().all()
    for ur in existing:
        await db.delete(ur)

    for rid in role_ids:
        role_result = await db.execute(
            select(Role).where(Role.id == rid)
        )
        role = role_result.scalars().first()
        if not role:
            raise NotFoundError(f"Role with id {rid} not found")
        db.add(UserRole(user_id=user_id, role_id=rid))

    await db.flush()
    await log_action(db, current_user.id, current_user.username, "USER_ROLES_ASSIGN", "USER", str(user_id), f"Assigned roles to user {user.username}")
    return user
