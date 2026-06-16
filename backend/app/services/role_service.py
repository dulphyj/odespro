from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.role import Role, Permission, RolePermission
from app.schemas.role import RoleCreate, RoleUpdate


async def get_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).order_by(Role.name)
    )
    return list(result.scalars().all())


async def get_role(db: AsyncSession, role_id: int) -> Role:
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalars().first()
    if not role:
        raise NotFoundError(f"Role with id {role_id} not found")
    return role


async def create_role(db: AsyncSession, role_create: RoleCreate) -> Role:
    existing = await db.execute(
        select(Role).where(Role.name == role_create.name).limit(1)
    )
    if existing.scalars().first():
        raise ValidationError(f"Role '{role_create.name}' already exists")

    role = Role(
        name=role_create.name,
        description=role_create.description,
    )
    db.add(role)
    await db.flush()

    if role_create.permission_codes:
        result = await db.execute(
            select(Permission).where(Permission.code.in_(role_create.permission_codes))
        )
        permissions = result.scalars().all()
        for perm in permissions:
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
        await db.flush()

    return role


async def update_role(db: AsyncSession, role_id: int, role_update: RoleUpdate) -> Role:
    role = await get_role(db, role_id)
    if role.is_system:
        raise ValidationError("System roles cannot be modified")

    update_data = role_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)
    db.add(role)
    await db.flush()
    return role


async def delete_role(db: AsyncSession, role_id: int) -> None:
    role = await get_role(db, role_id)
    if role.is_system:
        raise ValidationError("System roles cannot be deleted")
    await db.delete(role)
    await db.flush()


async def get_permissions(db: AsyncSession) -> list[Permission]:
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.name))
    return list(result.scalars().all())


async def assign_permissions_to_role(
    db: AsyncSession, role_id: int, permission_codes: list[str]
) -> Role:
    result = await db.execute(
        select(Role).options(selectinload(Role.permissions)).where(Role.id == role_id)
    )
    role = result.scalars().first()
    if not role:
        raise NotFoundError(f"Role with id {role_id} not found")
    if role.is_system:
        raise ValidationError("Cannot modify system role permissions")

    await db.execute(
        RolePermission.__table__.delete().where(RolePermission.role_id == role_id)
    )

    result = await db.execute(
        select(Permission).where(Permission.code.in_(permission_codes))
    )
    permissions = result.scalars().all()
    for perm in permissions:
        db.add(RolePermission(role_id=role.id, permission_id=perm.id))

    await db.flush()
    await db.refresh(role, ["permissions"])
    return role
