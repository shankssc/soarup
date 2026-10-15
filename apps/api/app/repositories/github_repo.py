from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.github_installation import GitHubInstallation


class GitHubInstallationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    @classmethod
    def from_session(cls, db: AsyncSession) -> GitHubInstallationRepository:
        return cls(db)

    async def upsert(
        self,
        user_id: str,
        installation_id: int,
        account_login: str,
        account_type: str,
        github_login: str,
        status: str,
    ) -> GitHubInstallation:
        stmt = (
            pg_insert(GitHubInstallation)
            .values(
                id=str(uuid.uuid4()),
                user_id=user_id,
                installation_id=installation_id,
                account_login=account_login,
                account_type=account_type,
                github_login=github_login,
                status=status,
            )
            .on_conflict_do_update(
                index_elements=["installation_id"],
                set_={
                    "user_id": user_id,
                    "account_login": account_login,
                    "account_type": account_type,
                    "github_login": github_login,
                    "status": status,
                },
            )
        )
        await self.db.execute(stmt)
        await self.db.commit()

        fetch = await self.db.execute(select(GitHubInstallation).where(GitHubInstallation.installation_id == installation_id))
        return fetch.scalar_one()

    async def get_by_user_id(self, user_id: str) -> Sequence[GitHubInstallation]:
        result = await self.db.execute(
            select(GitHubInstallation).where(
                GitHubInstallation.user_id == user_id,
                GitHubInstallation.status != "revoked",
            )
        )
        return result.scalars().all()

    async def delete(self, installation_row_id: str, owner_user_id: str) -> None:
        await self.db.execute(
            delete(GitHubInstallation).where(
                GitHubInstallation.id == installation_row_id,
                GitHubInstallation.user_id == owner_user_id,
            )
        )
        await self.db.commit()
