# apps/api/tests/unit/test_profile_service.py
# Unit tests for ProfileService
#
# Strategy:
#   ProfileService has two repo dependencies — ProfileRepository (sync factory)
#   and StorageRepository (lazy-loaded, no constructor args).
#   Both are injected directly after construction.
#
#   Notable cases from the known issues list:
#   - update_profile returns email="" placeholder (known issue #6) — tested
#     explicitly so the fix is obvious when it lands.
#   - _validate_file reads bytes then seeks back — we use AsyncMock for
#     UploadFile to simulate this correctly.

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.profile import UpdateProfileRequest
from app.services.profile_service import ProfileError, ProfileService

MOCK_UPLOAD_RESULT = {
    "file_url": "https://cdn.example.com/avatar.jpg",
    "file_key": "avatars/user-abc/avatar.jpg",
    "file_name": "avatar.jpg",
    "file_size": 1024,
    "content_type": "image/jpeg",
    "uploaded_at": datetime.now(UTC),
}

# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def _make_service() -> tuple[ProfileService, MagicMock, MagicMock]:
    """Return (service, mock_profile_repo, mock_storage_repo)."""
    db = MagicMock()
    service = ProfileService(db_session=db)

    profile_repo = MagicMock()
    storage_repo = MagicMock()

    service._profile_repo = profile_repo
    service._storage_repo = storage_repo

    return service, profile_repo, storage_repo


def _mock_profile(
    user_id: str = "user-abc",
    full_name: str | None = "Test User",
    avatar_url: str | None = None,
    avatar_key: str | None = None,
    timezone: str = "UTC",
    email_notifications: bool = True,
    is_onboarded: bool = False,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
    last_login_at: datetime | None = None,
) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=user_id,
        full_name=full_name,
        avatar_url=avatar_url,
        avatar_key=avatar_key,
        timezone=timezone,
        email_notifications=email_notifications,
        is_onboarded=is_onboarded,
        created_at=created_at or now,
        updated_at=updated_at or now,
        last_login_at=last_login_at,
    )


def _mock_upload_file(
    filename: str = "avatar.jpg",
    content_type: str = "image/jpeg",
    size_bytes: int = 1024,
) -> MagicMock:
    """Simulate a FastAPI UploadFile with async read/seek."""
    f = MagicMock()
    f.filename = filename
    f.content_type = content_type
    f.read = AsyncMock(return_value=b"x" * size_bytes)
    f.seek = AsyncMock()
    return f


# ---------------------------------------------------------------------------
# get_profile()
# ---------------------------------------------------------------------------


class TestGetProfile:
    @pytest.mark.asyncio
    async def test_returns_profile_response_when_profile_exists(self):
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.get_profile("user-abc", "test@example.com")

        assert result.user_id == "user-abc"
        assert result.email == "test@example.com"
        assert result.full_name == "Test User"
        assert result.timezone == "UTC"

    @pytest.mark.asyncio
    async def test_returns_minimal_response_when_no_profile(self):
        """When profile doesn't exist yet, return sensible defaults rather than raising."""
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=None)

        result = await service.get_profile("user-new", "new@example.com")

        assert result.user_id == "user-new"
        assert result.email == "new@example.com"
        assert result.full_name is None
        assert result.avatar_url is None
        assert result.timezone == "UTC"
        assert result.email_notifications is True
        assert result.created_at is None
        assert result.updated_at is None

    @pytest.mark.asyncio
    async def test_email_always_comes_from_parameter_not_db(self):
        """Email is passed from JWT context, not stored in profiles table."""
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.get_profile("user-abc", "from-jwt@example.com")

        assert result.email == "from-jwt@example.com"

    @pytest.mark.asyncio
    async def test_is_onboarded_from_profile(self):
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile(is_onboarded=True))

        result = await service.get_profile("user-abc", "test@example.com")

        assert result.is_onboarded is True


# ---------------------------------------------------------------------------
# update_profile()
# ---------------------------------------------------------------------------


