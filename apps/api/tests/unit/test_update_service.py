# apps/api/tests/unit/test_update_service.py
# Unit tests for UpdateService with mocked repositories.
#
# Strategy:
#   - Repos are injected directly onto service._update_repo / _profile_repo
#   - db.commit is mocked to avoid real DB calls
#   - _to_response always calls profile_repo.get_by_user_id — mock it in
#     every test that expects a successful response
#   - Fake Update objects use SimpleNamespace — avoids MagicMock attribute interception

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.update import SubmitUpdateRequest, UpdateUpdateRequest
from app.services.update_service import UpdateError, UpdateService

TODAY = "2026-05-14"
WORKSPACE_ID = "workspace-123"
USER_ID = "user-123"
OTHER_USER_ID = "other-user-456"
UPDATE_ID = "update-789"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mock_celery_task():
    """Prevent process_update.delay() from hitting real Redis in unit tests."""
    with patch("app.workers.tasks.process_update.delay") as mock_delay:
        yield mock_delay


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def _make_service() -> tuple[UpdateService, MagicMock, MagicMock, MagicMock]:
    """Return (service, mock_db, mock_update_repo, mock_profile_repo)."""
    db = MagicMock()
    db.commit = AsyncMock()
    db.rollback = AsyncMock()

    service = UpdateService(db=db)
    update_repo = MagicMock()
    profile_repo = MagicMock()

    service._update_repo = update_repo
    service._profile_repo = profile_repo

    return service, db, update_repo, profile_repo


def _fake_update(
    update_id: str = UPDATE_ID,
    workspace_id: str = WORKSPACE_ID,
    user_id: str = USER_ID,
    content: str = "Today I worked on tests",
    mode: str = "text",
    status: str = "pending",
    update_date: str = TODAY,
    summary: str | None = None,
    transcript: str | None = None,
    audio_duration_seconds: int | None = None,
) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=update_id,
        workspace_id=workspace_id,
        user_id=user_id,
        content=content,
        mode=mode,
        status=status,
        update_date=update_date,
        summary=summary,
        transcript=transcript,
        audio_duration_seconds=audio_duration_seconds,
        created_at=now,
        updated_at=now,
        is_deleted=False,
    )


def _fake_profile(
    user_id: str = USER_ID,
    full_name: str = "Test User",
    avatar_url: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        full_name=full_name,
        avatar_url=avatar_url,
    )


# ---------------------------------------------------------------------------
# submit_update()
# ---------------------------------------------------------------------------


