# apps/api/tests/unit/test_profile_repo.py
# Unit tests for ProfileRepository — username-related methods added in M9.
#
# Strategy:
#   - Real DB session via db_session fixture (SAVEPOINT rollback)
#   - seeded_profile fixture from conftest provides the base profile row
#   - Additional profiles inserted via ORM flush for multi-user tests

import uuid

import pytest

from app.models.profile import Profile
from app.repositories.profile_repo import ProfileRepository

pytestmark = pytest.mark.db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _seed_profile_with_username(
    db_session,
    username: str,
    user_id: str | None = None,
) -> Profile:
    """Insert a Profile row with a username directly via flush."""
    profile = Profile(
        id=user_id or str(uuid.uuid4()),
        full_name="Test User",
        email_notifications=True,
        timezone="UTC",
        username=username,
    )  # type: ignore[call-arg]
    db_session.add(profile)
    await db_session.flush()
    return profile


# ---------------------------------------------------------------------------
# get_by_username
# ---------------------------------------------------------------------------


class TestGetByUsername:
    @pytest.mark.asyncio
    async def test_returns_profile_when_username_matches(
        self, db_session, seeded_profile, test_user_id
    ):
        repo = ProfileRepository.from_session(db_session)
        seeded_profile.username = "suyash"
        await db_session.flush()

        result = await repo.get_by_username("suyash")

        assert result is not None
        assert result.id == test_user_id
        assert result.username == "suyash"

    @pytest.mark.asyncio
    async def test_case_insensitive_match(
        self, db_session, seeded_profile, test_user_id
    ):
        repo = ProfileRepository.from_session(db_session)
        seeded_profile.username = "suyash"
        await db_session.flush()

        result = await repo.get_by_username("SUYASH")

        assert result is not None
        assert result.id == test_user_id

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, db_session):
        repo = ProfileRepository.from_session(db_session)

        result = await repo.get_by_username("doesnotexist")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_username_is_null(
        self, db_session, seeded_profile
    ):
        """Profile with no username set should not be returned."""
        repo = ProfileRepository.from_session(db_session)
        # seeded_profile has username=None by default

        result = await repo.get_by_username("suyash")

        assert result is None


# ---------------------------------------------------------------------------
# is_username_taken
# ---------------------------------------------------------------------------


class TestIsUsernameTaken:
    @pytest.mark.asyncio
    async def test_returns_true_when_username_exists(self, db_session):
        repo = ProfileRepository.from_session(db_session)
        await _seed_profile_with_username(db_session, "takenname")

        result = await repo.is_username_taken("takenname")

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_username_not_found(self, db_session):
        repo = ProfileRepository.from_session(db_session)

        result = await repo.is_username_taken("availablename")

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_false_when_username_belongs_to_exclude_user_id(
        self, db_session, test_user_id
    ):
        """
        Own username should not appear as taken.
        exclude_user_id skips the current user's own record.
        """
        repo = ProfileRepository.from_session(db_session)
        await _seed_profile_with_username(db_session, "myname", user_id=test_user_id)

        result = await repo.is_username_taken("myname", exclude_user_id=test_user_id)

        assert result is False

    @pytest.mark.asyncio
    async def test_returns_true_when_taken_by_different_user(
        self, db_session, test_user_id
    ):
        """
        Username taken by another user should still appear as taken
        even when exclude_user_id is provided for a different user.
        """
        repo = ProfileRepository.from_session(db_session)
        other_user_id = str(uuid.uuid4())
        await _seed_profile_with_username(db_session, "takenname", user_id=other_user_id)

        result = await repo.is_username_taken(
            "takenname", exclude_user_id=test_user_id
        )

        assert result is True

    @pytest.mark.asyncio
    async def test_case_insensitive_check(self, db_session):
        """Username taken check is case-insensitive."""
        repo = ProfileRepository.from_session(db_session)
        await _seed_profile_with_username(db_session, "takenname")

        result = await repo.is_username_taken("TAKENNAME")

        assert result is True

    @pytest.mark.asyncio
    async def test_no_exclude_user_id_checks_all_users(
        self, db_session, test_user_id
    ):
        """Without exclude_user_id, own username still appears as taken."""
        repo = ProfileRepository.from_session(db_session)
        await _seed_profile_with_username(db_session, "myname", user_id=test_user_id)

        result = await repo.is_username_taken("myname")

        assert result is True
