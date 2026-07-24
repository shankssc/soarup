# apps/api/tests/workers/test_send_workspace_digest.py
# Tests for the digest send pipeline (_send_workspace_digest_async),
# focused specifically on the per-workspace email_notifications recipient
# filter and per-recipient unsubscribe token / send behavior introduced
# for #19 (CAN-SPAM/GDPR unsubscribe tokens).
#
# Strategy:
#   - Test _send_workspace_digest_async directly — no Celery worker needed
#   - All deferred imports patched at source module level, matching
#     test_process_update_task.py / test_process_audio_task.py
#   - Slack posting is deliberately kept out of scope for every test here —
#     workspace.slack_digest_enabled=False on the default fake workspace,
#     so that branch never fires and doesn't need mocking in this file.
#   - This file does NOT re-test HMAC token correctness (that's
#     test_unsubscribe.py) or the unsubscribe endpoint itself (that's
#     test_unsubscribe_endpoint.py) — only that _send_workspace_digest_async
#     calls generate_unsubscribe_token per-recipient and respects the
#     per-workspace email_notifications flag when building the recipient
#     list.

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.workers.tasks import _send_workspace_digest_async

pytestmark = pytest.mark.db

WORKSPACE_ID = "workspace-123"
DIGEST_DATE = "2026-05-21"
USER_A = "user-a"
USER_B = "user-b"
USER_C = "user-c"
MOCK_TEAM_SUMMARY = "The team shipped the auth flow and started on the dashboard."
MOCK_TOKEN = "fake-token"  # noqa: S105
MOCK_HTML = "<html>digest</html>"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_fake_workspace(
    workspace_id: str = WORKSPACE_ID,
    name: str = "Rocket Team",
    digest_prompt: str | None = None,
    slack_digest_enabled: bool = False,
    slack_webhook_url_encrypted: str | None = None,
) -> MagicMock:
    workspace = MagicMock()
    workspace.id = workspace_id
    workspace.name = name
    workspace.digest_prompt = digest_prompt
    workspace.slack_digest_enabled = slack_digest_enabled
    workspace.slack_webhook_url_encrypted = slack_webhook_url_encrypted
    return workspace


def make_fake_update(
    update_id: str,
    user_id: str,
    status: str = "processed",
    summary: str = "Did some work.",
    content: str = "Did some work.",
) -> MagicMock:
    update = MagicMock()
    update.id = update_id
    update.user_id = user_id
    update.status = status
    update.summary = summary
    update.content = content
    return update


def make_fake_profile(user_id: str, email: str | None, full_name: str = "Team Member") -> MagicMock:
    profile = MagicMock()
    profile.id = user_id
    profile.email = email
    profile.full_name = full_name
    return profile


def make_fake_member(user_id: str, email_notifications: bool = True) -> MagicMock:
    member = MagicMock()
    member.user_id = user_id
    member.email_notifications = email_notifications
    return member


def make_mock_task(retries: int = 0, max_retries: int = 2) -> MagicMock:
    task = MagicMock()
    task.request.retries = retries
    task.max_retries = max_retries
    task.db_engine = MagicMock()
    return task


def _make_mock_session_factory() -> tuple[MagicMock, AsyncMock]:
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)
    mock_factory = MagicMock()
    mock_factory.return_value = mock_session
    return mock_factory, mock_session


def _make_mock_digest_repo() -> MagicMock:
    digest = MagicMock()
    digest.id = "digest-1"

    repo = MagicMock()
    repo.get_for_workspace_date = AsyncMock(return_value=None)
    repo.create = AsyncMock(return_value=digest)
    repo.update_status = AsyncMock()
    repo.add_items = AsyncMock()
    return repo


# ---------------------------------------------------------------------------
# Patch targets — all deferred imports patched at source module level
# ---------------------------------------------------------------------------

