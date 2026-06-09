# apps/api/app/workers/prompts.py

# Centralised prompt templates — single source of truth across tasks.
# Workspace-level overrides take precedence over these defaults.

"""
Notes: If a workspace's custom_prompt is missing any of the three
mentioned placeholder({content}, {author_name}, {update_date})
str.format() will raise a KeyError at task runtime.
"""

DEFAULT_SUMMARISATION_PROMPT = """You are summarising a developer's async standup update.

The update was written by {author_name} on {update_date}.

Your task:
- Write a concise 1-3 sentence summary of what they worked on
- Use third person ("They worked on...", "Fixed...", "Completed...")
- Preserve any blockers or context that teammates need to know
- Do not add information not present in the original update
- Do not use bullet points — write in flowing prose
- Target length: 40-80 words

Update to summarise:
{content}

Summary:"""

DEFAULT_DIGEST_PROMPT = """You are generating a daily standup digest for a development team.

Team: {workspace_name}
Date: {digest_date}

Individual summaries from today:
{summaries}

Your task:
- Write a cohesive 3-5 sentence team digest
- Highlight themes, shared progress, and cross-cutting concerns
- Note any blockers that affect multiple team members
- Use a professional but conversational tone
- Do not list individuals by name — synthesise at the team level

Digest:"""


def build_summarisation_prompt(
    content: str,
    author_name: str | None,
    update_date: str,
    custom_prompt: str | None = None,
) -> str:
    """
    Build the final summarisation prompt.
    Uses workspace custom prompt if provided, falls back to default.

    Args:
        content:       Raw update text submitted by the user.
        author_name:   Display name of the update author.
        update_date:   ISO date string (YYYY-MM-DD) of the update.
        custom_prompt: Workspace-level override template. Must contain
                       {content}, {author_name}, and {update_date} placeholders.
                       If None, DEFAULT_SUMMARISATION_PROMPT is used.

    Returns:
        Fully-formatted prompt string ready to send to Claude.
    """
    template = custom_prompt or DEFAULT_SUMMARISATION_PROMPT
    return template.format(
        content=content,
        author_name=author_name or "the user",
        update_date=update_date,
    )


def build_digest_prompt(
    workspace_name: str,
    digest_date: str,
    summaries: str,
    custom_prompt: str | None = None,
) -> str:
    """
    Build the final digest prompt.
    Uses workspace custom prompt if provided, falls back to DEFAULT_DIGEST_PROMPT.

    Args:
        workspace_name: Name of the workspace being digested.
        digest_date:    ISO date string (YYYY-MM-DD).
        summaries:      Pre-formatted string of individual update summaries.
        custom_prompt:  Workspace-level override. Must contain
                        {workspace_name}, {digest_date}, {summaries} placeholders.

    Returns:
        Fully-formatted prompt string ready to send to Claude.
    """
    template = custom_prompt or DEFAULT_DIGEST_PROMPT
    return template.format(
        workspace_name=workspace_name,
        digest_date=digest_date,
        summaries=summaries,
    )
