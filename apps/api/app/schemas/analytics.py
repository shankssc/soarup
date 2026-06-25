# apps/api/app/schemas/analytics.py

from pydantic import BaseModel


class HeatmapDay(BaseModel):
    """A single day in the heatmap grid."""

    date: str  # ISO date YYYY-MM-DD
    count: int  # submissions (personal) or distinct members (workspace)
    intensity: int  # 0–3: 0=none, 1=light, 2=medium, 3=high


class StreakResponse(BaseModel):
    current_streak: int
    best_streak: int
    total_submissions: int
    last_submission_date: str | None


class PersonalAnalyticsResponse(BaseModel):
    streak: StreakResponse
    heatmap: list[HeatmapDay]  # last 52 weeks = 364 days
    heatmap_weeks: int = 52


class MemberParticipationRow(BaseModel):
    user_id: str
    full_name: str | None
    avatar_url: str | None
    current_streak: int
    participation_rate_30d: float  # 0.0–1.0
    submissions_30d: int
    sparkline: list[int]  # last 14 days submission count per day


class TeamAnalyticsResponse(BaseModel):
    participation_rate_30d: float
    avg_updates_per_day_30d: float
    active_member_count: int
    members: list[MemberParticipationRow]
    workspace_heatmap: list[HeatmapDay]  # last 12 weeks = 84 days
    workspace_heatmap_weeks: int = 12
