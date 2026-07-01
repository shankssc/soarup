# apps/api/tests/unit/test_digest_repo.py
# Unit tests for DigestRepository against soarup_test DB.
#
# Strategy:
#   - Real DB session via db_session fixture (SAVEPOINT rollback)
#   - seeded_profile + seeded_workspace satisfy FK constraints
#   - Direct ORM flush used for setup rows to avoid committing
#     outside the SAVEPOINT boundary
#
# Prerequisites:
#   - supabase start running (Postgres on port 54322)
#   - soarup_test DB exists with alembic upgrade head applied

import uuid

import pytest

from app.models.digest import Digest
from app.models.update import Update

pytestmark = pytest.mark.db

TODAY = "2026-06-07"
OTHER_DATE = "2026-06-08"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_digest(
    db_session,
    workspace_id: str,
    digest_date: str = TODAY,
    status: str = "pending",
) -> Digest:
    """Insert a Digest row directly via flush."""
    digest = Digest(
        workspace_id=workspace_id,
        digest_date=digest_date,
        status=status,
        update_count=0,
    )
    db_session.add(digest)
    await db_session.flush()
    return digest


async def _create_update(
    db_session,
    workspace_id: str,
    user_id: str,
    update_date: str = TODAY,
    status: str = "processed",
    content: str = "Today I worked on X",
    summary: str = "Worked on X",
) -> Update:
    """Insert an Update row directly via flush."""
    update = Update(
        workspace_id=workspace_id,
        user_id=user_id,
        content=content,
        update_date=update_date,
        mode="text",
        status=status,
        summary=summary,
    )
    db_session.add(update)
    await db_session.flush()
    return update


# ---------------------------------------------------------------------------
# create()
# ---------------------------------------------------------------------------


class TestCreate:
    @pytest.mark.asyncio
    async def test_create_returns_digest(self, digest_repo, seeded_workspace):
        digest = await digest_repo.create(
            workspace_id=seeded_workspace.id,
            digest_date=TODAY,
        )

        assert digest.id is not None
        assert digest.workspace_id == seeded_workspace.id
        assert digest.digest_date == TODAY

    @pytest.mark.asyncio
    async def test_create_defaults_status_to_pending(self, digest_repo, seeded_workspace):
        digest = await digest_repo.create(
            workspace_id=seeded_workspace.id,
            digest_date=TODAY,
        )

        assert digest.status == "pending"

    @pytest.mark.asyncio
    async def test_create_defaults_update_count_to_zero(self, digest_repo, seeded_workspace):
        digest = await digest_repo.create(
            workspace_id=seeded_workspace.id,
            digest_date=TODAY,
        )

        assert digest.update_count == 0

    @pytest.mark.asyncio
    async def test_create_generates_uuid(self, digest_repo, seeded_workspace):
        digest = await digest_repo.create(
            workspace_id=seeded_workspace.id,
            digest_date=TODAY,
        )

        assert len(digest.id) == 36

    @pytest.mark.asyncio
    async def test_create_sets_created_at(self, digest_repo, seeded_workspace):
        digest = await digest_repo.create(
            workspace_id=seeded_workspace.id,
            digest_date=TODAY,
        )

        assert digest.created_at is not None


# ---------------------------------------------------------------------------
# get_by_id()
# ---------------------------------------------------------------------------


class TestGetById:
    @pytest.mark.asyncio
    async def test_get_by_id_returns_digest(self, digest_repo, db_session, seeded_workspace):
        created = await _create_digest(db_session, seeded_workspace.id)

        found = await digest_repo.get_by_id(created.id)

        assert found is not None
        assert found.id == created.id
        assert found.digest_date == TODAY

    @pytest.mark.asyncio
    async def test_get_by_id_returns_none_for_missing(self, digest_repo):
        result = await digest_repo.get_by_id("nonexistent-id")

        assert result is None


