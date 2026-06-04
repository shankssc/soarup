# apps/api/tests/unit/test_update_service_batch.py
# Unit tests for the M5 batch profile fetch in UpdateService.
#
# Covers:
#   - get_workspace_updates uses get_profiles_for_updates (one query, not N)
#   - profile_map lookup populates author fields correctly
#   - missing profile resolves to None author fields (not a crash)
#   - duplicate user_ids are deduplicated before the batch query
#   - empty updates returns early without hitting get_profiles_for_updates
#   - _to_response_batch is synchronous and maps fields identically to _to_response
#
# These tests are additive — they do not replace test_update_service.py.
# The existing tests cover submit/edit/delete; this file covers the batch path.

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from app.services.update_service import UpdateService

TODAY = "2026-05-14"
WORKSPACE_ID = "workspace-123"
USER_ID = "user-abc"
OTHER_USER_ID = "user-def"
THIRD_USER_ID = "user-ghi"


# ---------------------------------------------------------------------------
# Factories — match the pattern established in test_update_service.py
# ---------------------------------------------------------------------------


def _make_service() -> tuple[UpdateService, MagicMock, MagicMock, MagicMock]:
    """Return (service, mock_db, mock_update_repo, mock_workspace_repo)."""
    db = MagicMock()
    db.commit = AsyncMock()

    service = UpdateService(db=db)

    update_repo = MagicMock()
    workspace_repo = MagicMock()
    profile_repo = MagicMock()

    service._update_repo = update_repo
    service._workspace_repo = workspace_repo
    service._profile_repo = profile_repo

    return service, db, update_repo, workspace_repo


def _fake_update(
    update_id: str = "u-1",
    user_id: str = USER_ID,
    content: str = "Worked on tests",
    status: str = "pending",
) -> SimpleNamespace:
    now = datetime.now(UTC)
    return SimpleNamespace(
        id=update_id,
        workspace_id=WORKSPACE_ID,
        user_id=user_id,
        content=content,
        mode="text",
        status=status,
        update_date=TODAY,
        summary=None,
        transcript=None,
        audio_duration_seconds=None,
        created_at=now,
        updated_at=now,
    )


def _fake_profile(
    user_id: str = USER_ID,
    full_name: str = "Alice",
    avatar_url: str | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        full_name=full_name,
        avatar_url=avatar_url,
    )


# ---------------------------------------------------------------------------
# get_workspace_updates — batch fetch behaviour
# ---------------------------------------------------------------------------