class TestSubmitUpdate:
    @pytest.mark.asyncio
    async def test_submit_success_returns_update_response(self):
        service, _, update_repo, profile_repo = _make_service()
        update = _fake_update()

        update_repo.get_for_user_on_date = AsyncMock(return_value=None)
        update_repo.create = AsyncMock(return_value=update)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        result = await service.submit_update(
            WORKSPACE_ID,
            USER_ID,
            SubmitUpdateRequest(content="Today I worked on tests", update_date=TODAY),
        )

        assert result.id == UPDATE_ID
        assert result.content == "Today I worked on tests"
        assert result.workspace_id == WORKSPACE_ID
        assert result.user_id == USER_ID
        assert result.status == "pending"

    @pytest.mark.asyncio
    async def test_submit_calls_create_with_correct_args(self):
        service, _, update_repo, profile_repo = _make_service()
        update = _fake_update()

        update_repo.get_for_user_on_date = AsyncMock(return_value=None)
        update_repo.create = AsyncMock(return_value=update)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        await service.submit_update(
            WORKSPACE_ID,
            USER_ID,
            SubmitUpdateRequest(content="My update", update_date=TODAY),
        )

        update_repo.create.assert_awaited_once_with(
            workspace_id=WORKSPACE_ID,
            user_id=USER_ID,
            content="My update",
            update_date=TODAY,
            mode="text",
        )

    @pytest.mark.asyncio
    async def test_submit_duplicate_raises_update_already_exists(self):
        """Raises UpdateError if an update already exists for this user+workspace+date."""
        service, _, update_repo, _ = _make_service()
        existing = _fake_update(update_id="existing-id")
        update_repo.get_for_user_on_date = AsyncMock(return_value=existing)

        with pytest.raises(UpdateError) as exc_info:
            await service.submit_update(
                WORKSPACE_ID,
                USER_ID,
                SubmitUpdateRequest(content="duplicate", update_date=TODAY),
            )

        assert exc_info.value.error_code == "update_already_exists"

    @pytest.mark.asyncio
    async def test_submit_duplicate_includes_existing_id_in_details(self):
        service, _, update_repo, _ = _make_service()
        existing = _fake_update(update_id="existing-id")
        update_repo.get_for_user_on_date = AsyncMock(return_value=existing)

        with pytest.raises(UpdateError) as exc_info:
            await service.submit_update(
                WORKSPACE_ID,
                USER_ID,
                SubmitUpdateRequest(content="dup", update_date=TODAY),
            )

        assert exc_info.value.details is not None
        assert exc_info.value.details["existing_id"] == "existing-id"

    @pytest.mark.asyncio
    async def test_submit_includes_author_name_from_profile(self):
        service, _, update_repo, profile_repo = _make_service()
        update = _fake_update()

        update_repo.get_for_user_on_date = AsyncMock(return_value=None)
        update_repo.create = AsyncMock(return_value=update)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile(full_name="Jane Doe"))

        result = await service.submit_update(
            WORKSPACE_ID,
            USER_ID,
            SubmitUpdateRequest(content="update", update_date=TODAY),
        )

        assert result.author_name == "Jane Doe"

    @pytest.mark.asyncio
    async def test_submit_author_name_none_when_no_profile(self):
        service, _, update_repo, profile_repo = _make_service()
        update = _fake_update()

        update_repo.get_for_user_on_date = AsyncMock(return_value=None)
        update_repo.create = AsyncMock(return_value=update)
        profile_repo.get_by_user_id = AsyncMock(return_value=None)

        result = await service.submit_update(
            WORKSPACE_ID,
            USER_ID,
            SubmitUpdateRequest(content="update", update_date=TODAY),
        )

        assert result.author_name is None


# ---------------------------------------------------------------------------
# get_workspace_updates()
# ---------------------------------------------------------------------------


class TestGetWorkspaceUpdates:
    @pytest.mark.asyncio
    async def test_returns_list_response_with_correct_total(self):
        service, _, update_repo, profile_repo = _make_service()
        updates = [
            _fake_update(update_id="u1", user_id=USER_ID),
            _fake_update(update_id="u2", user_id=OTHER_USER_ID),
        ]

        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.total == 2
        assert len(result.updates) == 2

    @pytest.mark.asyncio
    async def test_returns_empty_list_response(self):
        service, _, update_repo, _ = _make_service()
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.total == 0
        assert result.updates == []

    @pytest.mark.asyncio
    async def test_maps_update_fields_correctly(self):
        service, _, update_repo, profile_repo = _make_service()
        update = _fake_update(content="Specific content")

        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[update])
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.updates[0].content == "Specific content"
        assert result.updates[0].workspace_id == WORKSPACE_ID

    @pytest.mark.asyncio
    async def test_calls_repo_with_correct_args(self):
        service, _, update_repo, _ = _make_service()
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])

        await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        update_repo.get_workspace_updates_for_date.assert_awaited_once_with(WORKSPACE_ID, TODAY)


# ---------------------------------------------------------------------------
# edit_update()
# ---------------------------------------------------------------------------