class TestUpdateProfile:
    @pytest.mark.asyncio
    async def test_update_success_returns_profile_response(self):
        service, profile_repo, _ = _make_service()
        profile_repo.update = AsyncMock(return_value=_mock_profile(full_name="New Name"))
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile(full_name="New Name"))

        result = await service.update_profile(
            "user-abc",
            UpdateProfileRequest(full_name="New Name"),
        )

        assert result.full_name == "New Name"

    @pytest.mark.asyncio
    async def test_update_calls_repo_with_correct_fields(self):
        service, profile_repo, _ = _make_service()
        profile_repo.update = AsyncMock(return_value=_mock_profile())
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        await service.update_profile(
            "user-abc",
            UpdateProfileRequest(timezone="America/New_York"),
        )

        profile_repo.update.assert_awaited_once_with("user-abc", {"timezone": "America/New_York"})

    @pytest.mark.asyncio
    async def test_empty_request_raises_no_fields_to_update(self):
        """Sending an UpdateProfileRequest with no fields set raises the correct error."""
        service, _, _ = _make_service()

        with pytest.raises(ProfileError) as exc_info:
            await service.update_profile("user-abc", UpdateProfileRequest())

        assert exc_info.value.error_code == "no_fields_to_update"

    @pytest.mark.asyncio
    async def test_profile_not_found_raises_profile_not_found(self):
        """If the repo returns None, the user doesn't have a profile row."""
        service, profile_repo, _ = _make_service()
        profile_repo.update = AsyncMock(return_value=None)

        with pytest.raises(ProfileError) as exc_info:
            await service.update_profile(
                "user-missing",
                UpdateProfileRequest(full_name="Ghost"),
            )

        assert exc_info.value.error_code == "profile_not_found"

    @pytest.mark.asyncio
    async def test_update_email_placeholder_is_empty_string(self):
        """
        Known issue #6: update_profile calls get_profile with email=""
        This test documents the current behaviour so the fix is explicit.
        When fixed, email should come from the JWT context passed into update_profile.
        """
        service, profile_repo, _ = _make_service()
        profile_repo.update = AsyncMock(return_value=_mock_profile())
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        result = await service.update_profile(
            "user-abc",
            UpdateProfileRequest(full_name="Name"),
        )

        # Current known behaviour: email is "" — update this assertion when fixed
        assert result.email == ""

    @pytest.mark.asyncio
    async def test_update_only_sends_set_fields(self):
        """Unset optional fields are excluded from the update dict (exclude_unset)."""
        service, profile_repo, _ = _make_service()
        profile_repo.update = AsyncMock(return_value=_mock_profile())
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile())

        await service.update_profile(
            "user-abc",
            UpdateProfileRequest(email_notifications=False),
        )

        # second positional arg is the dict
        call_kwargs = profile_repo.update.call_args[0][1]
        assert "email_notifications" in call_kwargs
        assert "full_name" not in call_kwargs
        assert "timezone" not in call_kwargs


# ---------------------------------------------------------------------------
# upload_avatar()
# ---------------------------------------------------------------------------


