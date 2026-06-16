from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import (
    NotFoundError,
    PermissionDeniedError,
    AuthenticationError,
    ValidationError,
    not_found_handler,
    permission_denied_handler,
    authentication_error_handler,
    validation_error_handler,
    general_exception_handler,
)
from app.api.api_v1 import api_router


async def seed_admin_user():
    from sqlalchemy import select
    from app.core.database import async_session_factory
    from app.models.user import User
    from app.core.security import hash_password

    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.username == "admin"))
        if result.scalars().first() is None:
            admin = User(
                username="admin",
                email="admin@odespro.com",
                password_hash=hash_password("admin123"),
                full_name="Administrador del Sistema",
                is_superuser=True,
                is_active=True,
            )
            db.add(admin)
            await db.flush()
            print("[seed] Admin user created (admin / admin123)")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    from minio import Minio

    minio_client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE,
    )

    buckets = ["documents", "thumbnails", "exports", "temp"]
    for bucket in buckets:
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)

    from app.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await seed_admin_user()

    yield


app = FastAPI(
    title="Odespro Document Management System",
    description="Backend API for document management, OCR, and scanning",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

app.add_exception_handler(NotFoundError, not_found_handler)
app.add_exception_handler(PermissionDeniedError, permission_denied_handler)
app.add_exception_handler(AuthenticationError, authentication_error_handler)
app.add_exception_handler(ValidationError, validation_error_handler)
app.add_exception_handler(Exception, general_exception_handler)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