_ASYNC_SESSIONMAKER = "sqlalchemy.ext.asyncio.async_sessionmaker"
_DIGEST_REPO = "app.repositories.digest_repo.DigestRepository"
_UPDATE_REPO = "app.repositories.update_repo.UpdateRepository"
_WORKSPACE_REPO = "app.repositories.workspace_repo.WorkspaceRepository"
_SUMMARISE = "app.lib.claude.summarise"
_RENDER_EMAIL = "app.lib.email.render_digest_email"
_SEND_EMAIL = "app.lib.email.send_digest_email"
_BUILD_PROMPT = "app.workers.prompts.build_digest_prompt"
_GEN_TOKEN = "app.lib.unsubscribe.generate_unsubscribe_token"  # Noqa: S105


# ---------------------------------------------------------------------------
# Central setup context
# ---------------------------------------------------------------------------


class _Mocks:
    def __init__(self):
        self.digest_repo = _make_mock_digest_repo()
        self.workspace_repo = MagicMock()
        self.update_repo = MagicMock()
        self.summarise = AsyncMock(return_value=MOCK_TEAM_SUMMARY)
        self.render_email = MagicMock(return_value=MOCK_HTML)
        self.send_email = AsyncMock(return_value=True)
        self.gen_token = MagicMock(return_value=MOCK_TOKEN)
        self.build_prompt = MagicMock(return_value="built-digest-prompt")


@pytest.fixture
def run_digest():
    """
    Yields a callable that runs _send_workspace_digest_async with the
    given inputs, applying all necessary patches, and returns the _Mocks
    instance for assertion.
    """

    async def _runner(workspace, updates, members_with_profiles):
        mocks = _Mocks()
        mock_factory, _ = _make_mock_session_factory()

        mocks.update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        mocks.workspace_repo.get_by_id = AsyncMock(return_value=workspace)
        mocks.workspace_repo.get_profiles_for_updates = AsyncMock(return_value={u.user_id: make_fake_profile(u.user_id, f"{u.user_id}@example.com") for u in updates})
        mocks.workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=members_with_profiles)

        task = make_mock_task()

        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_DIGEST_REPO) as digest_repo_cls,
            patch(_UPDATE_REPO) as update_repo_cls,
            patch(_WORKSPACE_REPO) as workspace_repo_cls,
            patch(_SUMMARISE, new=mocks.summarise),
            patch(_RENDER_EMAIL, new=mocks.render_email),
            patch(_SEND_EMAIL, new=mocks.send_email),
            patch(_BUILD_PROMPT, new=mocks.build_prompt),
            patch(_GEN_TOKEN, new=mocks.gen_token),
            patch("app.workers.tasks.settings.slack_integration_enabled", False),
            patch("app.workers.tasks.settings.app_base_url", "http://localhost:3000"),
            patch("app.workers.tasks.logger"),
        ):
            digest_repo_cls.from_session.return_value = mocks.digest_repo
            update_repo_cls.from_session.return_value = mocks.update_repo
            workspace_repo_cls.from_session.return_value = mocks.workspace_repo

            await _send_workspace_digest_async(task, workspace.id, DIGEST_DATE)

        return mocks

    return _runner


# ---------------------------------------------------------------------------
# Recipient filtering — the core #19-relevant behavior
# ---------------------------------------------------------------------------


