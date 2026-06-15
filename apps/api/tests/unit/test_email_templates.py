# apps/api/tests/unit/test_email_templates.py
# Tests for Jinja2 email template rendering.
# No DB or external deps — pure rendering tests.

from app.lib.email import render_digest_email, render_invite_email


class TestRenderInviteEmail:
    def test_returns_html_string(self):
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Alice",
            invite_url="https://app.soarup.app/invite/abc123",
        )

        assert isinstance(html, str)
        assert len(html) > 0

    def test_contains_workspace_name(self):
        html = render_invite_email(
            workspace_name="Acme Corp",
            inviter_name="Alice",
            invite_url="https://app.soarup.app/invite/abc123",
        )

        assert "Acme Corp" in html

    def test_contains_inviter_name(self):
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Bob Smith",
            invite_url="https://app.soarup.app/invite/abc123",
        )

        assert "Bob Smith" in html

    def test_contains_invite_url(self):
        url = "https://app.soarup.app/invite/abc123"
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Alice",
            invite_url=url,
        )

        assert url in html

    def test_contains_expiry_days(self):
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Alice",
            invite_url="https://app.soarup.app/invite/abc123",
            expires_in_days=14,
        )

        assert "14" in html

    def test_default_expiry_is_7_days(self):
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Alice",
            invite_url="https://app.soarup.app/invite/abc123",
        )

        assert "7" in html

    def test_is_valid_html(self):
        html = render_invite_email(
            workspace_name="Acme",
            inviter_name="Alice",
            invite_url="https://app.soarup.app/invite/abc123",
        )

        assert "<!DOCTYPE html>" in html
        assert "</html>" in html


class TestRenderDigestEmail:
    def test_returns_html_string(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Great progress today.",
            items=[],
            unsubscribe_url="",
        )

        assert isinstance(html, str)
        assert len(html) > 0

    def test_contains_workspace_name(self):
        html = render_digest_email(
            workspace_name="Acme Corp",
            digest_date="2026-06-07",
            team_summary="Summary here.",
            items=[],
            unsubscribe_url="",
        )

        assert "Acme Corp" in html

    def test_contains_digest_date(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Summary.",
            items=[],
            unsubscribe_url="",
        )

        assert "2026-06-07" in html

    def test_team_summary_appears_in_output(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="The team crushed it today.",
            items=[],
            unsubscribe_url="",
        )

        assert "The team crushed it today." in html

    def test_renders_individual_items(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Good day.",
            items=[
                {"author_name": "Alice", "summary_snapshot": "Finished the API"},
                {"author_name": "Bob", "summary_snapshot": "Fixed the bug"},
            ],
            unsubscribe_url="",
        )

        assert "Alice" in html
        assert "Finished the API" in html
        assert "Bob" in html
        assert "Fixed the bug" in html

    def test_handles_empty_items_list(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Quiet day.",
            items=[],
            unsubscribe_url="",
        )

        assert isinstance(html, str)
        assert "Acme" in html

    def test_contains_unsubscribe_url_when_provided(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Summary.",
            items=[],
            unsubscribe_url="https://app.soarup.app/unsubscribe/token123",
        )

        assert "https://app.soarup.app/unsubscribe/token123" in html

    def test_is_valid_html(self):
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Summary.",
            items=[],
            unsubscribe_url="",
        )

        assert "<!DOCTYPE html>" in html
        assert "</html>" in html

    def test_handles_none_author_name(self):
        """author_name can be None — template should not crash."""
        html = render_digest_email(
            workspace_name="Acme",
            digest_date="2026-06-07",
            team_summary="Summary.",
            items=[{"author_name": None, "summary_snapshot": "Did some work"}],
            unsubscribe_url="",
        )

        assert "Did some work" in html