# ---------------------------------------------------------------------------
# get_for_workspace_date()
# ---------------------------------------------------------------------------


class TestGetForWorkspaceDate:
    @pytest.mark.asyncio
    async def test_returns_digest_for_matching_date(self, digest_repo, db_session, seeded_workspace):
        await _create_digest(db_session, seeded_workspace.id, TODAY)

        result = await digest_repo.get_for_workspace_date(seeded_workspace.id, TODAY)

        assert result is not None
        assert result.digest_date == TODAY
        assert result.workspace_id == seeded_workspace.id

    @pytest.mark.asyncio
    async def test_returns_none_when_no_digest_for_date(self, digest_repo, seeded_workspace):
        result = await digest_repo.get_for_workspace_date(seeded_workspace.id, "2099-01-01")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_different_workspace(self, digest_repo, db_session, seeded_workspace):
        await _create_digest(db_session, seeded_workspace.id, TODAY)

        result = await digest_repo.get_for_workspace_date("other-workspace-id", TODAY)

        assert result is None

    @pytest.mark.asyncio
    async def test_idempotency_check_finds_sent_digest(self, digest_repo, db_session, seeded_workspace):
        """Simulates the task idempotency check — sent digest found, skip re-send."""
        await _create_digest(db_session, seeded_workspace.id, TODAY, status="sent")

        result = await digest_repo.get_for_workspace_date(seeded_workspace.id, TODAY)

        assert result is not None
        assert result.status == "sent"


# ---------------------------------------------------------------------------
# get_workspace_digests() — cursor pagination
# ---------------------------------------------------------------------------


class TestGetWorkspaceDigests:
    @pytest.mark.asyncio
    async def test_returns_digests_for_workspace(self, digest_repo, db_session, seeded_workspace):
        await _create_digest(db_session, seeded_workspace.id, TODAY)
        await _create_digest(db_session, seeded_workspace.id, OTHER_DATE)

        digests, next_cursor, total = await digest_repo.get_workspace_digests(seeded_workspace.id)

        assert len(digests) == 2
        assert total == 2
        assert next_cursor is None

    @pytest.mark.asyncio
    async def test_returns_empty_for_workspace_with_no_digests(self, digest_repo, seeded_workspace):
        digests, next_cursor, total = await digest_repo.get_workspace_digests(seeded_workspace.id)

        assert digests == []
        assert next_cursor is None
        assert total == 0

    @pytest.mark.asyncio
    async def test_ordered_by_created_at_desc(self, digest_repo, db_session, seeded_workspace):
        await _create_digest(db_session, seeded_workspace.id, TODAY)
        await _create_digest(db_session, seeded_workspace.id, OTHER_DATE)

        digests, _, _ = await digest_repo.get_workspace_digests(seeded_workspace.id)

        assert digests[0].created_at >= digests[1].created_at

    @pytest.mark.asyncio
    async def test_cursor_pagination_returns_next_cursor(self, digest_repo, db_session, seeded_workspace):
        """With limit=1 and 2 digests, next_cursor should be set."""
        await _create_digest(db_session, seeded_workspace.id, TODAY)
        await _create_digest(db_session, seeded_workspace.id, OTHER_DATE)

        digests, next_cursor, total = await digest_repo.get_workspace_digests(seeded_workspace.id, limit=1)

        assert len(digests) == 1
        assert next_cursor is not None
        assert total == 2

    @pytest.mark.asyncio
    async def test_cursor_pagination_second_page(self, digest_repo, db_session, seeded_workspace):
        """Using cursor from first page returns the second page."""
        await _create_digest(db_session, seeded_workspace.id, TODAY)
        await _create_digest(db_session, seeded_workspace.id, OTHER_DATE)

        _, cursor, _ = await digest_repo.get_workspace_digests(seeded_workspace.id, limit=1)
        second_page, next_cursor, _ = await digest_repo.get_workspace_digests(seeded_workspace.id, cursor=cursor, limit=1)

        assert len(second_page) == 1
        assert next_cursor is None

    @pytest.mark.asyncio
    async def test_malformed_cursor_returns_from_beginning(self, digest_repo, db_session, seeded_workspace):
        """Malformed cursor is ignored — returns from the start."""
        await _create_digest(db_session, seeded_workspace.id, TODAY)

        digests, _, total = await digest_repo.get_workspace_digests(seeded_workspace.id, cursor="not-a-valid-cursor")

        assert total == 1
        assert len(digests) == 1

    @pytest.mark.asyncio
    async def test_does_not_return_other_workspace_digests(self, digest_repo, db_session, seeded_workspace, seeded_profile, test_user_id):
        """Digests from another workspace are excluded."""
        from app.models.workspace import Workspace

        other_workspace = Workspace(
            owner_id=test_user_id,
            name="Other WS",
            slug=f"other-ws-{uuid.uuid4().hex[:6]}",
            plan="free",
        )  # type: ignore[call-arg]
        db_session.add(other_workspace)
        await db_session.flush()

        await _create_digest(db_session, seeded_workspace.id, TODAY)
        await _create_digest(db_session, other_workspace.id, TODAY)

        digests, _, total = await digest_repo.get_workspace_digests(seeded_workspace.id)

        assert total == 1
        assert all(d.workspace_id == seeded_workspace.id for d in digests)