class TestGetWorkspaceUpdatesBatch:
    async def test_calls_get_profiles_for_updates_once(self):
        """
        Regardless of how many updates are returned, get_profiles_for_updates
        must be called exactly once — not once per update.
        """
        service, _, update_repo, workspace_repo = _make_service()
        updates = [
            _fake_update("u-1", USER_ID),
            _fake_update("u-2", OTHER_USER_ID),
            _fake_update("u-3", THIRD_USER_ID),
        ]
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value={})

        await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        workspace_repo.get_profiles_for_updates.assert_awaited_once()

    async def test_user_ids_are_deduplicated_before_batch_query(self):
        """
        Two updates from the same author should result in one user_id
        passed to get_profiles_for_updates, not two.
        """
        service, _, update_repo, workspace_repo = _make_service()
        updates = [
            _fake_update("u-1", USER_ID),
            _fake_update("u-2", USER_ID),  # same author
        ]
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value={})

        await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        called_user_ids = workspace_repo.get_profiles_for_updates.call_args.args[0]
        assert len(called_user_ids) == 1
        assert USER_ID in called_user_ids

    async def test_empty_updates_skips_batch_query(self):
        """
        Empty update list should return early without calling
        get_profiles_for_updates at all.
        """
        service, _, update_repo, workspace_repo = _make_service()
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=[])
        workspace_repo.get_profiles_for_updates = AsyncMock()

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        workspace_repo.get_profiles_for_updates.assert_not_awaited()
        assert result.total == 0
        assert result.updates == []

    async def test_author_fields_populated_from_profile_map(self):
        service, _, update_repo, workspace_repo = _make_service()
        updates = [_fake_update("u-1", USER_ID)]
        profile_map = {USER_ID: _fake_profile(USER_ID, "Bob Builder", "https://cdn/bob.jpg")}

        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value=profile_map)

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.updates[0].author_name == "Bob Builder"
        assert result.updates[0].author_avatar_url == "https://cdn/bob.jpg"

    async def test_missing_profile_resolves_to_none_author_fields(self):
        """
        An update whose user_id has no entry in the profile_map should
        not crash — author fields should be None.
        """
        service, _, update_repo, workspace_repo = _make_service()
        updates = [_fake_update("u-1", USER_ID)]
        # Empty profile map — no profile for this user
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value={})
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.updates[0].author_name is None
        assert result.updates[0].author_avatar_url is None

    async def test_multiple_authors_resolved_correctly(self):
        service, _, update_repo, workspace_repo = _make_service()
        updates = [
            _fake_update("u-1", USER_ID),
            _fake_update("u-2", OTHER_USER_ID),
        ]
        profile_map = {
            USER_ID: _fake_profile(USER_ID, "Alice"),
            OTHER_USER_ID: _fake_profile(OTHER_USER_ID, "Bob"),
        }
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value=profile_map)

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        names = {u.author_name for u in result.updates}
        assert names == {"Alice", "Bob"}

    async def test_total_matches_number_of_updates(self):
        service, _, update_repo, workspace_repo = _make_service()
        updates = [_fake_update(f"u-{i}", USER_ID) for i in range(5)]
        update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        workspace_repo.get_profiles_for_updates = AsyncMock(return_value={})

        result = await service.get_workspace_updates(WORKSPACE_ID, TODAY)

        assert result.total == 5
        assert len(result.updates) == 5


# ---------------------------------------------------------------------------
# _to_response_batch — field mapping
# ---------------------------------------------------------------------------


class TestToResponseBatch:
    def test_maps_all_update_fields(self):
        service = UpdateService(db=MagicMock())
        update = _fake_update("u-1", USER_ID, content="My standup", status="processed")
        profile_map = {USER_ID: _fake_profile(USER_ID, "Carol")}

        result = service._to_response_batch(update, profile_map)

        assert result.id == "u-1"
        assert result.workspace_id == WORKSPACE_ID
        assert result.user_id == USER_ID
        assert result.content == "My standup"
        assert result.status == "processed"
        assert result.author_name == "Carol"

    def test_is_synchronous(self):
        """_to_response_batch must not be a coroutine — no await needed."""
        import inspect

        service = UpdateService(db=MagicMock())
        update = _fake_update()
        result = service._to_response_batch(update, {})
        assert not inspect.isawaitable(result)

    def test_avatar_url_populated_when_present(self):
        service = UpdateService(db=MagicMock())
        update = _fake_update(user_id=USER_ID)
        profile_map = {USER_ID: _fake_profile(USER_ID, avatar_url="https://cdn/avatar.jpg")}

        result = service._to_response_batch(update, profile_map)

        assert result.author_avatar_url == "https://cdn/avatar.jpg"

    def test_avatar_url_none_when_profile_missing(self):
        service = UpdateService(db=MagicMock())
        update = _fake_update(user_id=USER_ID)

        result = service._to_response_batch(update, {})

        assert result.author_avatar_url is None

    def test_does_not_mutate_profile_map(self):
        """Calling _to_response_batch should not alter the shared profile_map."""
        service = UpdateService(db=MagicMock())
        update = _fake_update(user_id=USER_ID)
        profile = _fake_profile(USER_ID, "Dave")
        profile_map = {USER_ID: profile}
        original_len = len(profile_map)

        service._to_response_batch(update, profile_map)

        assert len(profile_map) == original_len
        assert profile_map[USER_ID] is profile