class TestUploadAvatar:
    @pytest.mark.asyncio
    async def test_upload_success_returns_upload_response(self):
        service, profile_repo, storage_repo = _make_service()
        storage_repo.upload_file = AsyncMock(return_value=MOCK_UPLOAD_RESULT)
        profile_repo.update_avatar = AsyncMock()

        result = await service.upload_avatar(
            "user-abc",
            _mock_upload_file(),
        )

        assert result.file_url == "https://cdn.example.com/avatar.jpg"

    @pytest.mark.asyncio
    async def test_upload_updates_profile_avatar(self):
        service, profile_repo, storage_repo = _make_service()
        storage_repo.upload_file = storage_repo.upload_file = AsyncMock(return_value=MOCK_UPLOAD_RESULT)
        profile_repo.update_avatar = AsyncMock()

        await service.upload_avatar("user-abc", _mock_upload_file())

        profile_repo.update_avatar.assert_awaited_once_with(
            user_id="user-abc",
            avatar_url="https://cdn.example.com/avatar.jpg",
            avatar_key="avatars/user-abc/avatar.jpg",
        )

    @pytest.mark.asyncio
    async def test_upload_invalid_content_type_raises_invalid_file_type(self):
        service, _, _ = _make_service()

        with pytest.raises(ProfileError) as exc_info:
            await service.upload_avatar(
                "user-abc",
                _mock_upload_file(content_type="application/pdf"),
            )

        assert exc_info.value.error_code == "invalid_file_type"

    @pytest.mark.asyncio
    async def test_upload_file_too_large_raises_file_too_large(self):
        from app.schemas.profile import FileValidationConfig

        service, _, _ = _make_service()
        oversized = FileValidationConfig.MAX_FILE_SIZE + 1

        with pytest.raises(ProfileError) as exc_info:
            await service.upload_avatar(
                "user-abc",
                _mock_upload_file(size_bytes=oversized),
            )

        assert exc_info.value.error_code == "file_too_large"

    @pytest.mark.asyncio
    async def test_upload_missing_filename_raises_invalid_file(self):
        service, _, _ = _make_service()

        with pytest.raises(ProfileError) as exc_info:
            await service.upload_avatar(
                "user-abc",
                _mock_upload_file(filename=""),
            )

        assert exc_info.value.error_code == "invalid_file"

    @pytest.mark.asyncio
    async def test_upload_storage_error_raises_upload_failed(self):
        from app.repositories.storage_repo import StorageError

        service, _, storage_repo = _make_service()
        storage_repo.upload_file = AsyncMock(side_effect=StorageError(error_code="s3_error", message="bucket unreachable"))

        with pytest.raises(ProfileError) as exc_info:
            await service.upload_avatar("user-abc", _mock_upload_file())

        assert exc_info.value.error_code == "upload_failed"

    @pytest.mark.asyncio
    async def test_upload_circuit_breaker_raises_service_unavailable(self):
        from app.utils.circuit_breaker import CircuitBreakerError

        service, _, storage_repo = _make_service()
        storage_repo.upload_file = AsyncMock(side_effect=CircuitBreakerError(message="service_unavailable"))

        with pytest.raises(ProfileError) as exc_info:
            await service.upload_avatar("user-abc", _mock_upload_file())

        assert exc_info.value.error_code == "service_unavailable"


# ---------------------------------------------------------------------------
# delete_avatar()
# ---------------------------------------------------------------------------


class TestDeleteAvatar:
    @pytest.mark.asyncio
    async def test_delete_success_returns_true(self):
        service, profile_repo, storage_repo = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile(avatar_key="avatars/user-abc/old.jpg"))
        storage_repo.delete_file = AsyncMock()
        profile_repo.delete_avatar_reference = AsyncMock()

        result = await service.delete_avatar("user-abc")

        assert result is True
        storage_repo.delete_file.assert_awaited_once_with("avatars/user-abc/old.jpg")
        profile_repo.delete_avatar_reference.assert_awaited_once_with("user-abc")

    @pytest.mark.asyncio
    async def test_delete_no_avatar_key_returns_false(self):
        """Idempotent: deleting when no avatar is set returns False, not an error."""
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile(avatar_key=None))

        result = await service.delete_avatar("user-abc")

        assert result is False

    @pytest.mark.asyncio
    async def test_delete_no_profile_returns_false(self):
        service, profile_repo, _ = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=None)

        result = await service.delete_avatar("user-abc")

        assert result is False

    @pytest.mark.asyncio
    async def test_delete_exception_returns_false_not_raises(self):
        """Errors during delete are swallowed — delete stays idempotent."""
        service, profile_repo, storage_repo = _make_service()
        profile_repo.get_by_user_id = AsyncMock(return_value=_mock_profile(avatar_key="key"))
        storage_repo.delete_file = AsyncMock(side_effect=Exception("storage timeout"))

        result = await service.delete_avatar("user-abc")

        assert result is False