# ---------------------------------------------------------------------------
# add_items() + get_items()
# ---------------------------------------------------------------------------


class TestAddAndGetItems:
    @pytest.mark.asyncio
    async def test_add_items_creates_digest_items(self, digest_repo, db_session, seeded_workspace, test_user_id):
        digest = await _create_digest(db_session, seeded_workspace.id)
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        items = await digest_repo.add_items(
            digest.id,
            [{"update_id": update.id, "author_name": "Test User", "summary_snapshot": "Worked on X"}],
        )

        assert len(items) == 1
        assert items[0].digest_id == digest.id
        assert items[0].update_id == update.id
        assert items[0].author_name == "Test User"
        assert items[0].summary_snapshot == "Worked on X"

    @pytest.mark.asyncio
    async def test_add_items_bulk_insert(self, digest_repo, db_session, seeded_workspace, test_user_id):
        """Multiple items inserted in one call."""
        digest = await _create_digest(db_session, seeded_workspace.id)
        update1 = await _create_update(db_session, seeded_workspace.id, test_user_id, content="Update 1")

        other_user_id = str(uuid.uuid4())
        from app.models.profile import Profile

        db_session.add(
            Profile(
                id=other_user_id,
                full_name="Other",
                email_notifications=True,
                timezone="UTC",
            )
        )  # type: ignore[call-arg]
        await db_session.flush()

        update2 = await _create_update(
            db_session,
            seeded_workspace.id,
            other_user_id,
            content="Update 2",
        )

        items = await digest_repo.add_items(
            digest.id,
            [
                {"update_id": update1.id, "author_name": "User One", "summary_snapshot": "Did X"},
                {"update_id": update2.id, "author_name": "User Two", "summary_snapshot": "Did Y"},
            ],
        )

        assert len(items) == 2

    @pytest.mark.asyncio
    async def test_get_items_returns_items_for_digest(self, digest_repo, db_session, seeded_workspace, test_user_id):
        digest = await _create_digest(db_session, seeded_workspace.id)
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)
        await digest_repo.add_items(
            digest.id,
            [{"update_id": update.id, "author_name": "Test User", "summary_snapshot": "Did X"}],
        )

        items = await digest_repo.get_items(digest.id)

        assert len(items) == 1
        assert items[0].update_id == update.id

    @pytest.mark.asyncio
    async def test_get_items_returns_empty_for_digest_with_no_items(self, digest_repo, db_session, seeded_workspace):
        digest = await _create_digest(db_session, seeded_workspace.id)

        items = await digest_repo.get_items(digest.id)

        assert items == []

    @pytest.mark.asyncio
    async def test_add_items_handles_null_fields(self, digest_repo, db_session, seeded_workspace, test_user_id):
        """author_name and summary_snapshot are nullable."""
        digest = await _create_digest(db_session, seeded_workspace.id)
        update = await _create_update(db_session, seeded_workspace.id, test_user_id)

        items = await digest_repo.add_items(
            digest.id,
            [{"update_id": update.id, "author_name": None, "summary_snapshot": None}],
        )

        assert items[0].author_name is None
        assert items[0].summary_snapshot is None


