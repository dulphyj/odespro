from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.security import verify_token
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.models.user import User

security_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
):

    token = credentials.credentials
    payload = verify_token(token)
    if payload is None:
        raise AuthenticationError("Invalid or expired token")

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise AuthenticationError("Invalid token payload")

    result = await db.execute(select(User).where(User.id == int(user_id_str)))
    user = result.scalar_one_or_none()
    if user is None:
        raise AuthenticationError("User not found")

    return user


async def get_current_active_user(
    current_user = Depends(get_current_user),
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
    return current_user


async def get_current_superuser(
    current_user = Depends(get_current_user),
):
    if not current_user.is_superuser:
        raise PermissionDeniedError("Superuser privileges required")
    return current_user


def check_permissions(permission_code: str):
    async def permission_checker(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        if current_user.is_superuser:
            return current_user

        from app.models.role import Role, Permission

        result = await db.execute(
            select(Permission.code)
            .select_from(User)
            .join(User.roles)
            .join(Role.permissions)
            .where(User.id == current_user.id)
        )
        perms: List[str] = [row[0] for row in result.fetchall()]

        if permission_code not in perms:
            raise PermissionDeniedError(
                f"Missing required permission: {permission_code}"
            )
        return current_user

    return permission_checker
