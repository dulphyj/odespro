from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.core.exceptions import AuthenticationError
from app.core.security import verify_token, create_access_token, verify_password, hash_password
from app.models.user import User
from app.schemas.user import UserLogin, TokenResponse, PasswordChange, UserResponse
from app.schemas.common import MessageResponse
from app.services.auth_service import login as auth_login
from app.services.audit_service import log_action

router = APIRouter(tags=["auth"])


@router.post("/login")
async def login(
    body: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await auth_login(db, body.username, body.password)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    token = create_access_token({
        "sub": str(current_user.id),
        "username": current_user.username,
        "is_superuser": current_user.is_superuser,
    })
    await log_action(db, current_user.id, current_user.username, "TOKEN_REFRESH", "USER", str(current_user.id), "Token refreshed")
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    return current_user


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.old_password, current_user.password_hash):
        raise AuthenticationError("Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    db.add(current_user)
    await db.flush()
    await log_action(db, current_user.id, current_user.username, "PASSWORD_CHANGE", "USER", str(current_user.id), "Password changed")
    return MessageResponse(message="Password changed successfully")