# ---------------------------------------------------------------------------
# update_status()
# ---------------------------------------------------------------------------


class TestUpdateStatus:
    @pytest.mark.asyncio
    async def test_update_status_changes_status(self, digest_repo, db_session, seeded_workspace):
        digest = await _create_digest(db_session, seeded_workspace.id)

        updated = await digest_repo.update_status(digest.id, status="processing")

        assert updated is not None
        assert updated.status == "processing"

    @pytest.mark.asyncio
    async def test_update_status_sets_summary(self, digest_repo, db_session, seeded_workspace):
        digest = await _create_digest(db_session, seeded_workspace.id)

        updated = await digest_repo.update_status(digest.id, status="sent", summary="Team made great progress today.")

        assert updated.summary == "Team made great progress today."

    @pytest.mark.asyncio
    async def test_update_status_sets_update_count(self, digest_repo, db_session, seeded_workspace):
        digest = await _create_digest(db_session, seeded_workspace.id)

        updated = await digest_repo.update_status(digest.id, status="sent", update_count=3)

        assert updated.update_count == 3

    @pytest.mark.asyncio
    async def test_update_status_sets_email_sent_at(self, digest_repo, db_session, seeded_workspace):
        from datetime import UTC, datetime

        digest = await _create_digest(db_session, seeded_workspace.id)
        now = datetime.now(UTC)

        updated = await digest_repo.update_status(digest.id, status="sent", email_sent_at=now)

        assert updated.email_sent_at is not None

    @pytest.mark.asyncio
    async def test_update_status_returns_none_for_missing_digest(self, digest_repo):
        result = await digest_repo.update_status("nonexistent-id", status="sent")

        assert result is None

    @pytest.mark.asyncio
    async def test_update_status_only_updates_provided_fields(self, digest_repo, db_session, seeded_workspace):
        """Fields not passed remain unchanged."""
        digest = await _create_digest(db_session, seeded_workspace.id)

        updated = await digest_repo.update_status(digest.id, status="processing")

        assert updated.summary is None
        assert updated.update_count == 0
        assert updated.email_sent_at is None

    @pytest.mark.asyncio
    async def test_status_transitions(self, digest_repo, db_session, seeded_workspace):
        """pending → processing → sent full transition."""
        digest = await _create_digest(db_session, seeded_workspace.id)

        await digest_repo.update_status(digest.id, status="processing")
        final = await digest_repo.update_status(digest.id, status="sent")

        assert final.status == "sent"

    @pytest.mark.asyncio
    async def test_update_status_sets_delivered_to_slack(self, digest_repo, db_session, seeded_workspace):
        digest = await _create_digest(db_session, seeded_workspace.id)

        updated = await digest_repo.update_status(digest.id, status="sent", delivered_to_slack=True)

        assert updated.delivered_to_slack is True

    @pytest.mark.asyncio
    async def test_update_status_sets_slack_delivered_at(self, digest_repo, db_session, seeded_workspace):
        from datetime import UTC, datetime

        digest = await _create_digest(db_session, seeded_workspace.id)
        now = datetime.now(UTC)

        updated = await digest_repo.update_status(digest.id, status="sent", slack_delivered_at=now)

        assert updated.slack_delivered_at is not None
