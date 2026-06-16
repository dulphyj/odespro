import os
import io
from typing import Optional
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from app.core.config import settings


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )

    async def ensure_bucket(self, bucket_name: str) -> None:
        try:
            if not self.client.bucket_exists(bucket_name):
                self.client.make_bucket(bucket_name)
        except S3Error as e:
            raise RuntimeError(f"Failed to ensure bucket '{bucket_name}': {e}")

    async def upload_file(
        self, bucket: str, file_path: str, file_data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        await self.ensure_bucket(bucket)
        file_size = len(file_data)
        file_stream = io.BytesIO(file_data)
        self.client.put_object(
            bucket,
            file_path,
            file_stream,
            length=file_size,
            content_type=content_type,
        )
        return file_path

    async def download_file(self, bucket: str, file_path: str) -> bytes:
        try:
            response = self.client.get_object(bucket, file_path)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            raise FileNotFoundError(f"File '{file_path}' not in bucket '{bucket}': {e}")

    async def delete_file(self, bucket: str, file_path: str) -> None:
        try:
            self.client.remove_object(bucket, file_path)
        except S3Error as e:
            raise FileNotFoundError(f"File '{file_path}' not found in bucket '{bucket}': {e}")

    async def get_presigned_url(
        self, bucket: str, file_path: str, expires: int = 3600
    ) -> str:
        try:
            url = self.client.presigned_get_object(bucket, file_path, expires=expires)
            return url
        except S3Error as e:
            raise FileNotFoundError(f"Could not generate URL for '{file_path}': {e}")

    async def copy_file(
        self, source_bucket: str, source_path: str, dest_bucket: str, dest_path: str
    ) -> None:
        await self.ensure_bucket(dest_bucket)
        try:
            self.client.copy_object(
                dest_bucket,
                dest_path,
                f"{source_bucket}/{source_path}",
            )
        except S3Error as e:
            raise RuntimeError(f"Failed to copy '{source_path}' to '{dest_path}': {e}")

    async def list_files(
        self, bucket: str, prefix: str = ""
    ) -> list[dict]:
        try:
            objects = self.client.list_objects(bucket, prefix=prefix, recursive=True)
            files = []
            for obj in objects:
                files.append({
                    "name": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                    "etag": obj.etag,
                })
            return files
        except S3Error as e:
            raise FileNotFoundError(f"Bucket '{bucket}' not found: {e}")
