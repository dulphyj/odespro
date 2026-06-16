from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://odespro:odespro_secret_2026@localhost:5432/odespro"

    # MinIO
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "odespro"
    MINIO_SECRET_KEY: str = "odespro_minio_2026"
    MINIO_SECURE: bool = False

    # JWT
    SECRET_KEY: str = "super-secret-key-odespro-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Services
    OCR_SERVICE_URL: str = "http://localhost:8001"
    SCANNER_AGENT_URL: str = "http://localhost:5000"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]


settings = Settings()
