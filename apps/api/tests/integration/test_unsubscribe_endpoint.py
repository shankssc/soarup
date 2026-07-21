# apps/api/tests/integration/test_unsubscribe_endpoint.py
# Integration tests for GET /api/v1/digests/unsubscribe/{token}
#
# Strategy:
#   - No auth dependencies to override — this endpoint is deliberately public.
#   - get_redis_client is NOT touched here — this endpoint never uses Redis.
#   - WorkspaceRepository is exercised for real against db_session (the
#     nested-SAVEPOINT test DB fixture), not mocked — seeded via the
#     seeded_profile / seeded_workspace fixtures already in conftest.py,
#     plus a real WorkspaceMember row created per test.
#   - Real tokens are generated via generate_unsubscribe_token, not
#     hand-constructed — this file trusts app/lib/unsubscribe.py's own
#     unit tests (test_unsubscribe.py) for token-forgery edge cases and
#     focuses instead on the router's behavior given valid/invalid tokens.

from typing import Any, cast
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.db.session import get_db_session
from app.lib.unsubscribe import generate_unsubscribe_token
from app.main import create_app
from app.models.workspace import WorkspaceMember

pytestmark = pytest.mark.db

TEST_KEY = "test-unsubscribe-secret-key-do-not-use-in-prod"  # noqa: S105


@pytest.fixture(autouse=True)
def unsubscribe_key():
    with patch(
        "app.lib.unsubscribe.settings.unsubscribe_secret_key",
        SecretStr(TEST_KEY),
    ):
        yield


@pytest_asyncio.fixture
async def seeded_member(db_session, seeded_workspace, test_user_id):
    """
    A real WorkspaceMember row — seeded_workspace's owner is already a
    member by virtue of workspace creation in most flows, but this test
    file creates the membership explicitly so email_notifications starts
    from a known True default regardless of how workspace creation itself
    behaves.
    """
    member = WorkspaceMember(
        workspace_id=seeded_workspace.id,
        user_id=test_user_id,
        role="member",
        email_notifications=True,
    )
    db_session.add(member)
    await db_session.flush()
    return member


@pytest.fixture
async def client(db_session):
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(
        transport=ASGITransport(app=cast(Any, app)),
        base_url="http://test",
        follow_redirects=False,
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


class TestUnsubscribeValidToken:
    @pytest.mark.asyncio
    async def test_valid_token_redirects_to_success(self, client, seeded_member, seeded_workspace, test_user_id):
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)

        response = await client.get(f"/api/v1/digests/unsubscribe/{token}")

        assert response.status_code == 302
        assert "/unsubscribe/success" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_valid_token_includes_workspace_id_in_redirect(self, client, seeded_member, seeded_workspace, test_user_id):
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)

        response = await client.get(f"/api/v1/digests/unsubscribe/{token}")

        assert f"workspace={seeded_workspace.id}" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_valid_token_flips_email_notifications_off(self, client, db_session, seeded_member, seeded_workspace, test_user_id):
        """
        The actual compliance-relevant assertion — confirms the flag is
        genuinely persisted, not just that a redirect happened.
        """
        assert seeded_member.email_notifications is True

        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)
        await client.get(f"/api/v1/digests/unsubscribe/{token}")

        await db_session.refresh(seeded_member)
        assert seeded_member.email_notifications is False

    @pytest.mark.asyncio
    async def test_unsubscribing_does_not_affect_other_members(self, client, db_session, seeded_workspace, test_user_id):
        """
        Confirms the per-workspace flag is scoped to the individual member
        row, not accidentally applied workspace-wide or to any other user.
        """
        import uuid

        from app.models.profile import Profile

        other_user_id = str(uuid.uuid4())
        other_profile = Profile(id=other_user_id, full_name="Other User", email_notifications=True, timezone="UTC")
        db_session.add(other_profile)

        member = WorkspaceMember(workspace_id=seeded_workspace.id, user_id=test_user_id, role="member", email_notifications=True)
        other_member = WorkspaceMember(workspace_id=seeded_workspace.id, user_id=other_user_id, role="member", email_notifications=True)
        db_session.add_all([member, other_member])
        await db_session.flush()

        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)
        await client.get(f"/api/v1/digests/unsubscribe/{token}")

        await db_session.refresh(member)
        await db_session.refresh(other_member)
        assert member.email_notifications is False
        assert other_member.email_notifications is True


class TestUnsubscribeInvalidToken:
    @pytest.mark.asyncio
    async def test_malformed_token_redirects_to_invalid(self, client):
        response = await client.get("/api/v1/digests/unsubscribe/not-a-real-token")

        assert response.status_code == 302
        assert "/unsubscribe/invalid" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_tampered_token_redirects_to_invalid(self, client, seeded_member, seeded_workspace, test_user_id):
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)
        payload_b64, signature_b64 = token.split(".", 1)
        tampered = f"{payload_b64}.{signature_b64}x"

        response = await client.get(f"/api/v1/digests/unsubscribe/{tampered}")

        assert response.status_code == 302
        assert "/unsubscribe/invalid" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_tampered_token_does_not_flip_flag(self, client, db_session, seeded_member, seeded_workspace, test_user_id):
        """
        The security-critical negative case — a forged/tampered token must
        not be able to unsubscribe anyone, not even accidentally.
        """
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)
        payload_b64, signature_b64 = token.split(".", 1)
        tampered = f"{payload_b64}.{signature_b64}x"

        await client.get(f"/api/v1/digests/unsubscribe/{tampered}")

        await db_session.refresh(seeded_member)
        assert seeded_member.email_notifications is True

    @pytest.mark.asyncio
    async def test_token_signed_with_wrong_key_redirects_to_invalid(self, client, seeded_workspace, test_user_id):
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)

        with patch(
            "app.lib.unsubscribe.settings.unsubscribe_secret_key",
            SecretStr("a-different-secret-entirely"),
        ):
            response = await client.get(f"/api/v1/digests/unsubscribe/{token}")

        assert response.status_code == 302
        assert "/unsubscribe/invalid" in response.headers["location"]


class TestUnsubscribeStaleMembership:
    @pytest.mark.asyncio
    async def test_valid_token_but_no_membership_redirects_to_success(self, client, seeded_workspace, test_user_id):
        """
        A validly-signed token for a membership that no longer exists
        (e.g. the user left the workspace after the digest was sent, or
        the workspace/membership was deleted) should still redirect to
        success — from the recipient's perspective there's nothing to
        unsubscribe from, which is itself a successful outcome, not an
        error.
        """
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)
        # Deliberately NOT seeding a WorkspaceMember row for this user.

        response = await client.get(f"/api/v1/digests/unsubscribe/{token}")

        assert response.status_code == 302
        assert "/unsubscribe/success" in response.headers["location"]

    @pytest.mark.asyncio
    async def test_stale_membership_redirect_has_no_workspace_param(self, client, seeded_workspace, test_user_id):
        """
        Distinguishes the two success paths in the router: a real
        unsubscribe includes ?workspace= in the redirect, the stale/no-op
        path does not (per the router's own two separate return statements).
        """
        token = generate_unsubscribe_token(seeded_workspace.id, test_user_id)

        response = await client.get(f"/api/v1/digests/unsubscribe/{token}")

        assert "workspace=" not in response.headers["location"]