class TestRecipientFiltering:
    @pytest.mark.asyncio
    async def test_opted_out_member_excluded_from_send(self, run_digest):
        """
        A member with email_notifications=False (i.e. previously clicked
        an unsubscribe link) must not receive a send_digest_email call —
        this is the actual compliance-relevant behavior #19 exists for.
        """
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
            (make_fake_member(USER_B, email_notifications=False), make_fake_profile(USER_B, "b@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        sent_to = [call.kwargs["to_emails"] for call in mocks.send_email.call_args_list]
        assert ["a@example.com"] in sent_to
        assert ["b@example.com"] not in sent_to
        assert mocks.send_email.await_count == 1

    @pytest.mark.asyncio
    async def test_opted_in_members_all_receive_send(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
            (make_fake_member(USER_B, email_notifications=True), make_fake_profile(USER_B, "b@example.com")),
            (make_fake_member(USER_C, email_notifications=True), make_fake_profile(USER_C, "c@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        assert mocks.send_email.await_count == 3

    @pytest.mark.asyncio
    async def test_member_with_no_email_excluded(self, run_digest):
        """Profile.email=None (never set, or removed) must not be sent to."""
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, None)),
        ]

        mocks = await run_digest(workspace, updates, members)

        mocks.send_email.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_member_with_missing_profile_excluded(self, run_digest):
        """
        outerjoin in get_workspace_members_with_profiles can return
        (member, None) if the profile row is missing — must not crash,
        must not send.
        """
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), None),
        ]

        mocks = await run_digest(workspace, updates, members)

        mocks.send_email.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_all_opted_out_results_in_no_sends_but_not_a_crash(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=False), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        mocks.send_email.assert_not_awaited()
        # Digest is still marked sent — generation succeeded, delivery to
        # zero eligible recipients is not itself a failure (matches the
        # existing to_emails-empty branch's pre-#19 behavior).
        status_calls = [c.kwargs.get("status") or (c.args[1] if len(c.args) > 1 else None) for c in mocks.digest_repo.update_status.call_args_list]
        assert "sent" in status_calls


# ---------------------------------------------------------------------------
# Unsubscribe token generation — per-recipient, not shared
# ---------------------------------------------------------------------------


