# apps/api/app/repositories/storage_repo.py
# Async repository pattern for Minio/S3 file storage — aioboto3

import io
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import aioboto3
import structlog
from botocore.exceptions import ClientError

from app.config import settings
from app.utils.circuit_breaker import circuit_breaker

logger = structlog.get_logger(__name__)


class StorageError(Exception):
    """Custom exception for storage operations."""

    def __init__(self, message: str, error_code: str | None = None):
        self.error_code = error_code
        super().__init__(message)


class StorageRepository:
    """Async repository for object storage operations (Minio local, R2 production)."""

    def __init__(self) -> None:
        self.session = aioboto3.Session()
        self.endpoint_url = settings.r2_endpoint_url
        self.access_key = settings.r2_access_key_id.get_secret_value() if settings.r2_access_key_id else ""
        self.secret_key = settings.r2_secret_access_key.get_secret_value() if settings.r2_secret_access_key else ""
        self.region_name = "auto"  # R2 uses "auto"
        self.bucket_name = settings.r2_bucket_name

    @circuit_breaker(failure_threshold=3, recovery_timeout=30, name="storage.upload")
    async def upload_file(
        self,
        file_bytes: bytes,
        file_name: str,
        content_type: str,
        folder: str = "avatars",
    ) -> dict[str, Any]:
        """
        Upload file to object storage asynchronously.

        Args:
            file_bytes: Raw file content
            file_name: Original filename (will be prefixed with UUID)
            content_type: MIME type (e.g., "image/jpeg")
            folder: Subfolder in bucket (e.g., "avatars", "documents")

        Returns:
            Dict with file_url, file_key, file_size, etc.

        Raises:
            StorageError: If upload fails
            CircuitBreakerError: If circuit breaker is OPEN
        """
        # Generate unique key to prevent collisions
        ext = Path(file_name).suffix.lower()
        file_key = f"{folder}/{uuid.uuid4().hex}{ext}"

        try:
            async with self.session.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region_name,
            ) as client:
                # Upload to Minio/R2
                await client.upload_fileobj(
                    io.BytesIO(file_bytes),
                    self.bucket_name,
                    file_key,
                    ExtraArgs={
                        "ContentType": content_type,
                        "ACL": "public-read",  # Make avatars publicly accessible
                    },
                )

                # Construct public URL, Minio for local dev and cloudflare R2 for production
                file_url = f"{self.endpoint_url}/{self.bucket_name}/{file_key}" if "localhost" in self.endpoint_url else f"https://{self.bucket_name}.r2.cloudflarestorage.com/{file_key}"

                logger.info(
                    "file_uploaded",
                    file_key=file_key,
                    file_name=file_name,
                    content_type=content_type,
                    size=len(file_bytes),
                )

                return {
                    "file_url": file_url,
                    "file_key": file_key,
                    "file_name": file_name,
                    "file_size": len(file_bytes),
                    "content_type": content_type,
                    "uploaded_at": datetime.now(UTC),
                }

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code") if hasattr(e, "response") else None
            logger.error(
                "storage_upload_failed",
                file_key=file_key,
                error_code=error_code,
                error_message=str(e),
            )
            raise StorageError(f"Failed to upload file: {str(e)}", error_code=error_code) from e
        except Exception as e:
            logger.exception("storage_upload_error", file_key=file_key, error=str(e))
            raise StorageError(f"Unexpected error uploading file: {str(e)}") from e

    @circuit_breaker(failure_threshold=3, recovery_timeout=30, name="storage.delete")
    async def delete_file(self, file_key: str) -> bool:
        """Delete file from object storage asynchronously."""
        try:
            async with self.session.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region_name,
            ) as client:
                await client.delete_object(Bucket=self.bucket_name, Key=file_key)
                logger.info("file_deleted", file_key=file_key)
                return True
        except ClientError as e:
            logger.warning("storage_delete_failed", file_key=file_key, error=str(e))
            return False
        except Exception as e:
            logger.exception("storage_delete_error", file_key=file_key, error=str(e))
            return False

    @circuit_breaker(failure_threshold=3, recovery_timeout=30, name="storage.presign")
    async def get_presigned_url(self, file_key: str, expires_in: int = 3600) -> str:
        """
        Generate presigned URL for private files.

        Note: Not needed for public avatars (which use public-read ACL).
        Useful for documents, private uploads, etc.
        """
        try:
            async with self.session.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region_name,
            ) as client:
                return cast(
                    str,
                    await client.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": self.bucket_name, "Key": file_key},
                        ExpiresIn=expires_in,
                    ),
                )
        except ClientError as e:
            logger.error("presign_failed", file_key=file_key, error=str(e))
            raise StorageError(f"Failed to generate presigned URL: {str(e)}") from e
