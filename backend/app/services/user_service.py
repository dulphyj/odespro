from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


async def get_users(
    db: AsyncSession, skip: int = 0, limit: int = 100
) -> list[User]:
    result = await db.execute(
        select(User).offset(skip).limit(limit).order_by(User.id)
    )
    return list(result.scalars().all())


async def get_user(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise NotFoundError(f"User with id {user_id} not found")
    return user


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.username == username))
    return result.scalars().first()


async def create_user(db: AsyncSession, user_create: UserCreate) -> User:
    existing = await get_user_by_username(db, user_create.username)
    if existing:
        raise ValidationError(f"Username '{user_create.username}' already exists")

    from app.models.role import Role, UserRole

    user = User(
        username=user_create.username,
        email=user_create.email,
        password_hash=hash_password(user_create.password),
        full_name=user_create.full_name,
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    await db.flush()

    result = await db.execute(
        select(Role).where(Role.name == "user").limit(1)
    )
    default_role = result.scalars().first()
    if default_role:
        db.add(UserRole(user_id=user.id, role_id=default_role.id))

    return user


async def update_user(db: AsyncSession, user_id: int, user_update: UserUpdate) -> User:
    user = await get_user(db, user_id)
    update_data = user_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    db.add(user)
    await db.flush()
    return user


async def delete_user(db: AsyncSession, user_id: int) -> None:
    user = await get_user(db, user_id)
    await db.delete(user)
    await db.flush()


async def activate_user(db: AsyncSession, user_id: int) -> User:
    user = await get_user(db, user_id)
    user.is_active = True
    db.add(user)
    await db.flush()
    return user


async def deactivate_user(db: AsyncSession, user_id: int) -> User:
    user = await get_user(db, user_id)
    user.is_active = False
    db.add(user)
    await db.flush()
    return user