class TestUnsubscribeTokenGeneration:
    @pytest.mark.asyncio
    async def test_token_generated_once_per_eligible_recipient(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
            (make_fake_member(USER_B, email_notifications=True), make_fake_profile(USER_B, "b@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        assert mocks.gen_token.call_count == 2

    @pytest.mark.asyncio
    async def test_token_not_generated_for_opted_out_member(self, run_digest):
        """
        Tokens shouldn't even be generated for excluded recipients — not
        strictly a security issue (an unused token is harmless), but
        confirms the filter runs before the send loop, not as a
        post-hoc skip inside it.
        """
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=False), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        mocks.gen_token.assert_not_called()

    @pytest.mark.asyncio
    async def test_token_generated_with_correct_workspace_and_user_ids(self, run_digest):
        workspace = make_fake_workspace(workspace_id=WORKSPACE_ID)
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        mocks.gen_token.assert_called_once_with(WORKSPACE_ID, USER_A)

    @pytest.mark.asyncio
    async def test_render_digest_email_receives_unsubscribe_url_containing_token(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        _, kwargs = mocks.render_email.call_args
        assert MOCK_TOKEN in kwargs["unsubscribe_url"]
        assert "/digests/unsubscribe/" in kwargs["unsubscribe_url"]


# ---------------------------------------------------------------------------
# Per-recipient send outcome → final digest status
# ---------------------------------------------------------------------------


class TestSendOutcomeStatus:
    @pytest.mark.asyncio
    async def test_all_sends_succeed_marks_digest_sent(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = await run_digest(workspace, updates, members)

        final_call = mocks.digest_repo.update_status.call_args_list[-1]
        assert final_call.kwargs.get("status") == "sent"

    @pytest.mark.asyncio
    async def test_all_sends_fail_marks_digest_failed(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
        ]

        mocks = _Mocks()
        mocks.send_email = AsyncMock(return_value=False)
        mock_factory, _ = _make_mock_session_factory()
        mocks.update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        mocks.workspace_repo.get_by_id = AsyncMock(return_value=workspace)
        mocks.workspace_repo.get_profiles_for_updates = AsyncMock(return_value={u.user_id: make_fake_profile(u.user_id, f"{u.user_id}@example.com") for u in updates})
        mocks.workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=members)

        task = make_mock_task()
        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_DIGEST_REPO) as digest_repo_cls,
            patch(_UPDATE_REPO) as update_repo_cls,
            patch(_WORKSPACE_REPO) as workspace_repo_cls,
            patch(_SUMMARISE, new=mocks.summarise),
            patch(_RENDER_EMAIL, new=mocks.render_email),
            patch(_SEND_EMAIL, new=mocks.send_email),
            patch(_BUILD_PROMPT, new=mocks.build_prompt),
            patch(_GEN_TOKEN, new=mocks.gen_token),
            patch("app.workers.tasks.settings.slack_integration_enabled", False),
            patch("app.workers.tasks.settings.app_base_url", "http://localhost:3000"),
            patch("app.workers.tasks.logger"),
        ):
            digest_repo_cls.from_session.return_value = mocks.digest_repo
            update_repo_cls.from_session.return_value = mocks.update_repo
            workspace_repo_cls.from_session.return_value = mocks.workspace_repo

            await _send_workspace_digest_async(task, workspace.id, DIGEST_DATE)

        final_call = mocks.digest_repo.update_status.call_args_list[-1]
        assert final_call.kwargs.get("status") == "failed"

    @pytest.mark.asyncio
    async def test_partial_send_failure_still_marks_sent(self, run_digest):
        """
        sent_count > 0 is the success criterion — if 2 of 3 recipients
        received the email, the digest as a whole is considered sent,
        not partially-failed. This matches pre-#19 batched-send semantics
        (a batch send either fully succeeds or fully fails per API call;
        per-recipient sending changes the granularity but not the
        overall pass/fail philosophy).
        """
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members = [
            (make_fake_member(USER_A, email_notifications=True), make_fake_profile(USER_A, "a@example.com")),
            (make_fake_member(USER_B, email_notifications=True), make_fake_profile(USER_B, "b@example.com")),
        ]

        mocks = _Mocks()
        mocks.send_email = AsyncMock(side_effect=[True, False])
        mock_factory, _ = _make_mock_session_factory()
        mocks.update_repo.get_workspace_updates_for_date = AsyncMock(return_value=updates)
        mocks.workspace_repo.get_by_id = AsyncMock(return_value=workspace)
        mocks.workspace_repo.get_profiles_for_updates = AsyncMock(return_value={u.user_id: make_fake_profile(u.user_id, f"{u.user_id}@example.com") for u in updates})
        mocks.workspace_repo.get_workspace_members_with_profiles = AsyncMock(return_value=members)

        task = make_mock_task()
        with (
            patch(_ASYNC_SESSIONMAKER, return_value=mock_factory),
            patch(_DIGEST_REPO) as digest_repo_cls,
            patch(_UPDATE_REPO) as update_repo_cls,
            patch(_WORKSPACE_REPO) as workspace_repo_cls,
            patch(_SUMMARISE, new=mocks.summarise),
            patch(_RENDER_EMAIL, new=mocks.render_email),
            patch(_SEND_EMAIL, new=mocks.send_email),
            patch(_BUILD_PROMPT, new=mocks.build_prompt),
            patch(_GEN_TOKEN, new=mocks.gen_token),
            patch("app.workers.tasks.settings.slack_integration_enabled", False),
            patch("app.workers.tasks.settings.app_base_url", "http://localhost:3000"),
            patch("app.workers.tasks.logger"),
        ):
            digest_repo_cls.from_session.return_value = mocks.digest_repo
            update_repo_cls.from_session.return_value = mocks.update_repo
            workspace_repo_cls.from_session.return_value = mocks.workspace_repo

            await _send_workspace_digest_async(task, workspace.id, DIGEST_DATE)

        assert mocks.send_email.await_count == 2
        final_call = mocks.digest_repo.update_status.call_args_list[-1]
        assert final_call.kwargs.get("status") == "sent"

    @pytest.mark.asyncio
    async def test_no_eligible_recipients_skips_render_and_send_entirely(self, run_digest):
        workspace = make_fake_workspace()
        updates = [make_fake_update("u-1", USER_A)]
        members: list[tuple[MagicMock, MagicMock]] = []

        mocks = await run_digest(workspace, updates, members)

        mocks.render_email.assert_not_called()
        mocks.send_email.assert_not_awaited()
        mocks.gen_token.assert_not_called()
