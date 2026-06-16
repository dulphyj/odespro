from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.dependencies import get_current_superuser
from app.models.user import User
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, PermissionResponse
from app.schemas.common import MessageResponse
from app.services import role_service
from app.services.audit_service import log_action

router = APIRouter(tags=["roles"])


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await role_service.get_roles(db)


@router.get("/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await role_service.get_permissions(db)


@router.post("", response_model=RoleResponse, status_code=201)
async def create_role(
    body: RoleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    role = await role_service.create_role(db, body)
    await log_action(db, current_user.id, current_user.username, "ROLE_CREATE", "ROLE", str(role.id), f"Created role {role.name}")
    return role


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await role_service.get_role(db, role_id)


@router.put("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    body: RoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    role = await role_service.update_role(db, role_id, body)
    await log_action(db, current_user.id, current_user.username, "ROLE_UPDATE", "ROLE", str(role_id), f"Updated role {role.name}")
    return role


@router.delete("/{role_id}", response_model=MessageResponse)
async def delete_role(
    role_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    role = await role_service.get_role(db, role_id)
    await role_service.delete_role(db, role_id)
    await log_action(db, current_user.id, current_user.username, "ROLE_DELETE", "ROLE", str(role_id), f"Deleted role {role.name}")
    return MessageResponse(message="Role deleted successfully")


@router.post("/{role_id}/permissions", response_model=RoleResponse)
async def assign_permissions(
    role_id: int,
    permission_codes: list[str],
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_superuser),
):
    role = await role_service.assign_permissions_to_role(db, role_id, permission_codes)
    await log_action(db, current_user.id, current_user.username, "ROLE_PERMISSIONS_ASSIGN", "ROLE", str(role_id), f"Assigned permissions to role {role.name}")
    return role
