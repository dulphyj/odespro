from typing import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.core.dependencies import get_current_user as _get_current_user
from app.models.user import User

get_db: AsyncGenerator[AsyncSession, None] = _get_db
get_current_user: User = _get_current_user
