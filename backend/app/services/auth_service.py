from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import create_access_token, verify_password


def _serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "avatar_url": user.avatar_url,
        "last_login": user.last_login.replace(tzinfo=timezone.utc).isoformat() if user.last_login else None,
        "created_at": user.created_at.replace(tzinfo=timezone.utc).isoformat() if user.created_at else None,
        "updated_at": user.updated_at.replace(tzinfo=timezone.utc).isoformat() if user.updated_at else None,
    }


async def authenticate_user(db: AsyncSession, username: str, password: str):
    from app.models.user import User
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    if not user:
        raise AuthenticationError("Invalid username or password")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")
    if not verify_password(password, user.password_hash):
        raise AuthenticationError("Invalid username or password")
    return user


async def login(db: AsyncSession, username: str, password: str) -> dict:
    from app.models.user import User
    from app.models.audit import AuditLog

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    if not user:
        raise AuthenticationError("Invalid username or password")
    if not user.is_active:
        raise AuthenticationError("User account is inactive")
    if not verify_password(password, user.password_hash):
        raise AuthenticationError("Invalid username or password")

    now = datetime.utcnow()
    user.last_login = now

    token = create_access_token({
        "sub": str(user.id),
        "username": user.username,
        "is_superuser": user.is_superuser,
    })

    audit = AuditLog(
        user_id=user.id,
        username=user.username,
        action="LOGIN",
        entity_type="USER",
        entity_id=str(user.id),
        description=f"User {user.username} logged in successfully",
    )
    db.add(audit)

    user_data = await db.run_sync(lambda _: _serialize_user(user))

    await db.flush()

    return {
        "data": {
            "user": user_data,
            "token": token,
        },
        "status": "ok",
    }
