# apps/api/tests/unit/test_slack_blocks.py
# Unit tests for app/lib/slack_blocks.py
#
# Strategy:
#   - All three builders are pure functions (no DB, no network, no settings)
#   - Tested directly without fixtures
#   - Assertions focus on structure and content correctness

from app.lib.slack_blocks import (
    build_digest_blocks,
    build_test_blocks,
    build_update_notification_blocks,
)

WORKSPACE_NAME = "Rocket Team"
APP_URL = "http://localhost:3000"
DIGEST_DATE = "2026-06-07"
TEAM_SUMMARY = "The team made great progress today."
ITEMS = [
    {"author_name": "Alice Chen", "summary_snapshot": "Finished the auth flow."},
    {"author_name": "Bob Kim", "summary_snapshot": "Fixed the Redis bug."},
]


# ---------------------------------------------------------------------------
# build_digest_blocks()
# ---------------------------------------------------------------------------


class TestBuildDigestBlocks:
    def test_returns_list(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        assert isinstance(result, list)

    def test_first_block_is_header(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        assert result[0]["type"] == "header"

    def test_header_contains_workspace_name(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        assert WORKSPACE_NAME in result[0]["text"]["text"]

    def test_contains_dividers(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        dividers = [b for b in result if b["type"] == "divider"]
        assert len(dividers) >= 2

    def test_item_count_matches_items_param(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        alice_blocks = [t for t in section_texts if "Alice Chen" in t]
        bob_blocks = [t for t in section_texts if "Bob Kim" in t]
        assert len(alice_blocks) == 1
        assert len(bob_blocks) == 1

    def test_contains_team_summary(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        assert any(TEAM_SUMMARY in t for t in section_texts)

    def test_contains_view_in_soarup_action(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        action_blocks = [b for b in result if b["type"] == "actions"]
        assert len(action_blocks) == 1
        button_text = action_blocks[0]["elements"][0]["text"]["text"]
        assert "SoarUp" in button_text

    def test_action_url_includes_app_url(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        action_blocks = [b for b in result if b["type"] == "actions"]
        button_url = action_blocks[0]["elements"][0]["url"]
        assert APP_URL in button_url

    def test_empty_items_produces_no_member_sections(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=[],
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        assert not any("Alice" in t or "Bob" in t for t in section_texts)

    def test_item_with_null_author_uses_fallback(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=[{"author_name": None, "summary_snapshot": "Some work done."}],
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        assert any("A team member" in t for t in section_texts)

    def test_item_with_null_summary_uses_fallback(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=[{"author_name": "Alice", "summary_snapshot": None}],
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        assert any("No summary available" in t for t in section_texts)

    def test_context_block_shows_update_count(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=ITEMS,
            app_url=APP_URL,
        )
        context_blocks = [b for b in result if b["type"] == "context"]
        assert len(context_blocks) == 1
        assert "2" in context_blocks[0]["elements"][0]["text"]

    def test_singular_update_label(self):
        result = build_digest_blocks(
            workspace_name=WORKSPACE_NAME,
            digest_date=DIGEST_DATE,
            team_summary=TEAM_SUMMARY,
            items=[ITEMS[0]],
            app_url=APP_URL,
        )
        context_blocks = [b for b in result if b["type"] == "context"]
        context_text = context_blocks[0]["elements"][0]["text"]
        assert "1 update" in context_text
        assert "updates" not in context_text


# ---------------------------------------------------------------------------
# build_update_notification_blocks()
# ---------------------------------------------------------------------------


class TestBuildUpdateNotificationBlocks:
    def test_returns_list(self):
        result = build_update_notification_blocks(
            author_name="Alice Chen",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="Worked on the auth flow today.",
            summary="Completed auth flow work.",
            app_url=APP_URL,
        )
        assert isinstance(result, list)

    def test_contains_author_name(self):
        result = build_update_notification_blocks(
            author_name="Alice Chen",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="Worked on the auth flow today.",
            summary="Completed auth flow work.",
            app_url=APP_URL,
        )
        all_text = " ".join(b["text"]["text"] for b in result if b["type"] == "section" and "text" in b)
        assert "Alice Chen" in all_text

    def test_contains_content(self):
        content = "Worked on the auth flow today."
        result = build_update_notification_blocks(
            author_name="Alice Chen",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content=content,
            summary="Completed auth flow work.",
            app_url=APP_URL,
        )
        all_text = " ".join(b["text"]["text"] for b in result if b["type"] == "section" and "text" in b)
        assert content in all_text

    def test_contains_summary(self):
        summary = "Completed auth flow work."
        result = build_update_notification_blocks(
            author_name="Alice Chen",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="Worked on the auth flow today.",
            summary=summary,
            app_url=APP_URL,
        )
        all_text = " ".join(b["text"]["text"] for b in result if b["type"] == "section" and "text" in b)
        assert summary in all_text

    def test_text_mode_label(self):
        result = build_update_notification_blocks(
            author_name="Alice",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="content",
            summary="summary",
            app_url=APP_URL,
            mode="text",
        )
        first_section_text = result[0]["text"]["text"]
        assert "📝" in first_section_text

    def test_voice_mode_label(self):
        result = build_update_notification_blocks(
            author_name="Alice",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="transcript",
            summary="summary",
            app_url=APP_URL,
            mode="voice",
        )
        first_section_text = result[0]["text"]["text"]
        assert "🎙️" in first_section_text

    def test_contains_dashboard_action(self):
        result = build_update_notification_blocks(
            author_name="Alice",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="content",
            summary="summary",
            app_url=APP_URL,
        )
        action_blocks = [b for b in result if b["type"] == "actions"]
        assert len(action_blocks) == 1
        button_url = action_blocks[0]["elements"][0]["url"]
        assert APP_URL in button_url

    def test_contains_divider(self):
        result = build_update_notification_blocks(
            author_name="Alice",
            workspace_name=WORKSPACE_NAME,
            update_date=DIGEST_DATE,
            content="content",
            summary="summary",
            app_url=APP_URL,
        )
        dividers = [b for b in result if b["type"] == "divider"]
        assert len(dividers) >= 1


# ---------------------------------------------------------------------------
# build_test_blocks()
# ---------------------------------------------------------------------------


class TestBuildTestBlocks:
    def test_returns_list(self):
        result = build_test_blocks(
            workspace_name=WORKSPACE_NAME,
            app_url=APP_URL,
        )
        assert isinstance(result, list)

    def test_contains_sample_digest_date(self):
        result = build_test_blocks(
            workspace_name=WORKSPACE_NAME,
            app_url=APP_URL,
        )
        context_blocks = [b for b in result if b["type"] == "context"]
        assert len(context_blocks) == 1
        assert "Sample digest" in context_blocks[0]["elements"][0]["text"]

    def test_contains_workspace_name(self):
        result = build_test_blocks(
            workspace_name=WORKSPACE_NAME,
            app_url=APP_URL,
        )
        assert result[0]["text"]["text"].startswith("🚀")
        assert WORKSPACE_NAME in result[0]["text"]["text"]

    def test_contains_two_sample_members(self):
        result = build_test_blocks(
            workspace_name=WORKSPACE_NAME,
            app_url=APP_URL,
        )
        section_texts = [b["text"]["text"] for b in result if b["type"] == "section" and "text" in b]
        assert any("Alex Chen" in t for t in section_texts)
        assert any("Jordan Kim" in t for t in section_texts)

    def test_contains_view_in_soarup_action(self):
        result = build_test_blocks(
            workspace_name=WORKSPACE_NAME,
            app_url=APP_URL,
        )
        action_blocks = [b for b in result if b["type"] == "actions"]
        assert len(action_blocks) == 1
        assert "SoarUp" in action_blocks[0]["elements"][0]["text"]["text"]