class TestEditUpdate:
    @pytest.mark.asyncio
    async def test_edit_success_returns_updated_response(self):
        service, _, update_repo, profile_repo = _make_service()
        original = _fake_update(content="original")
        edited = _fake_update(content="Edited content")

        update_repo.get_by_id = AsyncMock(return_value=original)
        update_repo.update_content = AsyncMock(return_value=edited)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        result = await service.edit_update(
            WORKSPACE_ID,
            USER_ID,
            UPDATE_ID,
            UpdateUpdateRequest(content="Edited content"),
        )

        assert result.content == "Edited content"

    @pytest.mark.asyncio
    async def test_edit_calls_update_content_with_new_content(self):
        service, _, update_repo, profile_repo = _make_service()
        original = _fake_update()
        edited = _fake_update(content="New")

        update_repo.get_by_id = AsyncMock(return_value=original)
        update_repo.update_content = AsyncMock(return_value=edited)
        profile_repo.get_by_user_id = AsyncMock(return_value=_fake_profile())

        await service.edit_update(WORKSPACE_ID, USER_ID, UPDATE_ID, UpdateUpdateRequest(content="New"))

        update_repo.update_content.assert_awaited_once_with(original, "New")

    @pytest.mark.asyncio
    async def test_edit_not_found_raises_update_not_found(self):
        service, _, update_repo, _ = _make_service()
        update_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(UpdateError) as exc_info:
            await service.edit_update(WORKSPACE_ID, USER_ID, UPDATE_ID, UpdateUpdateRequest(content="x"))

        assert exc_info.value.error_code == "update_not_found"

    @pytest.mark.asyncio
    async def test_edit_wrong_workspace_raises_update_not_found(self):
        """Update exists but belongs to a different workspace — treated as not found."""
        service, _, update_repo, _ = _make_service()
        update = _fake_update(workspace_id="other-workspace")
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.edit_update(WORKSPACE_ID, USER_ID, UPDATE_ID, UpdateUpdateRequest(content="x"))

        assert exc_info.value.error_code == "update_not_found"

    @pytest.mark.asyncio
    async def test_edit_unauthorized_raises_unauthorized(self):
        """Update belongs to different user — unauthorized."""
        service, _, update_repo, _ = _make_service()
        update = _fake_update(user_id=OTHER_USER_ID)
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.edit_update(WORKSPACE_ID, USER_ID, UPDATE_ID, UpdateUpdateRequest(content="x"))

        assert exc_info.value.error_code == "unauthorized"


# ---------------------------------------------------------------------------
# delete_update()
# ---------------------------------------------------------------------------


class TestDeleteUpdate:
    @pytest.mark.asyncio
    async def test_delete_success_calls_soft_delete(self):
        service, _, update_repo, _ = _make_service()
        update = _fake_update()

        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.soft_delete = AsyncMock()

        await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        update_repo.soft_delete.assert_awaited_once_with(update)

    @pytest.mark.asyncio
    async def test_delete_success_returns_none(self):
        service, _, update_repo, _ = _make_service()
        update_repo.get_by_id = AsyncMock(return_value=_fake_update())
        update_repo.soft_delete = AsyncMock()

        result = await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert result is None

    @pytest.mark.asyncio
    async def test_delete_not_found_raises_update_not_found(self):
        service, _, update_repo, _ = _make_service()
        update_repo.get_by_id = AsyncMock(return_value=None)

        with pytest.raises(UpdateError) as exc_info:
            await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "update_not_found"

    @pytest.mark.asyncio
    async def test_delete_wrong_workspace_raises_update_not_found(self):
        service, _, update_repo, _ = _make_service()
        update = _fake_update(workspace_id="other-workspace")
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "update_not_found"

    @pytest.mark.asyncio
    async def test_delete_unauthorized_raises_unauthorized(self):
        service, _, update_repo, _ = _make_service()
        update = _fake_update(user_id=OTHER_USER_ID)
        update_repo.get_by_id = AsyncMock(return_value=update)

        with pytest.raises(UpdateError) as exc_info:
            await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        assert exc_info.value.error_code == "unauthorized"

    @pytest.mark.asyncio
    async def test_delete_does_not_call_soft_delete_when_unauthorized(self):
        service, _, update_repo, _ = _make_service()
        update = _fake_update(user_id=OTHER_USER_ID)
        update_repo.get_by_id = AsyncMock(return_value=update)
        update_repo.soft_delete = AsyncMock()

        with pytest.raises(UpdateError):
            await service.delete_update(WORKSPACE_ID, USER_ID, UPDATE_ID)

        update_repo.soft_delete.assert_not_awaited()
